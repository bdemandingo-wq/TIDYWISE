import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createErrorResponse, logToSystem } from "../_shared/system-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_ADMIN_EMAIL = "support@tidywisecleaning.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // HARD SAFETY: This function is permanently disabled to prevent accidental data loss.
    // If you ever want to re-enable deletions in the future, revert this block explicitly.
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") ?? null;
    const { data: userData } = token
      ? await supabaseClient.auth.getUser(token)
      : { data: { user: null } };

    const requestId = crypto.randomUUID();
    await logToSystem({
      level: "warn",
      source: "delete-platform-account",
      message: "Blocked account deletion attempt (function disabled)",
      details: {
        method: req.method,
        path: new URL(req.url).pathname,
      },
      userId: userData.user?.id,
      requestId,
    });

    return await createErrorResponse(
      "Account deletion is disabled.",
      403,
      corsHeaders,
      {
        source: "delete-platform-account",
        userId: userData.user?.id,
        requestId,
      }
    );

    // Verify the user is the platform admin
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[DELETE-ACCOUNT] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500,
    });
  }
});
