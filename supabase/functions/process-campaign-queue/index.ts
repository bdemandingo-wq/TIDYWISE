// process-campaign-queue
//
// PGMQ worker for campaign SMS. Modelled on process-email-queue: same
// read/delete/archive discipline, same retry budget, same visibility-timeout
// handling, same defensive logging.
//
// Takes no request body — the dispatcher invokes it with {}.
//
// Order of operations per invocation matters:
//   expire -> start -> skip paused -> throttle -> re-check opt-out -> send
// Expiring before reading any message means a stale run structurally cannot
// emit a message rather than relying on a check that might be skipped.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { isOptedOut } from '../_shared/marketing-guard.ts'

const QUEUE = 'campaign_sms'
const DLQ = 'campaign_sms_dlq'
const VISIBILITY_TIMEOUT_SECONDS = 120
const MAX_RETRIES = 5
const PURGE_BATCH = 100
const PURGE_MAX_BATCHES = 50
// Completion race guards. campaign_queue_wake fires AFTER INSERT on
// campaign_runs, so the first tick can land before the caller has enqueued any
// recipients. An empty queue therefore is NOT completion — see the progress
// check below. total_recipients MUST be set in the same INSERT that creates the
// run, never by a follow-up UPDATE.
const EMPTY_RUN_GRACE_MS = 30_000
const STALL_TIMEOUT_MS = 5 * 60_000
const MAX_SKIPS_PER_TICK = 50

interface CampaignMessage {
  run_id: string
  campaign_id: string
  organization_id: string
  customer_id: string
  phone: string
  first_name: string
  last_name: string
  message_template: string
}

interface QueueRow {
  msg_id: number
  read_ct: number
  message: CampaignMessage
}

interface CampaignRun {
  id: string
  campaign_id: string
  organization_id: string
  status: string
  throttle_seconds: number
  scheduled_at: string | null
  expires_at: string
  next_send_at: string | null
  created_at: string
  started_at: string | null
  total_recipients: number | null
  sent_count: number
  failed_count: number
  skipped_opted_out_count: number
}

// The generated Database types are not imported here; the untyped client keeps
// PostgREST calls permissive the same way the other queue workers do.
// deno-lint-ignore no-explicit-any
type Supa = any

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

function normalizePhone(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '')
  if (!digits.startsWith('1') && digits.length === 10) digits = '1' + digits
  return '+' + digits
}

async function deleteMessage(supabase: Supa, msgId: number, runId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_email', { queue_name: QUEUE, message_id: msgId })
  if (error) {
    console.error('[process-campaign-queue] Failed to delete message from queue', {
      run_id: runId,
      msg_id: msgId,
      error: error.message,
    })
  }
}

async function moveToDlq(
  supabase: Supa,
  msg: QueueRow,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('move_to_dlq', {
    source_queue: QUEUE,
    dlq_name: DLQ,
    message_id: msg.msg_id,
    payload: msg.message as unknown as Record<string, unknown>,
  })
  if (error) {
    console.error('[process-campaign-queue] Failed to move message to DLQ', {
      run_id: msg.message?.run_id,
      msg_id: msg.msg_id,
      reason,
      error: error.message,
    })
  } else {
    console.warn('[process-campaign-queue] Moved message to DLQ', {
      run_id: msg.message?.run_id,
      msg_id: msg.msg_id,
      reason,
    })
  }
}

// Drain any queued messages that belong to a cancelled/expired run.
// Messages for other runs are read with a 1s visibility timeout so they come
// straight back and are not delayed by the purge.
async function purgeRunMessages(supabase: Supa, runId: string): Promise<number> {
  let purged = 0
  for (let batch = 0; batch < PURGE_MAX_BATCHES; batch++) {
    const { data, error } = await supabase.rpc('read_email_batch', {
      queue_name: QUEUE,
      batch_size: PURGE_BATCH,
      vt: 1,
    })
    if (error) {
      console.error('[process-campaign-queue] Purge read failed', { run_id: runId, error: error.message })
      return purged
    }
    const rows = (data ?? []) as QueueRow[]
    if (rows.length === 0) return purged

    const mine = rows.filter((r) => r?.message?.run_id === runId)
    for (const row of mine) {
      await deleteMessage(supabase, row.msg_id, runId)
      purged++
    }
    if (rows.length < PURGE_BATCH) return purged
    if (mine.length === 0) return purged
  }
  return purged
}

