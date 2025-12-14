// src/app/api/folders/[id]/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { z } from "zod";

import { s3 } from "@/lib/s3";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
export const runtime = "nodejs";

type Ctx = { params: { id: string } };

const patchSchema = z.object({
  name: z.string().min(1).max(120),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  type Ctx = { params: Promise<{ id: string }> | { id: string } };
  const p = await (ctx.params as any);
  const folderId = p.id;
  if (!folderId) return NextResponse.json({ error: "Missing folder id" }, { status: 400 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const existing = await prisma.folder.findFirst({
    where: { id: folderId, ownerId: user.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const updated = await prisma.folder.update({
    where: { id: folderId },
    data: { name: parsed.data.name.trim() },
    select: { id: true, name: true, parentId: true, createdAt: true },
  });

  return NextResponse.json(updated);
}

/**
 * Recursive delete:
 * - deletes all descendant folders
 * - deletes all files in those folders
 *
 * NOTE: this deletes DB rows only.
 * If you store files in S3 (MinIO), you should also delete S3 objects
 * when deleting FileObject rows (we can wire that in next).
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = ctx.params.id;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const root = await prisma.folder.findFirst({
    where: { id: folderId, ownerId: user.id },
    select: { id: true },
  });
  if (!root) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  // Gather descendants via BFS
  const toVisit: string[] = [folderId];
  const allFolderIds: string[] = [];

  while (toVisit.length) {
    const current = toVisit.shift()!;
    allFolderIds.push(current);

    const children = await prisma.folder.findMany({
      where: { parentId: current, ownerId: user.id },
      select: { id: true },
    });

    for (const c of children) toVisit.push(c.id);
  }
  const allFolderIdsClean = allFolderIds.filter((x): x is string => typeof x === "string" && x.length > 0);

    // Gather S3 keys before deleting DB rows
  const filesToDelete = await prisma.fileObject.findMany({
    where: { ownerId: user.id, folderId: { in: allFolderIdsClean } },
    select: { s3Key: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.fileObject.deleteMany({
      where: { ownerId: user.id, folderId: { in: allFolderIdsClean } },
    });

    await tx.folder.deleteMany({
      where: { ownerId: user.id, id: { in: allFolderIdsClean } },
    });
  });

  // Best-effort S3 cleanup (chunked)
  const bucket = process.env.S3_BUCKET;
  if (bucket && filesToDelete.length) {
    const keys = filesToDelete.map((f) => ({ Key: f.s3Key }));
    const chunkSize = 1000;

    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      try {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: chunk, Quiet: true },
          })
        );
      } catch (e) {
        console.error("S3 bulk delete failed:", e);
      }
    }
  }

  return NextResponse.json({ ok: true, deletedFolderIds: allFolderIdsClean });

}
