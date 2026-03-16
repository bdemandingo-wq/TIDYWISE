import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export interface AuthResult {
  success: boolean;
  error?: string;
  userId?: string;
  organizationId?: string;
  role?: string;
}

/**
 * Verifies that the request has a valid authenticated user
 * and returns their organization membership info.
 * 
 * For admin-only functions, use requireAdmin: true
 */
export async function verifyAdminAuth(
  authHeader: string | null,
  options: { requireAdmin?: boolean; requireOrganizationId?: string } = {}
): Promise<AuthResult> {
  if (!authHeader) {
    return { success: false, error: "Missing authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return { success: false, error: "Invalid authorization token" };
  }

  // Create a client with the user's token to verify their identity
  const supabaseWithAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  // Verify the user's JWT using getUser() which validates the token
  const { data: userData, error: userError } = await supabaseWithAuth.auth.getUser();
  
  if (userError || !userData.user) {
    console.error("Auth verification failed:", userError);
    return { success: false, error: "Invalid or expired token" };
  }

  const userId = userData.user.id;

  // Use service role client to query org memberships (bypasses RLS)
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get user's organization membership
  // When a specific org is required, filter by it directly to avoid multi-row errors
  let membershipQuery = supabaseAdmin
    .from("org_memberships")
    .select("organization_id, role")
    .eq("user_id", userId);

  if (options.requireOrganizationId) {
    membershipQuery = membershipQuery.eq("organization_id", options.requireOrganizationId);
  }

  const { data: memberships, error: membershipError } = await membershipQuery;

  if (membershipError) {
    console.error("Failed to fetch org membership:", membershipError);
    return { success: false, error: "Failed to verify organization membership" };
  }

  if (!memberships || memberships.length === 0) {
    if (options.requireOrganizationId) {
      return { success: false, error: "Access denied: organization mismatch" };
    }
    return { success: false, error: "User does not belong to any organization" };
  }

  // Use the matching membership (first one if no specific org required)
  const membership = memberships[0];

  // If admin role is required, verify it
  if (options.requireAdmin && membership.role !== "admin" && membership.role !== "owner") {
    console.error("Admin access required, user role:", membership.role);
    return { success: false, error: "Access denied: admin privileges required" };
  }

  return {
    success: true,
    userId,
    organizationId: membership.organization_id,
    role: membership.role,
  };
}

/**
 * Creates an unauthorized response with proper headers
 */
export function createUnauthorizedResponse(error: string, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ success: false, error }),
    { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

/**
 * Creates a forbidden response with proper headers
 */
export function createForbiddenResponse(error: string, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ success: false, error }),
    { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}
