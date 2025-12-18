"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { MediaPreviewModal } from "@/components/MediaPreviewModal";

// --- Menu Components (Duplicated for now) ---
function MenuItem({ label, onClick, danger, icon }: { label: string, onClick: () => void, danger?: boolean, icon?: React.ReactNode }) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            style={{
                display: "flex", alignItems: "center", width: "100%", padding: "10px 16px",
                border: "none", background: "transparent", cursor: "pointer",
                color: danger ? "#d93025" : "#333", fontSize: 13, textAlign: "left"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#f1f3f4"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
            {icon && <span style={{ marginRight: 12 }}>{icon}</span>}
            {label}
        </button>
    );
}

function MenuDivider() {
    return <div style={{ height: 1, background: "#e0e0e0", margin: "4px 0" }} />;
}

type SharedItem = {
    id: string;
    permission: string;
    createdAt: string;
    file?: { id: string; name: string; mimeType: string; size: number };
    folder?: { id: string; name: string };
    owner: { id: string; email: string; name: string | null; username?: string | null };
};

export default function SharedWithMePage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [items, setItems] = useState<SharedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Selection & Menu State
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // Format: "folder:id" or "file:id" (using SharedItem ID might be safer but we need target ID for nav)
    // Actually for "Shared with me", operations are on the SHARED link often?
    // But for Open/Download we need the target. 
    // I'll track by `item.id` (the shared item ID) to be unique in this list.
    // And I'll lookup the item object to act on it.

    const [menu, setMenu] = useState<{ id: string, x: number, y: number, multi: boolean, item?: SharedItem } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [previewFile, setPreviewFile] = useState<any | null>(null);

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

    useEffect(() => {
        function onClick(e: MouseEvent) {
            // If clicking outside menu, close menu
            if (menu && menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenu(null);
            }
        }
        window.addEventListener("mousedown", onClick);
        return () => window.removeEventListener("mousedown", onClick);
    }, [menu]);

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

    // -- Selection Logic --
    function handleSelectionClick(e: React.MouseEvent, itemId: string) {
        if (selectionMode) {
            e.stopPropagation();
            e.preventDefault(); // Prevent opening
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(itemId)) next.delete(itemId);
                else next.add(itemId);
                return next;
            });
        }
    }

    function toggleSelectionMode(e: React.MouseEvent, itemId: string) {
        e.stopPropagation();
        setSelectionMode(true);
        setSelectedIds(new Set([itemId]));
        setMenu(null);
    }

    function clearSelection() {
        setSelectedIds(new Set());
        setSelectionMode(false);
    }

    // -- Context Menu --
    function handleContextMenu(e: React.MouseEvent, item: SharedItem) {
        e.preventDefault();
        e.stopPropagation();

        let newSelection = new Set(selectedIds);
        if (!selectedIds.has(item.id)) {
            newSelection = new Set([item.id]);
        }
        setSelectedIds(newSelection);
        setMenu({ id: item.id, x: e.clientX, y: e.clientY, multi: newSelection.size > 1, item });
    }

    // -- Actions --
    function openItem(item: SharedItem) {
        if (item.folder) {
            router.push(`/shared-with-me/f/${item.folder.id}`);
        } else if (item.file) {
            const f = item.file;
            if (["image/jpeg", "video/mp4", "audio/mpeg"].includes(f.mimeType)) {
                setPreviewFile(f);
            } else {
                router.push(`/drive/file/${f.id}`);
            }
        }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <Header />
            <div style={{ display: "flex", flex: 1 }}>
                <Sidebar activePage="shared" />

                <main
                    onClick={() => { if (selectionMode) clearSelection(); }}
                    style={{ flex: 1, padding: 16, background: "white", position: "relative" }}
                >
                    {/* Top Bar / Toolbar */}
                    <div style={{ marginBottom: 16, height: 40, display: "flex", alignItems: "center" }}>
                        {selectionMode && selectedIds.size > 0 ? (
                            <div style={{
                                display: "flex", alignItems: "center", gap: 16,
                                background: "#e8f0fe", color: "#1967d2", padding: "8px 16px", borderRadius: 8, width: "100%",
                                animation: "fadeIn 0.2s"
                            }}>
                                <button onClick={(e) => { e.stopPropagation(); clearSelection(); }} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "inherit", padding: 0 }}>✕</button>
                                <span style={{ fontWeight: 600 }}>{selectedIds.size} selected</span>
                                <div style={{ flex: 1 }} />
                                {/* Actions for shared items? Downloading only usually */}
                                <button title="Download" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }} onClick={() => alert("Bulk download not implemented yet")}>⬇️</button>
                            </div>
                        ) : (
                            <input
                                placeholder="Search shared files..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onFocus={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 10 }}
                            />
                        )}
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
                                        {sharedFolders.map(item => {
                                            const isSelected = selectedIds.has(item.id);
                                            return (
                                                <div key={item.id}
                                                    onClick={(e) => {
                                                        if (selectionMode) handleSelectionClick(e, item.id);
                                                        else {
                                                            // Logic for folders: Click usually opens? Or Selects?
                                                            // DriveView: Single click selects, Double click opens.
                                                            // We'll mimic DriveView Single Click logic if we want consistency, 
                                                            // But here we rely on "selectionMode" toggle.
                                                            // If NOT in selection mode, click -> Open (Simpler) or Double Click?
                                                            // Let's do: Click -> Open for simplicity unless we want strict Drive parity.
                                                            // Drive parity: Click selects (highlight), Double click opens.
                                                            // I'll stick to: Click -> Open, unless Right Click -> Select.
                                                            openItem(item);
                                                        }
                                                    }}
                                                    onContextMenu={(e) => handleContextMenu(e, item)}
                                                    style={{
                                                        border: "1px solid #eee", padding: 12, borderRadius: 12,
                                                        display: "flex", alignItems: "center", justifyContent: "space-between",
                                                        cursor: "pointer", background: isSelected ? "#e8f0fe" : "white",
                                                        borderColor: isSelected ? "#1a73e8" : "#eee",
                                                        position: "relative"
                                                    }}
                                                    title={`Shared by ${item.owner.username || item.owner.name || item.owner.email}`}
                                                >
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                            {item.folder?.name}
                                                        </div>
                                                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                            Shared by {item.owner.username || item.owner.name || item.owner.email?.split('@')[0]}
                                                        </div>
                                                    </div>

                                                    {selectionMode ? (
                                                        <div
                                                            onClick={(e) => handleSelectionClick(e, item.id)}
                                                            style={{
                                                                width: 24, height: 24, borderRadius: 6,
                                                                border: "2px solid", borderColor: isSelected ? "#1a73e8" : "#ccc",
                                                                background: isSelected ? "#1a73e8" : "white",
                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                                zIndex: 10
                                                            }}
                                                        >
                                                            {isSelected && <span style={{ color: "white", fontSize: 14 }}>✓</span>}
                                                        </div>
                                                    ) : (
                                                        <div style={{ fontSize: 20 }}>📁</div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {/* SHARED FILES */}
                            {sharedFiles.length > 0 && (
                                <section>
                                    <div style={{ fontWeight: 800, marginBottom: 12 }}>Files</div>
                                    <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
                                        {sharedFiles.map(item => {
                                            const isSelected = selectedIds.has(item.id);
                                            return (
                                                <div key={item.id}
                                                    onClick={(e) => {
                                                        if (selectionMode) handleSelectionClick(e, item.id);
                                                    }}
                                                    onDoubleClick={() => openItem(item)}
                                                    onContextMenu={(e) => handleContextMenu(e, item)}
                                                    style={{
                                                        display: "flex", justifyContent: "space-between", padding: 12,
                                                        borderBottom: "1px solid #f2f2f2", alignItems: "center",
                                                        background: isSelected ? "#e8f0fe" : "white",
                                                        cursor: "default"
                                                    }}
                                                >
                                                    <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                                                        <div style={{ width: 40, height: 40, background: "#f1f3f4", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                            {item.file?.mimeType.startsWith("image/") ? "🖼️" : item.file?.mimeType.startsWith("video/") ? "🎥" : "📄"}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700 }}>{item.file?.name}</div>
                                                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                                {item.file?.mimeType} • {item.file?.size ? Math.round(item.file.size / 1024) + " KB" : ""} • Shared by {item.owner.username || item.owner.name || item.owner.email?.split('@')[0]}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {selectionMode ? (
                                                        <div
                                                            onClick={(e) => handleSelectionClick(e, item.id)}
                                                            style={{
                                                                width: 24, height: 24, borderRadius: 6,
                                                                border: "2px solid", borderColor: isSelected ? "#1a73e8" : "#ccc",
                                                                background: isSelected ? "#1a73e8" : "white",
                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                                cursor: "pointer"
                                                            }}
                                                        >
                                                            {isSelected && <span style={{ color: "white", fontSize: 14 }}>✓</span>}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => { handleContextMenu(e, item); }}
                                                            style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", marginLeft: 8 }}
                                                        >
                                                            ⋯
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {filteredItems.length === 0 && (
                                <div style={{ opacity: 0.6 }}>No matching items</div>
                            )}
                        </div>
                    )}

                    {/* CONTEXT MENU */}
                    {menu && (
                        <div
                            ref={menuRef}
                            style={{
                                position: "fixed", top: menu.y, left: menu.x - 200,
                                background: "white", border: "1px solid #ddd", borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.1)", zIndex: 3000,
                                width: 200, display: "flex", flexDirection: "column"
                            }}
                        >
                            {menu.multi ? (
                                <>
                                    <div style={{ padding: "8px 12px", fontSize: 12, color: "#666", fontWeight: 600 }}>{selectedIds.size} Selected</div>
                                    <MenuDivider />
                                    {/* Bulk actions limited for Shared root */}
                                </>
                            ) : (
                                <>
                                    <MenuItem label="Select" onClick={() => toggleSelectionMode({ stopPropagation: () => { } } as any, menu.id)} />
                                    <MenuItem label="Open" onClick={() => { if (menu.item) openItem(menu.item); setMenu(null); }} />
                                    {menu.item?.file && (
                                        <MenuItem label="Download" onClick={() => window.location.href = `/api/files/${menu.item!.file!.id}/download`} />
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </main>

                {previewFile && (
                    <MediaPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
                )}
            </div>
        </div >
    );
}
