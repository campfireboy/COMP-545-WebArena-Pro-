import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const trashQuerySchema = z.object({
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
    const parentId = !parentIdParam || parentIdParam === "null" ? null : parentIdParam;

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    let folderQuery: any = { ownerId: user.id, inTrash: true };
    let fileQuery: any = { ownerId: user.id, inTrash: true };

    if (parentId) {
        // Fetch specific trashed items inside this trashed folder
        folderQuery.parentId = parentId;
        fileQuery.folderId = parentId;
    } else {
        // Fetch top-level trashed items: items that are inTrash but their parent is not inTrash (or they have no parent).
        // For folders:
        folderQuery.OR = [
            { parentId: null },
            { parent: { inTrash: false } }
        ];
        // For files:
        fileQuery.OR = [
            { folderId: null },
            { folder: { inTrash: false } }
        ];
    }

    const [trashedFolders, trashedFiles] = await Promise.all([
        prisma.folder.findMany({
            where: folderQuery,
            orderBy: { createdAt: "desc" },
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
            where: fileQuery,
            orderBy: { createdAt: "desc" },
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

    // Calculate breadcrumbs if we're inside a trashed folder
    const breadcrumbs: { id: string; name: string }[] = [];
    if (parentId) {
        let currentId: string | null = parentId;
        while (currentId) {
            const ancestor: { id: string; name: string; parentId: string | null; inTrash: boolean } | null = await prisma.folder.findUnique({
                where: { id: currentId },
                select: { id: true, name: true, parentId: true, inTrash: true },
            });
            if (ancestor) {
                if (ancestor.inTrash) {
                    breadcrumbs.unshift({ id: ancestor.id, name: ancestor.name });
                }
                currentId = ancestor.parentId;
            } else {
                break;
            }
        }
    }

    return NextResponse.json({
        folders: trashedFolders,
        files: trashedFiles,
        breadcrumbs
    });
}

