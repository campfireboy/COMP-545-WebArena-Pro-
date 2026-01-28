"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import CodeEditor from "@/components/CodeEditor";
import RichTextEditor from "@/components/RichTextEditor";
import SpreadsheetEditor from "@/components/SpreadsheetEditor";
import { ShareModal } from "@/components/ShareDialogs";
import { Users } from "lucide-react";

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
    const [editorType, setEditorType] = useState<"code" | "richtext" | "spreadsheet" | null>(null);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [shareModalOpen, setShareModalOpen] = useState(false);

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
                } else if (name.endsWith(".csv")) {
                    setEditorType("spreadsheet");
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

    const handleRename = async () => {
        if (!file || !renameValue.trim() || renameValue.trim() === file.name) {
            setIsRenaming(false);
            return;
        }

        try {
            const newName = renameValue.trim();
            const res = await fetch(`/api/rename`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: file.id, type: "file", name: newName }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                alert(data.error || "Failed to rename");
                setIsRenaming(false);
                setRenameValue(file.name);
            } else {
                setFile({ ...file, name: newName });
                setIsRenaming(false);
                // Optionally refresh metadata or history if needed
            }
        } catch (e) {
            console.error(e);
            alert("Failed to rename");
            setIsRenaming(false);
        }
    };

    return (
        <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
            <Sidebar activePage="drive" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <Header
                    title={
                        <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={{ marginRight: 8 }}>Editing:</span>
                            {isRenaming ? (
                                <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onBlur={handleRename}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleRename();
                                        if (e.key === "Escape") {
                                            setIsRenaming(false);
                                            setRenameValue(file.name);
                                        }
                                    }}
                                    style={{
                                        fontSize: 18,
                                        padding: "4px 8px",
                                        border: "1px solid #1a73e8",
                                        borderRadius: 4,
                                        outline: "none"
                                    }}
                                />
                            ) : (
                                <span
                                    onDoubleClick={() => {
                                        setRenameValue(file.name);
                                        setIsRenaming(true);
                                    }}
                                    title="Double click to rename"
                                    style={{
                                        cursor: "text",
                                        padding: "4px 8px",
                                        border: "1px solid transparent",
                                        borderRadius: 4,
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.border = "1px solid #ddd"}
                                    onMouseLeave={(e) => e.currentTarget.style.border = "1px solid transparent"}
                                >
                                    {file.name}
                                </span>
                            )}
                        </div>
                    }
                    actions={
                        <button
                            data-testid="editor-share-button"
                            onClick={() => setShareModalOpen(true)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 16px",
                                background: "#c2e7ff",
                                color: "#001d35",
                                border: "none",
                                borderRadius: 20,
                                cursor: "pointer",
                                fontWeight: 500,
                                fontSize: 14
                            }}
                        >
                            <Users size={18} />
                            Share
                        </button>
                    }
                />
                <main style={{ flex: 1, display: "flex", flexDirection: "column", padding: 20, overflow: "hidden" }}>
                    {editorType === "richtext" ? (
                        <RichTextEditor fileId={fileId} initialFile={file} />
                    ) : editorType === "spreadsheet" ? (
                        <SpreadsheetEditor fileId={fileId} initialFile={file} />
                    ) : (
                        <CodeEditor fileId={fileId} initialFile={file} />
                    )}
                </main>
                {shareModalOpen && file && (
                    <ShareModal
                        kind="file"
                        id={file.id}
                        name={file.name}
                        onClose={() => setShareModalOpen(false)}
                    />
                )}
            </div>
        </div>
    );
}
