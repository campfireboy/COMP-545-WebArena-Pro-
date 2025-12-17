import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import crypto from "crypto";

import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { s3 } from "@/lib/s3";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  let email = session?.user?.email;

  // DEV BYPASS
  if (!email && process.env.NODE_ENV === "development") {
    email = "agent@test.com";
  }

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = z
    .object({
      name: z.string().min(1),
      size: z.number().int().nonnegative(),
      mimeType: z.string().min(1),
      folderId: z.string().nullable(),
    })
    .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Optional safety: verify folder ownership (if folderId provided)
  if (parsed.data.folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: parsed.data.folderId } });
    if (!folder || folder.ownerId !== user.id) {
      return NextResponse.json({ error: "Invalid folderId" }, { status: 400 });
    }
  }

  const safeName = parsed.data.name.replaceAll("/", "_");
  const s3Key = `${user.id}/${crypto.randomUUID()}-${safeName}`;

  const cmd = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: s3Key,
    ContentType: parsed.data.mimeType,
  });

  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 });

  return NextResponse.json({ uploadUrl, s3Key });
}
