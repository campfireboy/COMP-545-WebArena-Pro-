"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
    Folder, FileText, Image as ImageIcon, Music, Video,
    MoreVertical, X, Search, Check, Download, Users, Share2, RefreshCw
} from "lucide-react";

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
                color: danger ? "#d93025" : "#1f1f1f", fontSize: 14, textAlign: "left",
                gap: 12
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#f1f3f4"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
            {icon && <span>{icon}</span>}
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
            if (["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "audio/mpeg"].includes(f.mimeType)) {
                setPreviewFile(f);
            } else {
                router.push(`/drive/file/${f.id}`);
            }
        }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <Header />
            <div style={{ display: "flex", flex: 1, position: "relative" }}>
                <Sidebar activePage="shared" />

                <main
                    onClick={() => { if (selectionMode) clearSelection(); }}
                    style={{ flex: 1, padding: 16, background: "white", position: "relative" }}
                >
                    {/* Top Bar / Toolbar */}
                    <div style={{ marginBottom: 24 }}>
                        {selectionMode && selectedIds.size > 0 ? (
                            <div style={{
                                display: "flex", alignItems: "center", gap: 16,
                                background: "#f8fafd", color: "#1f1f1f", padding: "8px 16px", borderRadius: 12, width: "100%",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                                animation: "fadeIn 0.2s"
                            }}>
                                <button onClick={(e) => { e.stopPropagation(); clearSelection(); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#444746", display: "flex", alignItems: "center" }}><X size={20} /></button>
                                <span style={{ fontWeight: 500 }}>{selectedIds.size} selected</span>
                                <div style={{ flex: 1 }} />
                                {/* Actions for shared items? Downloading only usually */}
                                <button title="Download" style={{ background: "none", border: "none", cursor: "pointer", color: "#444746" }} onClick={() => alert("Bulk download not implemented yet")}><Download size={20} /></button>
                            </div>
                        ) : (
                            <div style={{ marginBottom: 0, position: "relative" }} onClick={(e) => e.stopPropagation()}>
                                <Search
                                    size={20}
                                    style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#444746" }}
                                />
                                <input
                                    placeholder="Search shared files..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    style={{
                                        width: "100%", padding: "12px 12px 12px 48px",
                                        border: "none", borderRadius: 24,
                                        background: "#e9eef6", fontSize: 16, transition: "background 0.2s, box-shadow 0.2s", color: "#1f1f1f"
                                    }}
                                    onFocus={(e) => {
                                        e.target.style.background = "white";
                                        e.target.style.boxShadow = "0 1px 2px rgba(0,0,0,0.3)";
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.background = "#e9eef6";
                                        e.target.style.boxShadow = "none";
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    <h1 style={{ fontSize: 22, fontWeight: 400, margin: "0 0 24px 0", color: "#444746" }}>Shared with me</h1>

                    {loading ? (
                        <div style={{ textAlign: "center", padding: 40, color: "#666" }}>Loading...</div>
                    ) : items.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 60, color: "#444746", border: "1px dashed #c4c7c5", borderRadius: 12 }}>
                            <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}><Users size={48} color="#c4c7c5" /></div>
                            <div style={{ fontSize: 16 }}>No items shared with you</div>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                            {/* SHARED FOLDERS */}
                            {sharedFolders.length > 0 && (
                                <section>
                                    <div style={{ fontWeight: 500, marginBottom: 12, color: "#444746" }}>Folders</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                                        {sharedFolders.map(item => {
                                            const isSelected = selectedIds.has(item.id);
                                            return (
                                                <div key={item.id}
                                                    data-testid={`shared-folder-${item.folder?.name}`}
                                                    onClick={(e) => {
                                                        if (selectionMode) handleSelectionClick(e, item.id);
                                                        else {
                                                            openItem(item);
                                                        }
                                                    }}
                                                    onContextMenu={(e) => handleContextMenu(e, item)}
                                                    style={{
                                                        border: "1px solid #c4c7c5", padding: 12, borderRadius: 12,
                                                        display: "flex", alignItems: "center", justifyContent: "space-between",
                                                        cursor: "pointer", background: isSelected ? "#c2e7ff" : "white",
                                                        transition: "background 0.1s",
                                                        position: "relative"
                                                    }}
                                                    title={`Shared by ${item.owner.username || item.owner.name || item.owner.email}`}
                                                >
                                                    <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 12 }}>
                                                        <div style={{ color: isSelected ? "#001d35" : "#444746" }}><Folder size={24} fill="currentColor" /></div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 500, color: "#1f1f1f", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                                {item.folder?.name}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: "#5e5e5e" }}>
                                                                {item.owner.username || item.owner.name || item.owner.email?.split('@')[0]}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {selectionMode && (
                                                        <div
                                                            onClick={(e) => handleSelectionClick(e, item.id)}
                                                            style={{
                                                                width: 24, height: 24, borderRadius: 12,
                                                                border: "2px solid", borderColor: isSelected ? "#0b57d0" : "#444746",
                                                                background: isSelected ? "#0b57d0" : "transparent",
                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                                zIndex: 10
                                                            }}
                                                        >
                                                            {isSelected && <Check size={14} color="white" />}
                                                        </div>
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
                                    <div style={{ fontWeight: 500, marginBottom: 12, color: "#444746" }}>Files</div>
                                    <div style={{ border: "1px solid #c4c7c5", borderRadius: 12, overflow: "hidden" }}>
                                        {sharedFiles.map((item, index) => {
                                            const isSelected = selectedIds.has(item.id);
                                            return (
                                                <div key={item.id}
                                                    data-testid={`shared-file-${item.file?.name}`}
                                                    onClick={(e) => {
                                                        if (selectionMode) handleSelectionClick(e, item.id);
                                                        else openItem(item);
                                                    }}
                                                    onDoubleClick={() => openItem(item)}
                                                    onContextMenu={(e) => handleContextMenu(e, item)}
                                                    style={{
                                                        display: "flex", justifyContent: "space-between", padding: "10px 16px",
                                                        borderBottom: index < sharedFiles.length - 1 ? "1px solid #f2f2f2" : "none", alignItems: "center",
                                                        background: isSelected ? "#c2e7ff" : "white",
                                                        cursor: "default",
                                                        transition: "background 0.1s",
                                                        // Ensure long filenames don't overflow
                                                        maxWidth: "100%",
                                                        flexWrap: "wrap",
                                                        gap: 8
                                                    }}
                                                >
                                                    <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#444746" }}>
                                                            {item.file?.mimeType.startsWith("image/") ? (
                                                                // <ImageIcon size={24} /> 
                                                                // Use thumbnail if possible
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img src={`/api/files/${item.file.id}/download`} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />
                                                            ) : item.file?.mimeType.startsWith("video/") ? (
                                                                <Video size={24} />
                                                            ) : item.file?.mimeType.startsWith("audio/") ? (
                                                                <Music size={24} />
                                                            ) : (
                                                                <FileText size={24} />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                <div style={{ fontWeight: 500, color: "#1f1f1f" }}>{item.file?.name}</div>
                                                                <div style={{ flexShrink: 0 }}>
                                                                    {selectionMode ? (
                                                                        <div
                                                                            onClick={(e) => handleSelectionClick(e, item.id)}
                                                                            style={{
                                                                                width: 48, height: 48, borderRadius: 24,
                                                                                border: "2px solid", borderColor: isSelected ? "#0b57d0" : "#444746",
                                                                                background: isSelected ? "#0b57d0" : "transparent",
                                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                                                cursor: "pointer"
                                                                            }}
                                                                        >
                                                                            {isSelected && <Check size={14} color="white" />}
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); window.location.href = `/api/files/${item.file!.id}/download`; }}
                                                                            style={{ width: 48, height: 48, borderRadius: 24, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#444746" }}
                                                                            title="Download"
                                                                        >
                                                                            <Download size={24} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div style={{ fontSize: 11, color: "#5e5e5e" }}>
                                                                {item.file?.mimeType} • {item.file?.size ? Math.round(item.file.size / 1024) + " KB" : ""} • {item.owner.username || item.owner.name || item.owner.email?.split('@')[0]}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Removed old button placement */}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {filteredItems.length === 0 && (
                                <div style={{ opacity: 0.6, padding: 16 }}>No matching items</div>
                            )}
                        </div>
                    )}

                    {/* CONTEXT MENU */}
                    {menu && (
                        <div
                            ref={menuRef}
                            style={{
                                position: "fixed",
                                // Boundary logic: ensure it fits on screen
                                top: Math.min(menu.y, window.innerHeight - 200),
                                left: Math.min(menu.x, window.innerWidth - 220),
                                background: "white", border: "1px solid #c4c7c5", borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.1)", zIndex: 3000,
                                width: 200, display: "flex", flexDirection: "column", padding: "4px 0"
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
                                    <MenuItem label="Select" onClick={() => toggleSelectionMode({ stopPropagation: () => { } } as any, menu.id)} icon={<Check size={16} />} />
                                    <MenuItem label="Open" onClick={() => { if (menu.item) openItem(menu.item); setMenu(null); }} icon={<FileText size={16} />} />
                                    {menu.item?.file && (
                                        <MenuItem label="Download" onClick={() => window.location.href = `/api/files/${menu.item!.file!.id}/download`} icon={<Download size={16} />} />
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </main>

                <button
                    data-testid="shared-reload-button"
                    onClick={loadSharedItems}
                    style={{
                        position: "fixed",
                        bottom: 30,
                        left: 280, // Sidebar width (250ish) + padding
                        width: 50,
                        height: 50,
                        borderRadius: 25,
                        background: "white",
                        color: "#444746",
                        border: "1px solid #c4c7c5",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                        cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        zIndex: 200,
                        transition: "background 0.2s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8f9fa"}
                    onMouseLeave={e => e.currentTarget.style.background = "white"}
                    title="Reload"
                >
                    <RefreshCw size={24} className={loading ? "spin" : ""} />
                    {loading && <style>{`
                        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                        .spin { animation: spin 1s linear infinite; }
                    `}</style>}
                </button>

                {previewFile && (
                    <MediaPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
                )}
            </div>
        </div >
    );
}
