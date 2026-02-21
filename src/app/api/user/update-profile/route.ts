import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name } = await req.json();

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    if (trimmedName.length > 100) {
      return NextResponse.json({ error: "Name is too long" }, { status: 400 });
    }

    // Update user name
    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: { name: trimmedName },
    });

    return NextResponse.json({
      success: true,
      name: updatedUser.name,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
