import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, notes } = body;

    // Verify ownership
    const opening = await prisma.opening.findUnique({
      where: { id },
      include: {
        repertoire: true,
      },
    });

    if (!opening) {
      return NextResponse.json({ error: "Opening not found" }, { status: 404 });
    }

    if (opening.repertoire.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update the opening
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (notes !== undefined) updateData.notes = notes;

    const updatedOpening = await prisma.opening.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ opening: updatedOpening });
  } catch (error) {
    console.error("Error updating opening:", error);
    return NextResponse.json(
      { error: "Failed to update opening" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const opening = await prisma.opening.findUnique({
      where: { id },
      include: {
        repertoire: true,
      },
    });

    if (!opening) {
      return NextResponse.json({ error: "Opening not found" }, { status: 404 });
    }

    if (opening.repertoire.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete the opening (cascade will delete entries)
    await prisma.opening.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting opening:", error);
    return NextResponse.json(
      { error: "Failed to delete opening" },
      { status: 500 }
    );
  }
}
