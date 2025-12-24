import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteStaffRequest {
  email: string;
  name: string;
  phone?: string;
  hourly_rate?: number;
  percentage_rate?: number;
  tax_classification?: 'w2' | '1099';
  redirectUrl?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has admin role
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, name, phone, hourly_rate, percentage_rate, tax_classification, redirectUrl }: InviteStaffRequest = await req.json();

    if (!email || !name) {
      return new Response(JSON.stringify({ error: "Email and name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if staff record already exists (including inactive ones)
    const { data: existingStaff } = await supabaseAdmin
      .from("staff")
      .select("*")
      .eq("email", email)
      .single();

    if (existingStaff) {
      // Staff exists - reactivate if inactive
      if (!existingStaff.is_active) {
        const { error: updateError } = await supabaseAdmin
          .from("staff")
          .update({
            name,
            phone: phone || null,
            hourly_rate: hourly_rate || null,
            percentage_rate: percentage_rate || null,
            is_active: true,
            tax_classification: tax_classification || 'w2',
          })
          .eq("id", existingStaff.id);

        if (updateError) {
          console.error("Error reactivating staff:", updateError);
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Generate a password reset link for the reactivated user
        let resetLink = null;
        if (existingStaff.user_id) {
          const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: {
              redirectTo: redirectUrl || `${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovable.app')}/staff/reset-password`,
            },
          });

          if (linkError) {
            console.error("Error generating recovery link:", linkError);
          } else {
            resetLink = linkData.properties?.action_link;
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            staff: { ...existingStaff, is_active: true, name, phone, hourly_rate },
            resetLink,
            message: "Staff member reactivated. Share the password reset link so they can set their password.",
            reactivated: true,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } else {
        // Staff is already active
        return new Response(JSON.stringify({ error: "A staff member with this email already exists and is active" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Generate a random temporary password (required for user creation, but user will reset it)
    const tempPassword = crypto.randomUUID();

    // Create auth user with a random password (user will set their own via reset link)
    const { data: authData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (createUserError) {
      console.error("Error creating user:", createUserError);
      return new Response(JSON.stringify({ error: createUserError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = authData.user.id;

    // Create staff record
    const { data: staffData, error: staffError } = await supabaseAdmin
      .from("staff")
      .insert({
        user_id: newUserId,
        email,
        name,
        phone: phone || null,
        hourly_rate: hourly_rate || null,
        percentage_rate: percentage_rate || null,
        is_active: true,
        tax_classification: tax_classification || 'w2',
      })
      .select()
      .single();

    if (staffError) {
      console.error("Error creating staff record:", staffError);
      // Rollback: delete the auth user if staff creation fails
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: staffError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign staff role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUserId,
        role: "staff",
      });

    if (roleError) {
      console.error("Error assigning role:", roleError);
    }

    // Generate password reset link so staff can set their own password
    const { data: linkData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: redirectUrl || `${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovable.app')}/staff/reset-password`,
      },
    });

    let resetLink = null;
    if (resetError) {
      console.error("Error generating recovery link:", resetError);
    } else {
      resetLink = linkData.properties?.action_link;
      console.log("Generated reset link for new staff:", resetLink);
    }

    return new Response(
      JSON.stringify({
        success: true,
        staff: staffData,
        resetLink,
        message: "Staff member created. Share the password setup link so they can set their password.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in invite-staff:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
