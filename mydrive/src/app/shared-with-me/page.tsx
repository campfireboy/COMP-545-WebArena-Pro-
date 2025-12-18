"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

type SharedItem = {
    id: string;
    permission: string;
    createdAt: string;
    file?: { id: string; name: string; mimeType: string; size: number };
    folder?: { id: string; name: string };
    owner: { id: string; email: string; name: string | null };
};

import { Sidebar } from "@/components/Sidebar";

export default function SharedWithMePage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [items, setItems] = useState<SharedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    useEffect(() => {
        if (status === "authenticated") {
            loadSharedItems();
        }
    }, [status]);

    async function loadSharedItems() {
        setLoading(true);
        const res = await fetch("/api/shared-with-me");
        if (res.ok) {
            const data = await res.json();
            setItems(data);
        }
        setLoading(false);
    }

    const filteredItems = items.filter(i => {
        const name = i.folder?.name || i.file?.name || "";
        return name.toLowerCase().includes(search.toLowerCase());
    });

    const sharedFolders = filteredItems.filter(i => i.folder);
    const sharedFiles = filteredItems.filter(i => i.file);

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
            {/* Sidebar */}
            <Sidebar activePage="shared" />

            {/* Main */}
            <main style={{ flex: 1, padding: 16, background: "white", position: "relative" }}>
                {/* Top Bar */}
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
                    <input
                        placeholder="Search shared files..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 10 }}
                    />
                    <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "white" }}>
                        Sign Out
                    </button>
                </div>

                <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 24px 0" }}>Shared with me</h1>

                {loading ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#666" }}>Loading...</div>
                ) : items.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 60, color: "#666", border: "1px dashed #ddd", borderRadius: 12 }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
                        <div style={{ fontSize: 16 }}>No items shared with you</div>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                        {/* SHARED FOLDERS */}
                        {sharedFolders.length > 0 && (
                            <section>
                                <div style={{ fontWeight: 800, marginBottom: 12 }}>Folders</div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                                    {sharedFolders.map(item => (
                                        <div key={item.id}
                                            onClick={() => item.folder && router.push(`/shared-with-me/f/${item.folder.id}`)}
                                            style={{
                                                border: "1px solid #eee", padding: 12, borderRadius: 12,
                                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                                cursor: "pointer", background: "white"
                                            }}
                                            title={`Shared by ${item.owner.name || item.owner.email}`}
                                        >
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {item.folder?.name}
                                                </div>
                                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                    Shared by {item.owner.name || item.owner.email?.split('@')[0]}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 20 }}>📁</div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* SHARED FILES */}
                        {sharedFiles.length > 0 && (
                            <section>
                                <div style={{ fontWeight: 800, marginBottom: 12 }}>Files</div>
                                <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
                                    {sharedFiles.map(item => (
                                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderBottom: "1px solid #f2f2f2", alignItems: "center" }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 700 }}>{item.file?.name}</div>
                                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                    {item.file?.mimeType} • {item.file?.size ? Math.round(item.file.size / 1024) + " KB" : ""} • Shared by {item.owner.name || item.owner.email?.split('@')[0]}
                                                </div>
                                            </div>
                                            <div>
                                                <a
                                                    href={`/api/files/${item.file?.id}/download`}
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

                        {filteredItems.length === 0 && (
                            <div style={{ opacity: 0.6 }}>No matching items</div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