// Record the outbound campaign send into the Messages tab immediately, keyed on
// openphone_message_id. The openphone-webhook inserts the same message later —
// keying on that id makes the webhook update this row instead of duplicating it.
async function upsertOutboundMessage(
  supabase: Supa,
  organizationId: string,
  phone: string,
  customerName: string,
  content: string,
  openphoneMessageId: string | null,
  runId: string,
): Promise<void> {
  if (!openphoneMessageId) return
  try {
    const nowIso = new Date().toISOString()

    let { data: conv } = await supabase
      .from('sms_conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('customer_phone', phone)
      .maybeSingle()

    let conversationId = conv?.id as string | undefined
    if (!conversationId) {
      const { data: newConv, error: convErr } = await supabase
        .from('sms_conversations')
        .insert({
          organization_id: organizationId,
          customer_phone: phone,
          customer_name: customerName || null,
          last_message_at: nowIso,
        })
        .select('id')
        .single()
      if (convErr) {
        console.error('[process-campaign-queue] Failed to create conversation', {
          run_id: runId,
          error: convErr.message,
        })
        return
      }
      conversationId = newConv?.id as string | undefined
    }
    if (!conversationId) return

    const { data: existing } = await supabase
      .from('sms_messages')
      .select('id')
      .eq('openphone_message_id', openphoneMessageId)
      .maybeSingle()

    const row = {
      conversation_id: conversationId,
      organization_id: organizationId,
      direction: 'outbound',
      content,
      status: 'sent',
      delivery_status: 'sent',
      openphone_message_id: openphoneMessageId,
      sent_at: nowIso,
    }

    if (existing?.id) {
      await supabase.from('sms_messages').update(row).eq('id', existing.id)
    } else {
      const { error: insErr } = await supabase.from('sms_messages').insert(row)
      if (insErr) {
        console.error('[process-campaign-queue] Failed to insert sms_messages row', {
          run_id: runId,
          error: insErr.message,
        })
      }
    }

    await supabase
      .from('sms_conversations')
      .update({ last_message_at: nowIso })
      .eq('id', conversationId)
  } catch (err) {
    console.error('[process-campaign-queue] Message mirror failed', {
      run_id: runId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[process-campaign-queue] Missing required environment variables')
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const claims = parseJwtClaims(authHeader.slice('Bearer '.length).trim())
  if (claims?.role !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase: Supa = createClient(supabaseUrl, supabaseServiceKey)
  const projectUrl =
    Deno.env.get('APP_URL') || Deno.env.get('PROJECT_URL') || 'https://jointidywise.com'

  const summary = { expired: 0, started: 0, sent: 0, failed: 0, skipped_opted_out: 0, completed: 0, stalled: 0 }

  // 1. Load candidate runs
  const { data: runsData, error: runsError } = await supabase
    .from('campaign_runs')
    .select(
      'id, campaign_id, organization_id, status, throttle_seconds, scheduled_at, expires_at, next_send_at, created_at, started_at, total_recipients, sent_count, failed_count, skipped_opted_out_count',
    )
    .in('status', ['pending', 'running', 'paused'])
    .order('created_at', { ascending: true })

  if (runsError) {
    console.error('[process-campaign-queue] Failed to load campaign runs', { error: runsError.message })
    return new Response(JSON.stringify({ error: 'Failed to load campaign runs' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const runs = (runsData ?? []) as unknown as CampaignRun[]

  // PHASE 1 — expire, start, skip paused, decide who is due.
  // Nothing is read off the queue in this phase: expiry must be able to purge a
  // run's messages while they are all still visible.
  const dueRuns: CampaignRun[] = []

  for (const run of runs) {
    // Isolation: one run blowing up must never abort the others.
    try {
      const now = new Date()
      const nowIso = now.toISOString()

      // 2. EXPIRE FIRST — before any send can happen.
      if (run.expires_at && now > new Date(run.expires_at)) {
        const { error: expErr } = await supabase
          .from('campaign_runs')
          .update({ status: 'cancelled', cancel_reason: 'expired', completed_at: nowIso })
          .eq('id', run.id)
        if (expErr) {
          console.error('[process-campaign-queue] Failed to mark run expired', {
            run_id: run.id,
            error: expErr.message,
          })
        }
        const purged = await purgeRunMessages(supabase, run.id)
        console.warn('[process-campaign-queue] Run expired and purged', {
          run_id: run.id,
          purged,
        })
        summary.expired++
        continue
      }

      // 4. SKIP PAUSED — queued messages stay untouched so the run resumes exactly
      // where it stopped.
      if (run.status === 'paused') continue

      let status = run.status
      let nextSendAt = run.next_send_at

      // 3. START pending runs that are due.
      if (status === 'pending') {
        if (run.scheduled_at && new Date(run.scheduled_at) > now) continue
        const { error: startErr } = await supabase
          .from('campaign_runs')
          .update({ status: 'running', started_at: nowIso, next_send_at: nowIso })
          .eq('id', run.id)
        if (startErr) {
          console.error('[process-campaign-queue] Failed to start run', {
            run_id: run.id,
            error: startErr.message,
          })
          continue
        }
        status = 'running'
        nextSendAt = nowIso
        summary.started++
      }

      if (status !== 'running') continue

      // 5. THROTTLE — one message per run per tick, only when due.
      if (nextSendAt && new Date(nextSendAt) > now) continue

      dueRuns.push({ ...run, status: 'running', next_send_at: nextSendAt })
    } catch (err) {
      console.error('[process-campaign-queue] Unhandled error preparing run', {
        run_id: run.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // PHASE 2 — one queue read for the whole tick, grouped by run.
  // Messages we claim but do not send in this tick simply return when the
  // visibility timeout expires, exactly as process-email-queue relies on.
  let rows: QueueRow[] = []
  if (dueRuns.length > 0) {
    const { data: readData, error: readErr } = await supabase.rpc('read_email_batch', {
      queue_name: QUEUE,
      batch_size: 50,
      vt: VISIBILITY_TIMEOUT_SECONDS,
    })
    if (readErr) {
      console.error('[process-campaign-queue] Queue read failed', { error: readErr.message })
    } else {
      rows = (readData ?? []) as QueueRow[]
    }
  }

  for (const run of dueRuns) {
    try {
      const nowIso = new Date().toISOString()
      const mine = rows.filter((r) => r?.message?.run_id === run.id)


      // Progress is the only completion signal. An empty queue read means
      // nothing on its own: campaign_queue_wake arms the dispatcher on the
      // AFTER INSERT of campaign_runs, so the first tick reliably runs before
      // the caller has finished enqueueing recipients.
      const progress =
        (run.sent_count ?? 0) + (run.failed_count ?? 0) + (run.skipped_opted_out_count ?? 0)
      const totalRecipients = run.total_recipients ?? 0

      if (mine.length === 0) {
        // Only conclude "no messages remain" when the read was not saturated.
        // A full batch may simply have been filled by other runs' messages.
        if (rows.length >= 50) {
          console.log('[process-campaign-queue] Read saturated, deferring run', { run_id: run.id })
          continue
        }

        if (progress >= totalRecipients) {
          // Guard the degenerate case: a run inserted with total_recipients = 0
          // that is only seconds old may still be having its count written by a
          // caller that (incorrectly) updates after insert. Give it a grace
          // window rather than completing it instantly.
          const ageMs = Date.now() - new Date(run.created_at).getTime()
          if (totalRecipients === 0 && ageMs < EMPTY_RUN_GRACE_MS) {
            console.log('[process-campaign-queue] Empty run within grace window, deferring', {
              run_id: run.id,
              age_ms: ageMs,
            })
            continue
          }

          const { error: compErr } = await supabase
            .from('campaign_runs')
            .update({ status: 'completed', completed_at: nowIso })
            .eq('id', run.id)
          if (compErr) {
            console.error('[process-campaign-queue] Failed to complete run', {
              run_id: run.id,
              error: compErr.message,
            })
          } else {
            summary.completed++
            console.log('[process-campaign-queue] Run completed', {
              run_id: run.id,
              progress,
              total_recipients: totalRecipients,
            })
          }
          continue
        }

        // progress < total_recipients: the recipients have not landed yet.
        // Stall timeout — the enqueue never finished.
        const startedAtMs = run.started_at ? new Date(run.started_at).getTime() : null
        if (startedAtMs !== null && Date.now() - startedAtMs > STALL_TIMEOUT_MS) {
          const { error: stallErr } = await supabase
            .from('campaign_runs')
            .update({
              status: 'cancelled',
              cancel_reason: 'enqueue_stalled',
              completed_at: nowIso,
            })
            .eq('id', run.id)
          if (stallErr) {
            console.error('[process-campaign-queue] Failed to mark run stalled', {
              run_id: run.id,
              error: stallErr.message,
            })
          }
          const purged = await purgeRunMessages(supabase, run.id)
          console.warn('[process-campaign-queue] Run cancelled: enqueue stalled', {
            run_id: run.id,
            progress,
            total_recipients: totalRecipients,
            purged,
          })
          summary.stalled++
          continue
        }

        // Not finished, not stalled — leave it running and do NOT advance
        // next_send_at. A later tick picks it up once the messages land.
        console.log('[process-campaign-queue] Awaiting enqueue, run left running', {
          run_id: run.id,
          progress,
          total_recipients: totalRecipients,
        })
        continue
      }

      // 6. RE-CHECK OPT-OUT AT SEND TIME. A five-hour campaign must honour a STOP
      // sent at minute 20 for a message queued at minute 0. Fails closed.
      // Skipping an opted-out recipient is not a send, so it must not consume
      // throttle time: drop it and move to the next candidate in this same tick.
      let chosen: QueueRow | null = null
      let skippedThisTick = 0
      for (const candidate of mine) {
        if (skippedThisTick >= MAX_SKIPS_PER_TICK) break
        const optedOut = await isOptedOut(
          supabase,
          run.organization_id,
          candidate.message?.customer_id,
        )
        if (!optedOut) {
          chosen = candidate
          break
        }
        await deleteMessage(supabase, candidate.msg_id, run.id)
        skippedThisTick++
        summary.skipped_opted_out++
        console.log('[process-campaign-queue] Skipped opted-out recipient', {
          run_id: run.id,
          customer_id: candidate.message?.customer_id,
        })
      }

      if (skippedThisTick > 0) {
        // Counter only — next_send_at deliberately untouched.
        await supabase
          .from('campaign_runs')
          .update({
            skipped_opted_out_count: (run.skipped_opted_out_count ?? 0) + skippedThisTick,
          })
          .eq('id', run.id)
      }

      if (!chosen) continue

      const msg = chosen
      const payload = msg.message

      // Retry budget: once exhausted the message goes to the DLQ instead of
      // cycling forever on visibility-timeout redelivery.
      if ((msg.read_ct ?? 0) > MAX_RETRIES) {
        await moveToDlq(supabase, msg, `Max retries (${MAX_RETRIES}) exceeded`)
        await supabase
          .from('campaign_runs')
          .update({ next_send_at: new Date(Date.now() + run.throttle_seconds * 1000).toISOString() })
          .eq('id', run.id)
        continue
      }


      // 7. SEND — same credentials, tokens, tracked link and phone normalisation
      // as run-inactive-campaign.
      const { data: smsSettings, error: smsErr } = await supabase
        .from('organization_sms_settings')
        .select('openphone_api_key, openphone_phone_number_id, sms_enabled')
        .eq('organization_id', run.organization_id)
        .maybeSingle()

      if (smsErr || !smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id) {
        console.error('[process-campaign-queue] SMS not configured — pausing run', {
          run_id: run.id,
          error: smsErr?.message ?? 'missing credentials',
        })
        await supabase
          .from('campaign_runs')
          .update({ status: 'paused', paused_at: nowIso })
          .eq('id', run.id)
        continue
      }
      if (!smsSettings.sms_enabled) {
        console.error('[process-campaign-queue] SMS disabled for org — pausing run', { run_id: run.id })
        await supabase
          .from('campaign_runs')
          .update({ status: 'paused', paused_at: nowIso })
          .eq('id', run.id)
        continue
      }

      const { data: businessSettings } = await supabase
        .from('business_settings')
        .select('company_name')
        .eq('organization_id', run.organization_id)
        .maybeSingle()
      const companyName = businessSettings?.company_name || 'Your Cleaning Service'

      const { data: orgData } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', run.organization_id)
        .maybeSingle()
      const orgSlug = orgData?.slug || run.organization_id

      const trackingRef = crypto.randomUUID().replace(/-/g, '').substring(0, 12)
      const trackedBookingLink = `${projectUrl}/book/${orgSlug}?ref=${trackingRef}`

      const template = payload.message_template || ''
      const personalizedMessage = template
        .replace(/{first_name}/g, payload.first_name || '')
        .replace(/{last_name}/g, payload.last_name || '')
        .replace(/{company_name}/g, companyName)
        .replace(/{booking_link}/g, trackedBookingLink)

      const toPhone = normalizePhone(payload.phone)

      let sendOk = false
      let openphoneMessageId: string | null = null
      let sendError = ''

      try {
        const response = await fetch('https://api.openphone.com/v1/messages', {
          method: 'POST',
          headers: {
            Authorization: smsSettings.openphone_api_key as string,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: smsSettings.openphone_phone_number_id,
            to: [toPhone],
            content: personalizedMessage,
          }),
        })

        if (response.ok) {
          sendOk = true
          const result = await response.json().catch(() => null)
          openphoneMessageId = result?.data?.id ?? null
        } else {
          sendError = `OpenPhone ${response.status}: ${await response.text()}`
        }
      } catch (err) {
        sendError = err instanceof Error ? err.message : String(err)
      }

      if (sendOk) {
        // 8. ON SUCCESS
        await deleteMessage(supabase, msg.msg_id, run.id)

        const { error: sendLogErr } = await supabase.from('campaign_sms_sends').insert({
          campaign_id: payload.campaign_id || null,
          customer_id: payload.customer_id,
          organization_id: run.organization_id,
          phone_number: toPhone,
          message_content: personalizedMessage,
          status: 'sent',
          campaign_type: 'queued_campaign',
        })
        if (sendLogErr) {
          console.error('[process-campaign-queue] campaign_sms_sends insert failed', {
            run_id: run.id,
            customer_id: payload.customer_id,
            error: sendLogErr.message,
          })
        }

        if (template.includes('{booking_link}')) {
          const { error: trackErr } = await supabase.from('booking_link_tracking').insert({
            organization_id: run.organization_id,
            customer_id: payload.customer_id,
            tracking_ref: trackingRef,
            customer_name: `${payload.first_name ?? ''} ${payload.last_name ?? ''}`.trim(),
            customer_phone: payload.phone,
            customer_email: null,
            campaign_id: payload.campaign_id || null,
            link_sent_at: nowIso,
            status: 'sent',
            link_type: 'booking',
          })
          if (trackErr) {
            console.log('[process-campaign-queue] Link tracking insert skipped:', trackErr.message)
          }
        }

        await upsertOutboundMessage(
          supabase,
          run.organization_id,
          toPhone,
          `${payload.first_name ?? ''} ${payload.last_name ?? ''}`.trim(),
          personalizedMessage,
          openphoneMessageId,
          run.id,
        )

        await supabase
          .from('campaign_runs')
          .update({
            sent_count: (run.sent_count ?? 0) + 1,
            next_send_at: new Date(Date.now() + run.throttle_seconds * 1000).toISOString(),
          })
          .eq('id', run.id)

        summary.sent++
        console.log('[process-campaign-queue] Sent campaign SMS', {
          run_id: run.id,
          customer_id: payload.customer_id,
          msg_id: msg.msg_id,
        })
      } else {
        // 9. ON FAILURE — leave the message to return via visibility timeout,
        // unless the retry budget is exhausted (then DLQ).
        console.error('[process-campaign-queue] Send failed', {
          run_id: run.id,
          msg_id: msg.msg_id,
          read_ct: msg.read_ct,
          customer_id: payload.customer_id,
          error: sendError,
        })

        if ((msg.read_ct ?? 0) >= MAX_RETRIES) {
          await moveToDlq(supabase, msg, `Max retries (${MAX_RETRIES}) exceeded: ${sendError}`)
        }

        await supabase
          .from('campaign_runs')
          .update({
            failed_count: (run.failed_count ?? 0) + 1,
            next_send_at: new Date(Date.now() + run.throttle_seconds * 1000).toISOString(),
          })
          .eq('id', run.id)

        summary.failed++
      }
    } catch (err) {
      console.error('[process-campaign-queue] Unhandled error processing run', {
        run_id: run.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return new Response(JSON.stringify({ runs: runs.length, ...summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
