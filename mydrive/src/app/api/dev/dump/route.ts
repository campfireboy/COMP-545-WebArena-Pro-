export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { s3 } from "../../../../lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import archiver from "archiver";

export async function POST(req: Request) {
    try {
        const url = new URL(req.url);
        const agentUsername = url.searchParams.get("agent") || "agent1"; // Default to agent1 if not provided? Or make it required.
        // Making it default to agent1 for backward compat or ease of use, but logic suggests explicit is better.
        // Let's stick to default "agent1" per my thought process, or maybe check body?
        // User said "agent1 dump agent2 dump", implies explicit toggle.

        const TARGET_DIR = path.resolve(process.cwd(), "../AgentLab/directory_downloads");
        const EXTRACT_DIR = path.join(TARGET_DIR, `${agentUsername}_dump`);

        // 1. Identify User
        const user = await prisma.user.findUnique({
            where: { username: agentUsername }
        });

        if (!user) {
            return NextResponse.json({ error: `Agent user '${agentUsername}' not found` }, { status: 404 });
        }

        // 2. Ensure Target Directory Exists
        try {
            await fs.rm(EXTRACT_DIR, { recursive: true, force: true });
            await fs.mkdir(EXTRACT_DIR, { recursive: true });
        } catch (e) {
            console.error("Cleanup error:", e);
            return NextResponse.json({ error: "Failed to clean target directory" }, { status: 500 });
        }

        // 3. Fetch Data
        const folders = await prisma.folder.findMany({
            where: { ownerId: user.id }
        });

        const files = await prisma.fileObject.findMany({
            where: { ownerId: user.id }
        });

        // 4. Build Path Map
        const folderMap = new Map();
        folders.forEach(f => folderMap.set(f.id, f));

        const pathCache = new Map<string, string>();

        const getFolderPath = (folderId: string | null): string => {
            if (!folderId) return "";
            if (pathCache.has(folderId)) return pathCache.get(folderId)!;

            const folder = folderMap.get(folderId);
            if (!folder) return "";

            const parentPath = getFolderPath(folder.parentId);
            const fullPath = (parentPath ? parentPath + "/" : "") + folder.name;

            pathCache.set(folderId, fullPath);
            return fullPath;
        };

        // 5. Direct Write to Disk (No Zip)

        // Create folders first
        for (const folder of folders) {
            const folderPath = getFolderPath(folder.id);
            if (folderPath) {
                const fullPath = path.join(EXTRACT_DIR, folderPath);
                await fs.mkdir(fullPath, { recursive: true });
            }
        }

        // Write files
        const downloadErrors: string[] = [];

        for (const file of files) {
            const folderPath = getFolderPath(file.folderId);
            const relativePath = (folderPath ? path.join(folderPath, file.name) : file.name);
            const fullPath = path.join(EXTRACT_DIR, relativePath);

            // Ensure parent dir exists (just in case)
            await fs.mkdir(path.dirname(fullPath), { recursive: true });

            try {
                const s3Params = {
                    Bucket: process.env.S3_BUCKET!,
                    Key: file.s3Key
                };
                const command = new GetObjectCommand(s3Params);
                const response = await s3.send(command);

                if (response.Body) {
                    // Convert stream to buffer and write
                    const byteArray = await response.Body.transformToByteArray();
                    await fs.writeFile(fullPath, byteArray);
                } else {
                    console.warn(`Empty body for file ${file.name} (${file.s3Key})`);
                    await fs.writeFile(fullPath + ".missing.txt", "Warning: Content missing in S3");
                }
            } catch (e) {
                console.error(`Failed to download file ${file.name} (${file.s3Key}):`, e);
                downloadErrors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
                await fs.writeFile(fullPath + ".error.txt", `Error downloading file: ${e}`);
            }
        }

        return NextResponse.json({
            ok: true,
            path: EXTRACT_DIR,
            items: folders.length + files.length,
            errors: downloadErrors.length > 0 ? downloadErrors : undefined
        });

    } catch (error) {
        console.error("Dump error:", error);
        return NextResponse.json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}

export async function GET(req: Request) {
    return POST(req);
}
