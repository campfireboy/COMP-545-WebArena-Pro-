import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_req: Request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Permanently delete all items in trash belonging to this user
    try {
        await prisma.$transaction(async (tx) => {
            await tx.fileObject.deleteMany({
                where: { ownerId: user.id, inTrash: true },
            });
            await tx.folder.deleteMany({
                where: { ownerId: user.id, inTrash: true },
            });
        });
        return NextResponse.json({ ok: true });
    } catch (e) {
        return NextResponse.json({ error: "Failed to empty trash" }, { status: 500 });
    }
}
