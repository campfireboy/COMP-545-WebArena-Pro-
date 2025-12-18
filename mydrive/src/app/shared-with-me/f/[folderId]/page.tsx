"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

type Folder = {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: string;
    owner?: { id: string; name: string | null; email: string };
};

type FileObject = {
    id: string;
    name: string;
    size: number;
    mimeType: string;
    folderId: string | null;
    createdAt: string;
    owner?: { id: string; name: string | null; email: string };
};

import { Sidebar } from "@/components/Sidebar";

export default function SharedFolderPage({ params }: { params: Promise<{ folderId: string }> }) {
    const { folderId } = use(params);
    const router = useRouter();
    const { data: session, status } = useSession();

    const [folders, setFolders] = useState<Folder[]>([]);
    const [files, setFiles] = useState<FileObject[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [parentFolder, setParentFolder] = useState<Folder | null>(null);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login"); // Redirect if not logged in
        }
    }, [status, router]);

    useEffect(() => {
        if (!folderId || status !== "authenticated") return;
        load();
        // Fetch parent details separately to get name/breadcrumb?
        // Actually api/folders doesn't return parent meta easily, but let's assume valid ID.
    }, [folderId, status]);

    async function load() {
        setLoading(true);
        const res = await fetch(`/api/folders?parentId=${folderId}`);
        if (res.ok) {
            const data = await res.json();
            setFolders(data.folders || []);
            setFiles(data.files || []);
        } else {
            // If 404/403, maybe redirect back?
            if (res.status === 404 || res.status === 403) {
                alert("Cannot access this folder");
                router.push("/shared-with-me");
            }
        }
        setLoading(false);
    }

    const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
            {/* Sidebar */}
            <Sidebar activePage="shared" />

            {/* Main */}
            <main style={{ flex: 1, padding: 16, background: "white", position: "relative" }}>
                {/* Top Bar */}
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
                    <div style={{ flex: 1, display: "flex", gap: 12 }}>
                        {/* Back Button */}
                        <button onClick={() => router.back()} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 20 }}>
                            ←
                        </button>
                        <input
                            placeholder="Search in folder..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 10 }}
                        />
                    </div>
                    <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "white" }}>
                        Sign Out
                    </button>
                </div>

                {loading ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#666" }}>Loading...</div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                        {/* FOLDERS */}
                        {filteredFolders.length > 0 && (
                            <section>
                                <div style={{ fontWeight: 800, marginBottom: 12 }}>Folders</div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                                    {filteredFolders.map(f => (
                                        <div key={f.id}
                                            onClick={() => router.push(`/shared-with-me/f/${f.id}`)}
                                            style={{
                                                border: "1px solid #eee", padding: 12, borderRadius: 12,
                                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                                cursor: "pointer", background: "white"
                                            }}
                                            title={`Shared by ${f.owner?.name || f.owner?.email}`}
                                        >
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {f.name}
                                                </div>
                                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                    Shared by {f.owner?.name || f.owner?.email?.split('@')[0] || "Unknown"}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 20 }}>📁</div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* FILES */}
                        {filteredFiles.length > 0 && (
                            <section>
                                <div style={{ fontWeight: 800, marginBottom: 12 }}>Files</div>
                                <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
                                    {filteredFiles.map(file => (
                                        <div key={file.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderBottom: "1px solid #f2f2f2", alignItems: "center" }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 700 }}>{file.name}</div>
                                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                    {file.mimeType} • {file.size ? Math.round(file.size / 1024) + " KB" : ""} • Shared by {file.owner?.name || file.owner?.email?.split('@')[0] || "Unknown"}
                                                </div>
                                            </div>
                                            <div>
                                                <a
                                                    href={`/api/files/${file.id}/download`}
                                                    style={{
                                                        display: "inline-flex", alignItems: "center", gap: 6,
                                                        padding: "6px 12px", borderRadius: 8,
                                                        border: "1px solid #ddd", background: "white",
                                                        textDecoration: "none", color: "inherit", fontSize: 12, fontWeight: 500
                                                    }}
                                                >
                                                    📥 Download
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {filteredFolders.length === 0 && filteredFiles.length === 0 && (
                            <div style={{ textAlign: "center", padding: 60, color: "#666", border: "1px dashed #ddd", borderRadius: 12 }}>
                                <div style={{ fontSize: 16 }}>Empty folder</div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
