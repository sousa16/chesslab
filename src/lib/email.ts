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

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;

  try {
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to: email,
      subject: "Reset your Chesslab password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Reset Your Password</h1>
          <p>We received a request to reset your password. Click the button below to choose a new password:</p>
          <a 
            href="${resetUrl}" 
            style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
            Reset Password
          </a>
          <p style="color: #666; font-size: 14px;">
            Or copy and paste this link into your browser:<br/>
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This link will expire in 1 hour.
          </p>
          <p style="color: #666; font-size: 14px;">
            If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
      `,
    });
    console.log("Password reset email sent successfully:", result);
    return { success: true };
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return { success: false, error };
  }
}

export async function sendDailyReminderEmail(email: string, overdueCount: number, userName?: string) {
  const trainingUrl = `${process.env.NEXTAUTH_URL}/training`;
  const name = userName || "there";

  try {
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to: email,
      subject: `🔥 Don't break your streak! ${overdueCount} position${overdueCount > 1 ? 's' : ''} waiting`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; font-size: 28px; margin-bottom: 10px;">♟️ Chesslab</h1>
          </div>
          
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 40px; text-align: center; margin-bottom: 30px;">
            <h2 style="color: white; font-size: 32px; margin: 0 0 10px 0;">Hey ${name}! 👋</h2>
            <p style="color: rgba(255, 255, 255, 0.9); font-size: 18px; margin: 0;">Your chess positions are getting lonely...</p>
          </div>

          <div style="background-color: #f8f9fa; border-radius: 12px; padding: 30px; margin-bottom: 30px;">
            <div style="text-align: center; margin-bottom: 20px;">
              <div style="background-color: #ff6b6b; color: white; border-radius: 50%; width: 80px; height: 80px; display: inline-flex; align-items: center; justify-content: center; font-size: 36px; font-weight: bold; margin-bottom: 15px;">
                ${overdueCount}
              </div>
              <h3 style="color: #333; font-size: 24px; margin: 0 0 10px 0;">Position${overdueCount > 1 ? 's' : ''} waiting for you!</h3>
              <p style="color: #666; font-size: 16px; margin: 0;">These moves have been patiently waiting for over 24 hours.</p>
            </div>
          </div>

          <div style="margin-bottom: 30px;">
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 15px;">
              ${overdueCount === 1 
                ? "Just 1 position needs your attention. It'll only take a minute!" 
                : `${overdueCount} positions are ready to practice. Even 5 minutes helps keep your repertoire sharp! 💪`
              }
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
              Practice makes permanent. Let's make these moves second nature! 🧠
            </p>
          </div>

          <div style="text-align: center; margin-bottom: 30px;">
            <a 
              href="${trainingUrl}" 
              style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 30px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
              Start Training 🎯
            </a>
          </div>

          <div style="border-top: 2px solid #e9ecef; padding-top: 20px; text-align: center;">
            <p style="color: #999; font-size: 13px; margin: 0 0 10px 0;">
              You're receiving this because you enabled daily reminders in your settings.
            </p>
            <p style="color: #999; font-size: 13px; margin: 0;">
              Want to change this? <a href="${process.env.NEXTAUTH_URL}/settings" style="color: #667eea; text-decoration: none;">Update your preferences</a>
            </p>
          </div>
        </div>
      `,
    });
    console.log("Daily reminder email sent successfully:", result);
    return { success: true };
  } catch (error) {
    console.error("Failed to send daily reminder email:", error);
    return { success: false, error };
  }
}
