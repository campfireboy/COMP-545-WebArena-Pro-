
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { s3 } from "@/lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { getUniqueName } from "@/lib/serverUtils";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

        const body = await req.json();
        const { folderId, name: requestedName, content: requestedContent, mimeType: requestedMimeType } = body;

        let name = requestedName || "Untitled.doc";
        let contentString = "";
        let mimeType = requestedMimeType || "application/json";

        if (name.endsWith(".doc") && !requestedContent) {
            contentString = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
            mimeType = "application/vnd.google-apps.document";
        } else {
            contentString = requestedContent || "";
            if (!requestedMimeType) {
                if (name.endsWith(".csv")) mimeType = "text/csv";
                else if (name.endsWith(".html")) mimeType = "text/html";
                else mimeType = "text/plain";
            }
        }

        // --- UNIQUE NAME CHECK ---
        const existingFiles = await prisma.fileObject.findMany({
            where: {
                folderId: folderId || null,
                ownerId: session.user.id
                // Note: We only check against files owned by user in that folder.
                // ideally we check against all files visible in that folder,
                // but for now strict ownership/folder context is okay.
            },
            select: { name: true }
        });
        const existingNames = new Set(existingFiles.map(f => f.name));
        name = getUniqueName(name, existingNames);
        // -------------------------

        const size = Buffer.byteLength(contentString);

        // 3. Upload to S3
        const s3Key = `${session.user.id}/${uuidv4()}${name.substring(name.lastIndexOf('.'))}`;

        await s3.send(new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: s3Key,
            Body: contentString,
            ContentType: mimeType,
        }));

        // 4. Create DB Record
        const file = await prisma.fileObject.create({
            data: {
                name,
                size,
                mimeType,
                s3Key,
                ownerId: session.user.id,
                folderId: folderId || null,
            }
        });

        return NextResponse.json(file);

    } catch (error) {
        console.error(error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
