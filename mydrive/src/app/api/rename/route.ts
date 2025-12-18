import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const renameSchema = z.object({
    id: z.string().min(1),
    type: z.enum(["file", "folder"]),
    name: z.string().min(1),
});

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = renameSchema.safeParse(json);

    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 }
        );
    }

    const { id, type, name } = parsed.data;

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    try {
        if (type === "file") {
            const owned = await prisma.fileObject.findFirst({
                where: { id, ownerId: user.id },
                select: { id: true },
            });
            if (!owned) return NextResponse.json({ error: "File not found" }, { status: 404 });

            const updated = await prisma.fileObject.update({
                where: { id },
                data: { name },
                select: {
                    id: true,
                    name: true,
                    size: true,
                    mimeType: true,
                    folderId: true,
                    createdAt: true,
                },
            });

            return NextResponse.json(updated);
        } else {
            const owned = await prisma.folder.findFirst({
                where: { id, ownerId: user.id },
                select: { id: true },
            });
            if (!owned) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

            const updated = await prisma.folder.update({
                where: { id },
                data: { name },
                select: { id: true, name: true, parentId: true },
            });

            return NextResponse.json(updated);
        }
    } catch (error) {
        console.error("Rename error:", error);
        return NextResponse.json({ error: "Failed to rename" }, { status: 500 });
    }
}
