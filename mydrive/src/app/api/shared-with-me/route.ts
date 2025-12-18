import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const shares = await prisma.share.findMany({
        where: { sharedWithUserId: user.id },
        include: {
            file: { select: { id: true, name: true, mimeType: true, size: true } },
            folder: { select: { id: true, name: true } },
            owner: { select: { id: true, email: true, name: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(shares);
}
