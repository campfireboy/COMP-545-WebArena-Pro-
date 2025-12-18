import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { authOptions } from "@/lib/authOptions";
//This is the route.ts for presign
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = z.object({
    name: z.string().min(1),
    size: z.number().int().nonnegative(),
    mimeType: z.string().min(1),
    s3Key: z.string().min(1),
    folderId: z.string().nullable(),
  }).safeParse(body);

  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let fileOwnerId = user.id;
  let sharesToCreate: any[] = [];

  if (parsed.data.folderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: parsed.data.folderId },
      include: { shares: true }
    });

    if (folder && folder.ownerId !== user.id) {
      // 1. Transfer ownership to folder owner
      fileOwnerId = folder.ownerId;

      // 2. Share with the uploader (EDIT permission)
      sharesToCreate.push({
        ownerId: folder.ownerId,
        sharedWithUserId: user.id,
        permission: "EDIT",
      });

      // 3. Share with everyone else who has access to the folder
      // (Cascading shares)
      for (const s of folder.shares) {
        if (s.sharedWithUserId && s.sharedWithUserId !== user.id) {
          sharesToCreate.push({
            ownerId: folder.ownerId,
            sharedWithUserId: s.sharedWithUserId,
            permission: s.permission,
          });
        }
      }
    }
  }

  const file = await prisma.fileObject.create({
    data: {
      name: parsed.data.name,
      size: parsed.data.size,
      mimeType: parsed.data.mimeType,
      s3Key: parsed.data.s3Key,
      ownerId: fileOwnerId,
      folderId: parsed.data.folderId,
      shares: {
        create: sharesToCreate
      }
    },
  });

  return NextResponse.json({ file });
}
