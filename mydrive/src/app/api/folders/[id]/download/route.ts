import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { s3 } from "@/lib/s3";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = await prisma.fileObject.findUnique({
    where: { id: params.id },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // For now: owner-only. (Later: allow shares)
  if (file.ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cmd = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: file.s3Key,
  });

  const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });
  return NextResponse.json({ url });
}
