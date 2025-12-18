import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    // Verify ownership of the share
    const share = await prisma.share.findFirst({
        where: { id, ownerId: user.id },
    });

    if (!share) {
        return NextResponse.json({ error: "Share not found or not owned" }, { status: 404 });
    }

    await prisma.share.delete({ where: { id } });

    return NextResponse.json({ ok: true });
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const json = await req.json().catch(() => null);
    if (!json || !json.permission || !["READ", "EDIT", "COMMENT"].includes(json.permission)) {
        return NextResponse.json({ error: "Invalid permission" }, { status: 400 });
    }

    // Verify ownership of the share
    const share = await prisma.share.findFirst({
        where: { id, ownerId: user.id },
    });

    if (!share) {
        return NextResponse.json({ error: "Share not found or not owned" }, { status: 404 });
    }

    const updated = await prisma.share.update({
        where: { id },
        data: { permission: json.permission },
    });

    return NextResponse.json(updated);
}
