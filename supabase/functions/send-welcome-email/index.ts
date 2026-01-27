import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  email: string;
  name: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userEmail = userData.user.email;

    const { email, name }: WelcomeEmailRequest = await req.json();

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify that the requested email matches the authenticated user's email
    if (email !== userEmail) {
      return new Response(
        JSON.stringify({ error: "Email mismatch - can only send welcome email to your own address" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userName = name || email.split('@')[0];

    console.log(`Sending welcome email to ${email}`);

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'OneCare <hello@onecare.you>',
        to: [email],
        subject: 'Welcome to OneCare - Your Health Journey Starts Here',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background-color: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 32px;">
                  <div style="display: inline-block; background: linear-gradient(135deg, #14b8a6, #0ea5e9); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
                    <span style="font-size: 32px;">❤️</span>
                  </div>
                  <h1 style="color: #18181b; font-size: 28px; margin: 0 0 8px 0;">Welcome to OneCare!</h1>
                  <p style="color: #71717a; font-size: 16px; margin: 0;">Your complete health companion</p>
                </div>

                <!-- Greeting -->
                <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  Hi ${userName},
                </p>
                
                <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  Thank you for joining OneCare! We're excited to help you take control of your health journey.
                </p>

                <!-- Features -->
                <div style="background-color: #f4f4f5; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                  <h2 style="color: #18181b; font-size: 18px; margin: 0 0 16px 0;">Here's what you can do:</h2>
                  <ul style="color: #3f3f46; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                    <li><strong>Track Medications</strong> - Never miss a dose with smart reminders</li>
                    <li><strong>Monitor Vitals</strong> - Log blood pressure, glucose, weight, and more</li>
                    <li><strong>Manage Family Health</strong> - Keep track of your entire family's wellness</li>
                    <li><strong>Share with Clinicians</strong> - Securely share data with your healthcare providers</li>
                    <li><strong>Check Drug Interactions</strong> - Stay safe with interaction warnings</li>
                  </ul>
                </div>

                <!-- CTA Button -->
                <div style="text-align: center; margin-bottom: 24px;">
                  <a href="https://onecareyou.lovable.app/dashboard" 
                     style="display: inline-block; background: linear-gradient(135deg, #14b8a6, #0ea5e9); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Get Started
                  </a>
                </div>

                <!-- Support -->
                <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin-bottom: 8px;">
                  Need help getting started? Visit our <a href="https://onecareyou.lovable.app/help" style="color: #14b8a6; text-decoration: underline;">Help Center</a> or reply to this email.
                </p>

                <!-- Footer -->
                <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;" />
                
                <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 0;">
                  This email was sent by OneCare. If you didn't create an account, you can safely ignore this email.
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Failed to send welcome email:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to send email' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await emailResponse.json();
    console.log("Welcome email sent successfully:", result);

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error sending welcome email:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
