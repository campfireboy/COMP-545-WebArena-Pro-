import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import crypto from "crypto";

export const runtime = "nodejs";

const createShareSchema = z.object({
    fileId: z.string().optional(),
    folderId: z.string().optional(),
    sharedWithEmail: z.string().email().optional(),
    permission: z.enum(["READ", "COMMENT", "EDIT"]),
    linkShare: z.boolean().optional(),
});

export async function POST(req: Request) {
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

    const json = await req.json().catch(() => null);
    const parsed = createShareSchema.safeParse(json);

    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 }
        );
    }

    const { fileId, folderId, sharedWithEmail, permission, linkShare } = parsed.data;

    // Must specify either fileId or folderId
    if (!fileId && !folderId) {
        return NextResponse.json({ error: "Must specify fileId or folderId" }, { status: 400 });
    }

    // Verify ownership
    if (fileId) {
        const file = await prisma.fileObject.findFirst({
            where: { id: fileId, ownerId: user.id },
        });
        if (!file) return NextResponse.json({ error: "File not found or not owned" }, { status: 404 });
    }

    if (folderId) {
        const folder = await prisma.folder.findFirst({
            where: { id: folderId, ownerId: user.id },
        });
        if (!folder) return NextResponse.json({ error: "Folder not found or not owned" }, { status: 404 });
    }

    let sharedWithUserId: string | undefined;
    let linkToken: string | undefined;

    if (linkShare) {
        // Generate unique link token
        linkToken = crypto.randomBytes(16).toString("hex");
    } else if (sharedWithEmail) {
        // Find user by email
        const recipient = await prisma.user.findUnique({
            where: { email: sharedWithEmail },
            select: { id: true },
        });
        if (!recipient) {
            return NextResponse.json({ error: "User not found with that email" }, { status: 404 });
        }
        sharedWithUserId = recipient.id;
    } else {
        return NextResponse.json({ error: "Must specify sharedWithEmail or linkShare" }, { status: 400 });
    }

    const share = await prisma.share.create({
        data: {
            ownerId: user.id,
            fileId,
            folderId,
            sharedWithUserId,
            linkToken,
            permission,
        },
        include: {
            file: { select: { id: true, name: true } },
            folder: { select: { id: true, name: true } },
            sharedWithUser: { select: { id: true, email: true, name: true } },
        },
    });

    return NextResponse.json(share);
}

export async function GET(req: Request) {
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
        where: { ownerId: user.id },
        include: {
            file: { select: { id: true, name: true, mimeType: true } },
            folder: { select: { id: true, name: true } },
            sharedWithUser: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(shares);
}
