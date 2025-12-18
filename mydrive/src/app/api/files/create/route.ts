
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { s3 } from "@/lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

        const body = await req.json();
        const { folderId } = body;

        // 1. Determine Name
        // Heuristic: Check how many "Untitled*.doc" exist
        // For simplicity, we'll just use "Untitled Document.doc" or append timestamp if lazy, 
        // but better to check existence. 
        // Simpler: Just "Untitled Document " + UUID suffix short or similar if collision?
        // Let's try to query DB for "Untitled Document.doc"

        // Actually, user can rename later. Let's just create "Untitled.doc" and if exists "Untitled (1).doc"
        // DB query for pattern matching might be heavy. 
        // Let's just default to "Untitled.doc" and let DB constraints or user handle it?
        // Drive usually allows duplicates.

        let name = "Untitled.doc";

        // 2. Initial Content (TipTap JSON)
        const initialContent = {
            type: "doc",
            content: [
                {
                    type: "paragraph",
                }
            ]
        };
        const contentString = JSON.stringify(initialContent);
        const size = Buffer.byteLength(contentString);

        // 3. Upload to S3
        const s3Key = `${session.user.id}/${uuidv4()}.doc`;

        await s3.send(new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: s3Key,
            Body: contentString,
            ContentType: "application/json", // Storing as JSON
        }));

        // 4. Create DB Record
        const file = await prisma.fileObject.create({
            data: {
                name,
                size,
                mimeType: "application/json", // Internal type
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
