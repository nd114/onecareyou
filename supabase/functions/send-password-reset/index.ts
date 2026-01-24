import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PasswordResetRequest {
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: PasswordResetRequest = await req.json();

    if (!email) {
      throw new Error("Email is required");
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate password reset link
    const { data, error: resetError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: `${Deno.env.get("SITE_URL") || "https://marpecare.lovable.app"}/reset-password`,
      },
    });

    if (resetError) {
      console.error("Error generating reset link:", resetError);
      // Don't reveal if email exists or not for security
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset email will be sent." }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const resetUrl = data?.properties?.action_link;

    if (!resetUrl) {
      console.error("No reset URL generated");
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset email will be sent." }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Send branded password reset email using Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Marpe <onboarding@resend.dev>",
        to: [email],
        subject: "Reset Your Marpe Password",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background-color: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 32px;">
                  <div style="display: inline-block; background: linear-gradient(135deg, #0d9488, #14b8a6); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
                    <span style="font-size: 32px;">❤️</span>
                  </div>
                  <h1 style="color: #18181b; font-size: 24px; margin: 0 0 8px 0;">Reset Your Password</h1>
                  <p style="color: #71717a; font-size: 16px; margin: 0;">We received a request to reset your password</p>
                </div>

                <!-- Content -->
                <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  Hi there,
                </p>
                
                <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  Someone requested a password reset for your Marpe account. If this was you, click the button below to set a new password.
                </p>

                <!-- CTA Button -->
                <div style="text-align: center; margin: 32px 0;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                    <tr>
                      <td style="border-radius: 8px; background: linear-gradient(135deg, #0d9488, #14b8a6);">
                        <a href="${resetUrl}" 
                           target="_blank"
                           style="display: inline-block; background: linear-gradient(135deg, #0d9488, #14b8a6); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                          Reset Password
                        </a>
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Security Notice -->
                <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 24px; border-left: 4px solid #f59e0b;">
                  <p style="color: #92400e; font-size: 14px; margin: 0; line-height: 1.5;">
                    <strong>Security tip:</strong> This link will expire in 1 hour. If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
                  </p>
                </div>

                <!-- Alternative Link -->
                <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin-bottom: 8px;">
                  If the button doesn't work, copy and paste this link into your browser:
                </p>
                <p style="color: #0d9488; font-size: 12px; word-break: break-all; background-color: #f4f4f5; padding: 12px; border-radius: 6px; margin-bottom: 24px;">
                  ${resetUrl}
                </p>

                <!-- Footer -->
                <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;" />
                
                <div style="text-align: center;">
                  <p style="color: #a1a1aa; font-size: 12px; margin: 0 0 8px 0;">
                    This email was sent by Marpe - Your Health, Connected
                  </p>
                  <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
                    If you have any questions, contact us at <a href="mailto:support@marpe.care" style="color: #0d9488; text-decoration: none;">support@marpe.care</a>
                  </p>
                </div>
              </div>
              
              <!-- Outer Footer -->
              <div style="text-align: center; margin-top: 24px;">
                <p style="color: #a1a1aa; font-size: 11px; margin: 0;">
                  © ${new Date().getFullYear()} Marpe. All rights reserved.
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error("Resend API error:", errorData);
      throw new Error("Failed to send email");
    }

    console.log("Password reset email sent successfully");

    return new Response(
      JSON.stringify({ success: true, message: "Password reset email sent" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-password-reset function:", error);
    // For security, don't reveal specific errors
    return new Response(
      JSON.stringify({ success: true, message: "If an account exists, a reset email will be sent." }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
