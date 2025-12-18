
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { s3 } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import archiver from "archiver";
import { PassThrough } from "stream";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const folderId = id;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Verify Access
  // Recursive check or just ownership/direct share check?
  // For download, let's strictly require ownership or direct EDIT/VIEW share of the folder itself
  // Or just ownership for now as per plan, but we should probably respect recursive access.
  // For simplicity of this task, let's reuse existing logic or simplify to ownership + direct share.

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: { shares: true }
  });

  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let hasAccess = false;
  if (folder.ownerId === user.id) hasAccess = true;
  else {
    const share = folder.shares.find(s => s.sharedWithUserId === user.id);
    if (share) hasAccess = true;
  }

  if (!hasAccess) {
    // TODO: Recursive check if parent is shared? 
    // For now fail safe
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Recursive Collect
  const filesToZip: { s3Key: string; name: string }[] = [];

  // Helper to walk
  async function walk(currentFolderId: string, currentPath: string) {
    // Get files
    const files = await prisma.fileObject.findMany({
      where: { folderId: currentFolderId },
      select: { id: true, name: true, s3Key: true }
    });

    for (const f of files) {
      filesToZip.push({
        s3Key: f.s3Key,
        name: currentPath + f.name
      });
    }

    // Get folders
    const children = await prisma.folder.findMany({
      where: { parentId: currentFolderId },
      select: { id: true, name: true }
    });

    for (const c of children) {
      await walk(c.id, currentPath + c.name + "/");
    }
  }

  await walk(folderId, ""); // Start at root of zip

  if (filesToZip.length === 0) {
    return NextResponse.json({ error: "Empty folder" }, { status: 400 });
  }

  // 3. Stream Zip
  const stream = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", (err) => {
    console.error("Archiver error:", err);
    stream.end();
  });

  archive.pipe(stream);

  // Add files
  // Note: In a real app we'd want concurrency limits or streaming optimization
  for (const f of filesToZip) {
    try {
      const s3Res = await s3.send(new GetObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: f.s3Key
      }));

      if (s3Res.Body) {
        // @ts-ignore - S3 Body is compatible stream
        archive.append(s3Res.Body, { name: f.name });
      }
    } catch (e) {
      console.error(`Failed to zip file ${f.name}`, e);
      // Verify if we should continue or error out. 
      // Usually best effort is okay, or add error text file.
      archive.append(`Failed to download: ${f.name}`, { name: f.name + ".error.txt" });
    }
  }

  archive.finalize();

  return new NextResponse(stream as any, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folder.name}.zip"`,
    },
  });
}
