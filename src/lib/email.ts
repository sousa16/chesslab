import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(email: string, token: string) {
  const verificationUrl = `${process.env.NEXTAUTH_URL}/api/verify-email?token=${token}`;

  try {
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to: email,
      subject: "Verify your Chesslab account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Welcome to Chesslab!</h1>
          <p>Please verify your email address to complete your registration.</p>
          <a 
            href="${verificationUrl}" 
            style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
            Verify Email
          </a>
          <p style="color: #666; font-size: 14px;">
            Or copy and paste this link into your browser:<br/>
            <a href="${verificationUrl}">${verificationUrl}</a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This link will expire in 24 hours.
          </p>
        </div>
      `,
    });
    console.log("Email sent successfully:", result);
    return { success: true };
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return { success: false, error };
  }
}
