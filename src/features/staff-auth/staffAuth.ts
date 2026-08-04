import { supabase } from "@/lib/supabase";
import { readEdgeFunctionError } from "@/lib/edgeFunctionError";

export async function hasStaffOrAdminRole(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["staff", "admin"]);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function signInStaff(email: string, password: string) {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error("Login failed. Please try again.");

  const allowed = await hasStaffOrAdminRole(authData.user.id);
  if (!allowed) {
    // scope: 'local' — this just undoes the sign-in that was just attempted
    // on this device; not a "sign out everywhere" action. See
    // useAuthNoSession.tsx's signOut() for the fuller rationale.
    await supabase.auth.signOut({ scope: "local" });
    throw new Error("You do not have access to the staff portal. Please contact your administrator.");
  }

  return authData.user;
}

export async function requestStaffPasswordReset(email: string, redirectUrl: string) {
  const response = await supabase.functions.invoke("send-staff-password-reset", {
    body: { email, redirectUrl },
  });

  if (response.error) {
    // NOT response.error.message — supabase-js collapses every non-2xx into a
    // FunctionsHttpError reading "Edge Function returned a non-2xx status code",
    // and this function has real things to say: "Invalid redirect URL",
    // "No phone number on file.", "SMS is not configured for this organization."
    // Throwing the wrapper told a cleaner nothing and hid the actual cause.
    throw new Error(await readEdgeFunctionError(response.error, "Failed to send reset email"));
  }

  // Only reachable on a 2xx. `invoke` sets data to null on any non-2xx, so the
  // old `if (data?.error)` check below this could never fire on a failure — the
  // error path is entirely the branch above.
  const data = response.data as any;
  if (data?.error) throw new Error(data.error);

  return data as { success: boolean; message?: string };
}
