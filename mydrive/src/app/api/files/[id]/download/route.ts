import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { s3 } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing file id" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = await prisma.fileObject.findUnique({
    where: { id },
    select: { id: true, name: true, mimeType: true, size: true, s3Key: true, ownerId: true, folderId: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Check if user owns the file OR has access via shared folder
  let hasAccess = file.ownerId === user.id;

  if (!hasAccess && file.folderId) {
    // Check if any parent folder is shared with the user
    let currentFolderId: string | null = file.folderId;
    while (currentFolderId && !hasAccess) {
      const parentFolder: any = await prisma.folder.findUnique({
        where: { id: currentFolderId },
        select: {
          ownerId: true,
          parentId: true,
          shares: {
            where: { sharedWithUserId: user.id },
            select: { id: true },
          },
        },
      });

      if (!parentFolder) break;

      if (parentFolder.ownerId === user.id || parentFolder.shares.length > 0) {
        hasAccess = true;
      }

      currentFolderId = parentFolder.parentId;
    }
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    return NextResponse.json({ error: "Missing S3_BUCKET" }, { status: 500 });
  }

  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: file.s3Key }));
  if (!obj.Body) {
    return NextResponse.json({ error: "Missing object body" }, { status: 500 });
  }

  const nodeStream = obj.Body as unknown as Readable;
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  const headers = new Headers();
  headers.set("Content-Type", file.mimeType || "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
  if (typeof file.size === "number") headers.set("Content-Length", String(file.size));

  return new Response(webStream, { headers });
}
