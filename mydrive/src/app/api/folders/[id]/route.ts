import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUserIdFromReq(req: Request) {
  const token = await getToken({ req: req as any, secret: process.env.NEXTAUTH_SECRET });
  const email = token?.email;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email: String(email) },
    select: { id: true },
  });

  return user?.id ?? null;
}

async function wouldCreateCycle(folderId: string, newParentId: string) {
  let current: string | null = newParentId;

  while (current) {
    if (current === folderId) return true;

    const f = await prisma.folder.findUnique({
      where: { id: current },
      select: { parentId: true },
    });

    current = f?.parentId ?? null;
  }

  return false;
}

async function collectDescendantFolderIds(rootId: string, ownerId: string) {
  const all: string[] = [];
  let frontier: string[] = [rootId].filter((v): v is string => typeof v === "string" && v.length > 0);


  while (frontier.length) {
    all.push(...frontier);

    const children = await prisma.folder.findMany({
      where: { ownerId, parentId: { in: frontier } },
      select: { id: true },
    });

   frontier = children
  .map((c) => c.id)
  .filter((v): v is string => typeof v === "string" && v.length > 0);

  }

  return all;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserIdFromReq(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

if (!id || typeof id !== "string") {
  return NextResponse.json({ error: "Missing folder id" }, { status: 400 });
}


  const body = await req.json().catch(() => ({}));
  const parentIdRaw = body?.parentId;

  const newParentId: string | null =
    typeof parentIdRaw === "string" && parentIdRaw.trim().length > 0 ? parentIdRaw : null;

  const folder = await prisma.folder.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (newParentId) {
    const dest = await prisma.folder.findFirst({
      where: { id: newParentId, ownerId: userId },
      select: { id: true },
    });
    if (!dest) return NextResponse.json({ error: "Invalid destination" }, { status: 400 });

    if (await wouldCreateCycle(id, newParentId)) {
      return NextResponse.json(
        { error: "Cannot move folder into itself/descendant" },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.folder.update({
    where: { id },
    data: { parentId: newParentId },
    select: { id: true, name: true, parentId: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {

  const userId = await getUserIdFromReq(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;

if (!id || typeof id !== "string") {
  return NextResponse.json({ error: "Missing folder id" }, { status: 400 });
}

  const folder = await prisma.folder.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ids = await collectDescendantFolderIds(id, userId);
  const idsBottomUp = [...ids].reverse();

  await prisma.$transaction(async (tx) => {
    // delete files in subtree first
    await tx.fileObject.deleteMany({
      where: { ownerId: userId, folderId: { in: ids } },
    });

    // delete folders bottom-up
    for (const fid of idsBottomUp) {
      await tx.folder.delete({ where: { id: fid } });
    }
  });

  return NextResponse.json({ ok: true });
}
