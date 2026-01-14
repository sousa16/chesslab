import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists or not
      return NextResponse.json({
        message:
          "If an account exists with this email, a verification email has been sent.",
      });
    }

    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.json(
        {
          error: "This email is already verified",
        },
        { status: 400 }
      );
    }

    // Delete any existing tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: email },
    });

    // Generate new verification token
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires,
      },
    });

    // Send verification email
    const result = await sendVerificationEmail(email, token);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Failed to send email",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Verification email sent successfully",
    });
  } catch (error) {
    console.error("Resend email error:", error);
    return NextResponse.json(
      {
        error: "Failed to resend verification email",
      },
      { status: 500 }
    );
  }
}
