import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token");

  const origin = request.nextUrl.origin;

  if (!token) {
    return NextResponse.redirect(
      new URL("/?error=Invalid verification link", origin),
    );
  }

  try {
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.redirect(
        new URL("/?error=Invalid or expired verification link", origin),
      );
    }

    if (verificationToken.expires < new Date()) {
      await prisma.verificationToken.delete({ where: { token } });
      return NextResponse.redirect(
        new URL("/?error=Verification link has expired", origin),
      );
    }

    await prisma.user.update({
      where: { email: verificationToken.identifier },
      data: { emailVerified: new Date() },
    });

    await prisma.verificationToken.delete({ where: { token } });

    return NextResponse.redirect(new URL("/?verified=true", origin));
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.redirect(
      new URL("/?error=Verification failed", origin),
    );
  }
}
