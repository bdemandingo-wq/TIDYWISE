/**
 * Shared helper — fire-and-forget push notification to all admin devices for an org.
 * Call this from any edge function after the main work is done.
 */
export async function sendPushToOrg(
  organizationId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return;

    await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ organization_id: organizationId, title, body, data }),
    });
  } catch (err) {
    // Non-critical — never let push failure break the main flow
    console.error("[send-push] helper error:", err);
  }
}
