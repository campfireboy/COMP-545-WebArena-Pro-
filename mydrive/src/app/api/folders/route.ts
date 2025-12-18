// src/app/api/folders/route.ts
//this is the version with the nested folders

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { z } from "zod";

const listQuerySchema = z.object({
  parentId: z.string().nullable().optional(),
});

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parentIdParam = url.searchParams.get("parentId");

  // parentId can be:
  // - omitted or "null" => root
  // - a folderId string
  const parentId =
    !parentIdParam || parentIdParam === "null" ? null : parentIdParam;

  const parsed = listQuerySchema.safeParse({ parentId });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parentId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Helper function to check if user has access to a folder recursively
  const hasAccessToFolder = async (folderId: string | null, userId: string): Promise<boolean> => {
    if (folderId === null) return true; // Root is always accessible (as "My Drive")

    let currentId: string | null = folderId;
    while (currentId) {
      const folder: any = await prisma.folder.findUnique({
        where: { id: currentId },
        select: {
          ownerId: true,
          parentId: true,
          shares: {
            where: { sharedWithUserId: userId },
            select: { id: true },
          },
        },
      });

      if (!folder) return false;

      // User owns this folder or it's shared with them
      if (folder.ownerId === userId || folder.shares.length > 0) {
        return true;
      }

      currentId = folder.parentId;
    }

    return false;
  };

  // Verify access
  if (parentId) {
    const hasAccess = await hasAccessToFolder(parentId, user.id);
    if (!hasAccess) {
      // For "My Drive", if we don't own it and it's not shared recursively, we deny.
      // Note: If accessing a shared folder, parentId will be that folder.
      return NextResponse.json({ error: "Folder not found or access denied" }, { status: 404 });
    }
  }

  let whereClauseFolders: any = { parentId };
  let whereClauseFiles: any = { folderId: parentId };

  if (parentId === null) {
    // Root: Strict ownership (My Drive)
    whereClauseFolders.ownerId = user.id;
    whereClauseFiles.ownerId = user.id;
  } else {
    // Subfolder: Access verified recursively above. Return content.
  }

  const [allFolders, allFiles] = await Promise.all([
    prisma.folder.findMany({
      where: whereClauseFolders,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
        ownerId: true,
        owner: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.fileObject.findMany({
      where: whereClauseFiles,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        size: true,
        mimeType: true,
        folderId: true,
        createdAt: true,
        ownerId: true,
        owner: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return NextResponse.json({
    parentId,
    folders: allFolders,
    files: allFiles,
  });
}

const createBodySchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, parentId } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // If parentId provided, ensure it belongs to the user
  if (parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: parentId, ownerId: user.id },
      select: { id: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }
  }

  const created = await prisma.folder.create({
    data: {
      name: name.trim(),
      ownerId: user.id,
      parentId: parentId ?? null,
    },
    select: { id: true, name: true, parentId: true, createdAt: true },
  });

  return NextResponse.json(created, { status: 201 });
}
