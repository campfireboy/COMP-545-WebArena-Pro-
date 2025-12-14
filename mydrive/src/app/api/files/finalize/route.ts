import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { authOptions } from "@/lib/authOptions";
//This is the route.ts for presign
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = z.object({
    name: z.string().min(1),
    size: z.number().int().nonnegative(),
    mimeType: z.string().min(1),
    s3Key: z.string().min(1),
    folderId: z.string().nullable(),
  }).safeParse(body);

  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = await prisma.fileObject.create({
    data: {
      name: parsed.data.name,
      size: parsed.data.size,
      mimeType: parsed.data.mimeType,
      s3Key: parsed.data.s3Key,
      ownerId: user.id,
      folderId: parsed.data.folderId,
    },
  });

  return NextResponse.json({ file });
}
