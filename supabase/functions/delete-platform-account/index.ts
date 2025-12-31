import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
    // Verify the user is the platform admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user?.email || user.email !== PLATFORM_ADMIN_EMAIL) {
      throw new Error("Unauthorized: Platform admin access only");
    }

    const { userId, type } = await req.json();
    console.log(`[DELETE-ACCOUNT] Deleting ${type} with ID:`, userId);

    if (type === 'user') {
      // Delete the user from auth (this will cascade to profiles via trigger)
      const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;
      console.log("[DELETE-ACCOUNT] User deleted successfully");
    } else if (type === 'organization') {
      // Delete organization and related data
      const { error: deleteError } = await supabaseClient
        .from('organizations')
        .delete()
        .eq('id', userId);
      if (deleteError) throw deleteError;
      console.log("[DELETE-ACCOUNT] Organization deleted successfully");
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[DELETE-ACCOUNT] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500,
    });
  }
});
