"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import CodeEditor from "@/components/CodeEditor";
import RichTextEditor from "@/components/RichTextEditor";

type FileObject = {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    folderId: string | null;
    ownerId: string;
};

export default function EditorPage({ params }: { params: Promise<{ fileId: string }> }) {
    const { fileId } = use(params);
    const router = useRouter();
    const [file, setFile] = useState<FileObject | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [editorType, setEditorType] = useState<"code" | "richtext" | null>(null);

    useEffect(() => {
        async function fetchFile() {
            try {
                // We fetch download purely to get headers/metadata first.
                // The actual content loading is handled inside the editors via Yjs or fallback fetch.
                const res = await fetch(`/api/files/${fileId}/download`, { method: 'HEAD' });

                // Fallback to GET if HEAD fails or doesn't return headers (some setups)
                const headers = res.ok ? res.headers : (await fetch(`/api/files/${fileId}/download`)).headers;

                if (!headers.get("Content-Type")) throw new Error("File not found");

                const type = headers.get("Content-Type") || "";
                const disposition = headers.get("Content-Disposition") || "";
                const name = disposition.split("filename=")[1]?.replace(/"/g, "") || "Untitled";

                // Determine Editor Type
                if (name.endsWith(".doc")) {
                    setEditorType("richtext");
                } else {
                    setEditorType("code");
                }

                setFile({
                    id: fileId,
                    name,
                    mimeType: type,
                    size: parseInt(headers.get("Content-Length") || "0"),
                    folderId: null,
                    ownerId: ""
                });

            } catch (err) {
                console.error(err);
                setError("Failed to load file metadata.");
            }
            setLoading(false);
        }
        fetchFile();
    }, [fileId]);

    if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

    if (error || !file) return (
        <div style={{ padding: 20, color: "red" }}>
            {error || "File not found"}
            <br />
            <button onClick={() => router.back()} style={{ marginTop: 10 }}>Go Back</button>
        </div>
    );

    return (
        <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
            <Sidebar activePage="drive" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <Header title={`Editing: ${file.name}`} />
                <main style={{ flex: 1, display: "flex", flexDirection: "column", padding: 20, overflow: "hidden" }}>
                    {editorType === "richtext" ? (
                        <RichTextEditor fileId={fileId} initialFile={file} />
                    ) : (
                        <CodeEditor fileId={fileId} initialFile={file} />
                    )}
                </main>
            </div>
        </div>
    );
}
