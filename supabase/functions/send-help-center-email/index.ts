import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface HelpCenterEmailRequest {
  type: 'contact' | 'idea';
  name: string;
  email: string;
  message: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, name, email, message }: HelpCenterEmailRequest = await req.json();

    const isIdea = type === 'idea';
    const subject = isIdea 
      ? `💡 New Feature Idea from ${name}` 
      : `📬 Help Center Contact from ${name}`;
    
    const heading = isIdea 
      ? 'New Feature Idea Submission' 
      : 'New Support Request';

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "TidyWise Help Center <onboarding@resend.dev>",
        to: ["agencyfootprintllc@gmail.com"],
        reply_to: email,
        
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">${heading}</h1>
            
            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>From:</strong> ${name}</p>
              <p style="margin: 0 0 10px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
              <p style="margin: 0;"><strong>Type:</strong> ${isIdea ? 'Feature Idea' : 'Support Request'}</p>
            </div>
            
            <h2 style="color: #333; margin-top: 30px;">Message:</h2>
            <div style="background: #fff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
              <p style="white-space: pre-wrap; margin: 0;">${message}</p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
            <p style="color: #6b7280; font-size: 12px;">This email was sent from the TidyWise Help Center.</p>
          </div>
        `,
      }),
    });

    const emailResponse = await res.json();
    console.log("Help center email sent successfully:", emailResponse);

    if (!res.ok) {
      throw new Error(emailResponse.message || "Failed to send email");
    }

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-help-center-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
