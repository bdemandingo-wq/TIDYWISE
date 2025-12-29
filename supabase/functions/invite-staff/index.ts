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
  password?: string; // Admin-set password
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

    const { email, name, phone, hourly_rate, percentage_rate, tax_classification, password }: InviteStaffRequest = await req.json();

    if (!email || !name) {
      return new Response(JSON.stringify({ error: "Email and name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!password || password.length < 6) {
      return new Response(JSON.stringify({ error: "Password is required and must be at least 6 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get admin's organization
    const { data: adminMembership } = await supabaseAdmin
      .from("org_memberships")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (!adminMembership) {
      return new Response(JSON.stringify({ error: "Admin must belong to an organization" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const organizationId = adminMembership.organization_id;

    // Check if staff record already exists (including inactive ones) in this org
    const { data: existingStaff } = await supabaseAdmin
      .from("staff")
      .select("*")
      .eq("email", email)
      .eq("organization_id", organizationId)
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

        // Update the user's password if they have a user_id
        if (existingStaff.user_id) {
          const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
            existingStaff.user_id,
            { password }
          );
          if (passwordError) {
            console.error("Error updating password:", passwordError);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            staff: { ...existingStaff, is_active: true, name, phone, hourly_rate },
            message: "Staff member reactivated with new password.",
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

    // Check if auth user already exists (they might exist without a staff record)
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    let userId: string;

    if (existingAuthUser) {
      // User exists in auth - just update their password and use their ID
      console.log("User already exists in auth, linking to staff record:", existingAuthUser.id);
      
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        { password, user_metadata: { full_name: name } }
      );
      
      if (passwordError) {
        console.error("Error updating existing user password:", passwordError);
        return new Response(JSON.stringify({ error: "Failed to update user credentials: " + passwordError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      userId = existingAuthUser.id;
    } else {
      // Create new auth user with admin-provided password
      const { data: authData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
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
      
      userId = authData.user.id;
    }

    // Create staff record
    const { data: staffData, error: staffError } = await supabaseAdmin
      .from("staff")
      .insert({
        user_id: userId,
        organization_id: organizationId,
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
      // Only delete auth user if we just created them (not if they existed before)
      if (!existingAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      return new Response(JSON.stringify({ error: staffError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign staff role (upsert to handle existing users)
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({
        user_id: userId,
        role: "staff",
      }, { onConflict: 'user_id,role' });

    if (roleError) {
      console.error("Error assigning role:", roleError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        staff: staffData,
        message: "Staff member created successfully. Share the login credentials with them.",
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