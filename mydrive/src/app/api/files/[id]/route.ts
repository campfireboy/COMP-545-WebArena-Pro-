import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { s3 } from "@/lib/s3";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

const patchSchema = z.object({
  folderId: z.string().nullable(),
});

type Ctx = { params: Promise<{ id: string }> | { id: string } };

async function getParamId(ctx: Ctx): Promise<string> {
  // Next can provide params as a Promise in some builds
  const p = await (ctx.params as any);
  return p.id;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  let email = session?.user?.email;

  // DEV BYPASS
  if (!email && process.env.NODE_ENV === "development") {
    email = "agent@test.com";
  }

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const fileId = id;
  if (!fileId) return NextResponse.json({ error: "Missing file id" }, { status: 400 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const owned = await prisma.fileObject.findFirst({
    where: { id: fileId, ownerId: user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const { folderId } = parsed.data;

  // If moving into a folder, confirm folder belongs to user
  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, ownerId: user.id },
      select: { id: true },
    });
    if (!folder) {
      return NextResponse.json({ error: "Target folder not found" }, { status: 404 });
    }
  }

  const updated = await prisma.fileObject.update({
    where: { id: fileId },
    data: { folderId },
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
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  let email = session?.user?.email;

  // DEV BYPASS
  if (!email && process.env.NODE_ENV === "development") {
    email = "agent@test.com";
  }

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const fileId = id;
  if (!fileId) return NextResponse.json({ error: "Missing file id" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const file = await prisma.fileObject.findFirst({
    where: { id: fileId, ownerId: user.id },
    select: { id: true, s3Key: true },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  // delete DB row
  await prisma.fileObject.delete({ where: { id: fileId } });

  // best-effort S3 delete
  const bucket = process.env.S3_BUCKET;
  if (bucket) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: file.s3Key }));
    } catch (e) {
      console.error("S3 delete failed:", e);
    }
  }

  return NextResponse.json({ ok: true, deletedId: fileId });
}
