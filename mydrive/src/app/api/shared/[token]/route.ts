import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    if (!token) {
        return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const share = await prisma.share.findUnique({
        where: { linkToken: token },
        include: {
            file: {
                select: {
                    id: true,
                    name: true,
                    mimeType: true,
                    size: true,
                    s3Key: true,
                },
            },
            folder: {
                select: {
                    id: true,
                    name: true,
                },
            },
            owner: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                },
            },
        },
    });

    if (!share) {
        return NextResponse.json({ error: "Share not found or expired" }, { status: 404 });
    }

    return NextResponse.json(share);
}
