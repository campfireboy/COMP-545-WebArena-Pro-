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

    const folderNode: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: current },
      select: { parentId: true },
    });

    current = folderNode?.parentId ?? null;
  }

  return false;
}

async function collectDescendantFolderIds(rootId: string) {
  const all: string[] = [];
  let frontier: string[] = [rootId].filter((v): v is string => typeof v === "string" && v.length > 0);

  while (frontier.length) {
    all.push(...frontier);

    const children = await prisma.folder.findMany({
      where: { parentId: { in: frontier } },
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
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromReq(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing folder id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parentIdRaw = body?.parentId;
  const nameRaw = body?.name;

  const dataToUpdate: any = {};

  // Defensive fix: Rename OR Move
  if (typeof nameRaw === "string" && nameRaw.trim().length > 0) {
    dataToUpdate.name = nameRaw.trim();
  } else if (parentIdRaw !== undefined) {
    // Check source folder permission
    const folder = await prisma.folder.findUnique({
      where: { id },
      select: { id: true, ownerId: true, parentId: true },
    });
    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let canEdit = false;
    if (folder.ownerId === userId) {
      canEdit = true;
    } else if (folder.parentId) {
      const parent = await prisma.folder.findUnique({
        where: { id: folder.parentId },
        include: { shares: true }
      });
      if (parent) {
        if (parent.ownerId === userId) canEdit = true;
        else {
          const share = parent.shares.find(s => s.sharedWithUserId === userId && s.permission === "EDIT");
          if (share) canEdit = true;
        }
      }
    }

    if (!canEdit) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const newParentId: string | null =
      typeof parentIdRaw === "string" && parentIdRaw.trim().length > 0 ? parentIdRaw : null;

    dataToUpdate.parentId = newParentId;

    if (newParentId) {
      // Check destination permission (Ownership OR Edit access)
      const dest = await prisma.folder.findUnique({
        where: { id: newParentId },
        include: { shares: true }
      });

      let canMoveTo = false;
      if (dest) {
        if (dest.ownerId === userId) canMoveTo = true;
        else {
          const share = dest.shares.find(s => s.sharedWithUserId === userId && s.permission === "EDIT");
          if (share) canMoveTo = true;
        }
      }

      if (!canMoveTo) return NextResponse.json({ error: "Invalid destination or access denied" }, { status: 400 });

      if (await wouldCreateCycle(id, newParentId)) {
        return NextResponse.json(
          { error: "Cannot move folder into itself/descendant" },
          { status: 400 }
        );
      }
    }
  }

  if (Object.keys(dataToUpdate).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.folder.update({
    where: { id },
    data: dataToUpdate,
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

  const folder = await prisma.folder.findUnique({
    where: { id },
    select: { id: true, ownerId: true, parentId: true },
  });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let canDelete = false;
  if (folder.ownerId === userId) {
    canDelete = true;
  } else if (folder.parentId) {
    const parent = await prisma.folder.findUnique({
      where: { id: folder.parentId },
      include: { shares: true }
    });
    if (parent) {
      if (parent.ownerId === userId) canDelete = true;
      else {
        const share = parent.shares.find(s => s.sharedWithUserId === userId && s.permission === "EDIT");
        if (share) canDelete = true;
      }
    }
  }

  if (!canDelete) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const ids = await collectDescendantFolderIds(id);
  const idsBottomUp = [...ids].reverse();

  await prisma.$transaction(async (tx) => {
    // delete files in subtree first
    await tx.fileObject.deleteMany({
      where: { folderId: { in: ids } },
    });

    // delete folders bottom-up
    for (const fid of idsBottomUp) {
      await tx.folder.delete({ where: { id: fid } });
    }
  });

  return NextResponse.json({ ok: true });
}
