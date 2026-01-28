
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { z } from "zod";

const searchSchema = z.object({
    q: z.string().min(1),
    parentId: z.string().nullable().optional(),
});

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const q = url.searchParams.get("q");
    const parentIdParam = url.searchParams.get("parentId");
    const parentId = !parentIdParam || parentIdParam === "null" ? null : parentIdParam;

    if (!q) {
        return NextResponse.json({ results: [] });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 1. Fetch ALL matches for the user (owned or shared)
    // Optimization: In a real app we'd use a Recursive CTE or specific index. 
    // Here we fetch all matches and filter in code for simplicity/correctness given Prisma limitations.

    // Matches in Files
    const files = await prisma.fileObject.findMany({
        where: {
            name: { contains: q, mode: 'insensitive' },
            OR: [
                { ownerId: user.id },
                { shares: { some: { sharedWithUserId: user.id } } }
            ]
        },
        select: { id: true, name: true, folderId: true, mimeType: true, size: true, owner: { select: { email: true, name: true, username: true } } }
    });

    // Matches in Folders
    const folders = await prisma.folder.findMany({
        where: {
            name: { contains: q, mode: 'insensitive' },
            OR: [
                { ownerId: user.id },
                { shares: { some: { sharedWithUserId: user.id } } }
            ]
        },
        select: { id: true, name: true, parentId: true, owner: { select: { email: true, name: true, username: true } } }
    });

    // Helper to build path and check scope
    // Returns path string if in scope, null otherwise
    const cache = new Map<string, { name: string, parentId: string | null }>();

    // Pre-fill cache with what we have? No, parents might not be in search results.

    async function resolvePathAndScope(currentId: string | null): Promise<string | null> {
        if (!currentId) return ""; // Root

        const pathParts: string[] = [];
        let pointer: string | null = currentId;

        while (pointer) {
            if (pointer === parentId) {
                // Reached the scope!
                // Return the path built so far (reversed)
                return pathParts.reverse().join("/");
            }

            // Fetch folder info
            // Fetch folder info
            if (!cache.has(pointer)) {
                const dbFolder = await prisma.folder.findUnique({ where: { id: pointer }, select: { id: true, name: true, parentId: true } });
                if (!dbFolder) return null; // Orphaned?
                cache.set(pointer, dbFolder);
            }
            const cachedFolderNode = cache.get(pointer) as { name: string, parentId: string | null };

            pathParts.push(cachedFolderNode.name);
            pointer = cachedFolderNode.parentId;
        }

        // Reached root
        if (parentId === null) {
            return pathParts.reverse().join("/");
        }

        // Reached root but scope was set -> Out of scope
        return null;
    }

    const results: any[] = [];

    // Process Folders
    for (const f of folders) {
        // If parentId is set, we need to verify f.id is a descendant of parentId
        // If f.id == parentId, we usually don't show the root folder itself in its own search?
        if (f.id === parentId) continue;

        const path = await resolvePathAndScope(f.parentId);
        if (path !== null) {
            results.push({ ...f, kind: "folder", path: path ? `/${path}` : "/" });
        }
    }

    // Process Files
    for (const f of files) {
        const path = await resolvePathAndScope(f.folderId);
        if (path !== null) {
            results.push({ ...f, kind: "file", path: path ? `/${path}` : "/" });
        }
    }

    return NextResponse.json({ results });
}
