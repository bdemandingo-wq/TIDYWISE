// Shared helper for audit logging critical actions.
// Entries are written to public.system_audit_log (durable) and mirrored to the
// console. Edge function logs age out in under two days, so the console alone
// was useless for anything that needed proving later.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuditLogEntry {
  action: string;
  organizationId: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  success?: boolean;
  error?: string;
}

/**
 * Logs a critical action for audit purposes.
 * Actions logged include: email sends, SMS sends, settings changes, payment actions
 * 
 * Format: [AUDIT] timestamp | action | org:xxx | user:xxx | resource:xxx | success/error
 * 
 * Fire-and-forget safe: callers that don't await still get the row persisted,
 * because the insert is handed to EdgeRuntime.waitUntil when available.
 *
 * @param entry - The audit log entry to record
 */
export function logAudit(entry: AuditLogEntry): Promise<void> {
  const timestamp = new Date().toISOString();
  const success = entry.success !== false; // Default to true if not specified
  const status = success ? 'SUCCESS' : `ERROR: ${entry.error || 'Unknown error'}`;
  const userPart = entry.userId ? `user:${entry.userId}` : 'user:system';
  const resourcePart = entry.resourceType 
    ? `${entry.resourceType}:${entry.resourceId || 'unknown'}` 
    : '';
  
  const logParts = [
    `[AUDIT]`,
    timestamp,
    `action:${entry.action}`,
    `org:${entry.organizationId}`,
    userPart,
    resourcePart,
    status,
  ].filter(Boolean);
  
  const logMessage = logParts.join(' | ');
  
  if (success) {
    console.log(logMessage);
  } else {
    console.error(logMessage);
  }
  
  // Log details if provided (for debugging)
  if (entry.details && Object.keys(entry.details).length > 0) {
    console.log(`[AUDIT DETAILS] ${JSON.stringify(entry.details)}`);
  }

  const persist = persistAudit(entry, success);
  // Keep the row alive even when the caller doesn't await (most call sites don't).
  try {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(persist);
  } catch { /* not available in this runtime */ }
  return persist;
}

async function persistAudit(entry: AuditLogEntry, success: boolean): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await supabase.from("system_audit_log").insert({
      organization_id: entry.organizationId || null,
      action: entry.action,
      user_id: entry.userId || null,
      resource_type: entry.resourceType || null,
      resource_id: entry.resourceId ? String(entry.resourceId) : null,
      success,
      error_message: entry.error ? String(entry.error).slice(0, 4000) : null,
      details: entry.details ?? null,
    });
  } catch (e) {
    // Never let auditing break the action being audited.
    console.error("[AUDIT] Failed to persist audit entry:", e);
  }
}

/**
 * Pre-defined audit actions for consistency
 */
export const AuditActions = {
  // Email actions
  EMAIL_BOOKING_CONFIRMATION: 'email.booking_confirmation',
  EMAIL_INVOICE: 'email.invoice',
  EMAIL_REVIEW_REQUEST: 'email.review_request',
  EMAIL_REFERRAL_INVITE: 'email.referral_invite',
  EMAIL_ADMIN_NOTIFICATION: 'email.admin_notification',
  EMAIL_STAFF_PASSWORD_RESET: 'email.staff_password_reset',
  EMAIL_FOLLOWUP_CAMPAIGN: 'email.followup_campaign',
  EMAIL_SENT: 'email.sent',
  
  // SMS actions
  SMS_BOOKING_CONFIRMATION: 'sms.booking_confirmation',
  SMS_REMINDER: 'sms.reminder',
  SMS_ADMIN_NOTIFICATION: 'sms.admin_notification',
  SMS_CANCELLATION: 'sms.cancellation',
  SMS_PAYMENT_LINK: 'sms.payment_link',
  SMS_GENERIC: 'sms.generic',
  
  // Settings actions
  SETTINGS_EMAIL_UPDATE: 'settings.email_update',
  SETTINGS_SMS_UPDATE: 'settings.sms_update',
  SETTINGS_BUSINESS_UPDATE: 'settings.business_update',
  
  // Payment actions
  PAYMENT_CHARGE: 'payment.charge',
  PAYMENT_REFUND: 'payment.refund',
  PAYMENT_HOLD: 'payment.hold',
  PAYMENT_CAPTURE: 'payment.capture',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_CANCELLED: 'payment.cancelled',
  PAYMENT_HOLD_PLACED: 'payment.hold_placed',
  CARD_SAVED: 'payment.card_saved',
  
  // Auth actions
  AUTH_STAFF_INVITE: 'auth.staff_invite',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  AUTH_LOGIN_ATTEMPT: 'auth.login_attempt',
  AUTH_FAILED: 'auth.failed',
} as const;

export type AuditAction = typeof AuditActions[keyof typeof AuditActions];
