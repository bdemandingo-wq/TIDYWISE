import { supabase } from "@/integrations/supabase/client";

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
    await supabase.auth.signOut();
    throw new Error("You do not have access to the staff portal. Please contact your administrator.");
  }

  return authData.user;
}

export async function requestStaffPasswordReset(email: string, redirectUrl: string) {
  const response = await supabase.functions.invoke("send-staff-password-reset", {
    body: { email, redirectUrl },
  });

  if (response.error) {
    throw new Error(response.error.message || "Failed to send reset email");
  }

  const data = response.data as any;
  if (data?.error) throw new Error(data.error);

  return data as { success: boolean; message?: string };
}
