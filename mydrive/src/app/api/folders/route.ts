// src/app/api/folders/route.ts
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
  if (!session?.user?.email) {
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
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Verify parent folder belongs to user (if not root)
  if (parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: parentId, ownerId: user.id },
      select: { id: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }
  }

  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { ownerId: user.id, parentId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
      },
    }),
    prisma.fileObject.findMany({
      where: { ownerId: user.id, folderId: parentId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        size: true,
        mimeType: true,
        folderId: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    parentId,
    folders,
    files,
  });
}

const createBodySchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
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
    where: { email: session.user.email },
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
