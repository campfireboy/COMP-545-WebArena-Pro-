"use client";

import { useEffect, useState, use, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

type Folder = {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: string;
    owner?: { id: string; name: string | null; email: string; username?: string | null };
};

type FileObject = {
    id: string;
    name: string;
    size: number;
    mimeType: string;
    folderId: string | null;
    createdAt: string;
    owner?: { id: string; name: string | null; email: string; username?: string | null };
};

import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { MediaPreviewModal } from "@/components/MediaPreviewModal";

export default function SharedFolderPage({ params }: { params: Promise<{ folderId: string }> }) {
    const { folderId } = use(params);
    const router = useRouter();
    const { data: session, status } = useSession();

    const [folders, setFolders] = useState<Folder[]>([]);
    const [files, setFiles] = useState<FileObject[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);

    // ACTIONS
    const [menu, setMenu] = useState<{ kind: "folder" | "file"; id: string; x: number; y: number; multi?: boolean } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Upload & New Folder
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const addBtnRef = useRef<HTMLButtonElement>(null);
    const addMenuRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    // Modals
    const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
    const [newFolderNameInput, setNewFolderNameInput] = useState("");
    const [movePicker, setMovePicker] = useState<null | { ids: string[]; display: string }>(null);
    const [previewFile, setPreviewFile] = useState<FileObject | null>(null);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [selectionMode, setSelectionMode] = useState(false);

    function handleSelectionClick(e: React.MouseEvent, item: { kind: "folder" | "file", id: string }, index: number, allItems: { kind: "folder" | "file", id: string }[]) {
        const key = `${item.kind}:${item.id}`;
        e.stopPropagation();

        if (e.shiftKey && lastSelectedId) {
            const lastIndex = allItems.findIndex(i => `${i.kind}:${i.id}` === lastSelectedId);
            if (lastIndex !== -1) {
                const start = Math.min(lastIndex, index);
                const end = Math.max(lastIndex, index);
                const newSelection = new Set(selectedIds);
                if (!e.ctrlKey && !e.metaKey && !selectionMode) newSelection.clear();

                for (let i = start; i <= end; i++) {
                    newSelection.add(`${allItems[i].kind}:${allItems[i].id}`);
                }
                setSelectedIds(newSelection);
                return;
            }
        }

        if (e.ctrlKey || e.metaKey || selectionMode) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
            });
            setLastSelectedId(key);
        } else {
            setSelectedIds(new Set([key]));
            setLastSelectedId(key);
        }
    }

    function handleContextMenu(e: React.MouseEvent, kind: "folder" | "file", id: string) {
        e.preventDefault();
        e.stopPropagation();
        const key = `${kind}:${id}`;

        let newSelection = new Set(selectedIds);
        if (!selectedIds.has(key)) {
            newSelection = new Set([key]);
            setLastSelectedId(key);
        }
        setSelectedIds(newSelection);
        setMenu({ kind, id, x: e.clientX, y: e.clientY, multi: newSelection.size > 1 });
    }

    async function deleteSelected() {
        if (permission !== "EDIT") return;
        setMenu(null);
        if (!confirm(`Delete ${selectedIds.size} items?`)) return;

        for (const key of Array.from(selectedIds)) {
            const [kind, id] = key.split(":");
            const res = await fetch(`/api/${kind}s/${id}`, { method: "DELETE" });
            if (!res.ok) console.error(`Failed to delete ${kind} ${id}`);
        }
        setSelectedIds(new Set());
        await load();
    }

    function initiateMoveSelected() {
        if (permission !== "EDIT") return;
        setMenu(null);
        setMovePicker({
            ids: Array.from(selectedIds),
            display: `${selectedIds.size} items`
        });
    }

    function initiateMoveSingle(kind: "file" | "folder", id: string) {
        if (permission !== "EDIT") return;
        setMenu(null);
        setMovePicker({ ids: [`${kind}:${id}`], display: kind });
    }

    async function performMove(targetId: string | null) {
        if (!movePicker) return;
        for (const key of movePicker.ids) {
            const [kind, id] = key.split(":");
            if (kind === "folder" && id === targetId) continue;

            const endpoint = kind === "file" ? `/api/files/${id}` : `/api/folders/${id}`;
            const payload = kind === "file" ? { folderId: targetId } : { parentId: targetId };

            await fetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }
        setMovePicker(null);
        setSelectedIds(new Set());
        await load();
    }


    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login"); // Redirect if not logged in
        }
    }, [status, router]);

    useEffect(() => {
        if (!folderId || status !== "authenticated") return;
        load();
    }, [folderId, status]);

    useEffect(() => {
        function onMouseDown(e: MouseEvent) {
            if (!menu && !addMenuOpen) return;
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenu(null);
            }
            if (addMenuOpen && addMenuRef.current && !addMenuRef.current.contains(e.target as Node) && !addBtnRef.current?.contains(e.target as Node)) {
                setAddMenuOpen(false);
            }
        }
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setMenu(null);
                setAddMenuOpen(false);
            }
        }
        window.addEventListener("mousedown", onMouseDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [menu, addMenuOpen]);

    const [permission, setPermission] = useState<"EDIT" | "VIEW">("VIEW");

    async function load() {
        setLoading(true);
        const res = await fetch(`/api/folders?parentId=${folderId}`);
        if (res.ok) {
            const data = await res.json();
            setFolders(data.folders || []);
            setFiles(data.files || []);
            setBreadcrumbs(data.breadcrumbs || []);
            setPermission(data.permission || "VIEW");
        } else {
            if (res.status === 404 || res.status === 403) {
                alert("Cannot access this folder");
                router.push("/shared-with-me");
            }
        }
        setLoading(false);
    }

    // ACTIONS
    async function createFolder() {
        if (permission !== "EDIT") return;
        const name = newFolderNameInput.trim();
        if (!name) return;
        setCreateFolderModalOpen(false);
        setNewFolderNameInput("");

        const res = await fetch("/api/folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, parentId: folderId }),
        });
        if (!res.ok) {
            alert("Failed to create folder");
            return;
        }
        await load();
    }

    async function deleteFolder(id: string) {
        if (permission !== "EDIT") return;
        setMenu(null);
        if (!confirm("Delete this folder?")) return;
        const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
        if (!res.ok) alert("Failed to delete folder");
        else await load();
    }

    async function deleteFile(id: string) {
        if (permission !== "EDIT") return;
        setMenu(null);
        if (!confirm("Delete this file?")) return;
        const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
        if (!res.ok) alert("Failed to delete file");
        else await load();
    }

    async function renameFolder(id: string) {
        if (permission !== "EDIT") return;
        setMenu(null);
        const folder = folders.find(f => f.id === id);
        if (!folder) return;
        const newName = prompt("New name:", folder.name);
        if (!newName || !newName.trim()) return;
        const res = await fetch(`/api/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, type: "folder", name: newName.trim() }),
        });
        if (!res.ok) alert("Failed to rename");
        else await load();
    }

    async function renameFile(id: string) {
        if (permission !== "EDIT") return;
        setMenu(null);
        const file = files.find(f => f.id === id);
        if (!file) return;
        const newName = prompt("New name:", file.name);
        if (!newName || !newName.trim()) return;
        const res = await fetch(`/api/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, type: "file", name: newName.trim() }),
        });
        if (!res.ok) alert("Failed to rename");
        else await load();
    }



    // Helper
    function openMenu(e: React.MouseEvent, kind: "folder" | "file", id: string) {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ kind, id, x: e.clientX, y: e.clientY });
    }

    // Sorting State
    const [sortField, setSortField] = useState<"name" | "type">("type");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

    const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

    const sortedItems = useMemo(() => {
        const combined = [
            ...filteredFolders.map(f => ({ ...f, kind: "folder" as const })),
            ...filteredFiles.map(f => ({ ...f, kind: "file" as const }))
        ];

        return combined.sort((a, b) => {
            let res = 0;
            if (sortField === "name") {
                res = a.name.localeCompare(b.name);
            } else if (sortField === "type") {
                // Folders first in 'type' sort
                const typeA = a.kind === "folder" ? "000_folder" : (a as FileObject).mimeType;
                const typeB = b.kind === "folder" ? "000_folder" : (b as FileObject).mimeType;
                res = typeA.localeCompare(typeB);
            }
            return sortDirection === "asc" ? res : -res;
        });
    }, [filteredFolders, filteredFiles, sortField, sortDirection]);

    // Destinations for Move: Only show subfolders of CURRENT folder to keep it simple, 
    // or maybe show siblings? For now, let's just show folders in current view 
    // (which is weird for move, usually you move OUT). 
    // Actually, usually in shared folder you might want to move into a subfolder.
    // Let's list the visible folders as destinations (excluding self).
    const moveDestinations = useMemo(() => {
        if (!movePicker) return filteredFolders;
        const movingFolderIds = new Set(movePicker.ids.filter(id => id.startsWith("folder:")).map(id => id.split(":")[1]));
        return filteredFolders.filter((f) => !movingFolderIds.has(f.id));
    }, [filteredFolders, movePicker]);


    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <Header />
            {permission === "VIEW" && (
                <div style={{ background: "#f1f3f4", padding: "8px 16px", fontSize: 13, color: "#5f6368", borderBottom: "1px solid #e0e0e0", textAlign: "center" }}>
                    You only have view rights
                </div>
            )}
            <div style={{ display: "flex", flex: 1 }}>
                {/* Sidebar */}
                <Sidebar activePage="shared" />

                {/* Main */}
                <main
                    style={{ flex: 1, padding: 16, background: "white", position: "relative" }}
                    onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }}
                >
                    {/* Top Bar */}
                    <div style={{ marginBottom: 16 }} onClick={(e) => e.stopPropagation()}>
                        <input
                            placeholder="Search in folder..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 10 }}
                        />
                    </div>

                    {loading ? (
                        <div style={{ textAlign: "center", padding: 40, color: "#666" }}>Loading...</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                            {/* BREADCRUMBS & SORT */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 600, color: "#5f6368" }}>
                                    <span
                                        onClick={() => router.push("/shared-with-me")}
                                        style={{ cursor: "pointer", color: breadcrumbs.length === 0 ? "#202124" : "inherit" }}
                                    >
                                        Shared with me
                                    </span>
                                    {breadcrumbs.map((b, i) => (
                                        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span>{'>'}</span>
                                            <span
                                                onClick={() => i < breadcrumbs.length - 1 ? router.push(`/shared-with-me/f/${b.id}`) : null}
                                                style={{
                                                    cursor: i < breadcrumbs.length - 1 ? "pointer" : "default",
                                                    color: i === breadcrumbs.length - 1 ? "#202124" : "inherit"
                                                }}
                                            >
                                                {b.name}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* SORT CONTROLS */}
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <select
                                        value={sortField}
                                        onChange={(e) => setSortField(e.target.value as any)}
                                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer" }}
                                    >
                                        <option value="name">Name</option>
                                        <option value="type">Type</option>
                                    </select>
                                    <button
                                        onClick={() => setSortDirection(prev => prev === "asc" ? "desc" : "asc")}
                                        style={{
                                            width: 32, height: 32, borderRadius: 8, border: "1px solid #ddd", background: "white",
                                            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
                                        }}
                                        title={sortDirection === "asc" ? "Ascending" : "Descending"}
                                    >
                                        {sortDirection === "asc" ? "↑" : "↓"}
                                    </button>
                                </div>
                            </div>


                            {/* ACTION TOOLBAR */}
                            {selectedIds.size > 0 && (
                                <div style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "8px 16px", background: "#f1f3f4", borderRadius: 8, marginBottom: 12,
                                    border: "1px solid #dadce0"
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <button
                                            onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }}
                                            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: "#5f6368" }}
                                        >
                                            ✕
                                        </button>
                                        <span style={{ fontWeight: 600, color: "#202124" }}>{selectedIds.size} selected</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        {selectedIds.size === 1 && permission === "EDIT" && (() => {
                                            const key = Array.from(selectedIds)[0];
                                            const [kind, id] = key.split(":");
                                            return (
                                                <button
                                                    onClick={() => kind === "file" ? renameFile(id) : renameFolder(id)}
                                                    title="Rename"
                                                    style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18 }}
                                                >
                                                    ✏️
                                                </button>
                                            );
                                        })()}
                                        {Array.from(selectedIds).some(id => id.startsWith("file:")) && (
                                            <button
                                                onClick={() => {
                                                    const fileIds = Array.from(selectedIds).filter(id => id.startsWith("file:"));
                                                    if (fileIds.length === 1) {
                                                        const fid = fileIds[0].split(":")[1];
                                                        window.location.href = `/api/files/${fid}/download`;
                                                    } else {
                                                        alert("Batch download not implemented yet.");
                                                    }
                                                }}
                                                title="Download"
                                                style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18 }}
                                            >
                                                ⬇️
                                            </button>
                                        )}
                                        {permission === "EDIT" && (
                                            <>
                                                <button onClick={initiateMoveSelected} title="Move" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18 }}>➡️</button>
                                                <button onClick={deleteSelected} title="Delete" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18 }}>🗑️</button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* UNIFIED LIST */}
                            {sortedItems.length > 0 ? (
                                <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden", userSelect: "none" }}>
                                    {sortedItems.map((item, index) => {
                                        if (item.kind === "folder") {
                                            const f = item as Folder;
                                            const isSelected = selectedIds.has(`folder:${f.id}`);
                                            return (
                                                <div key={`folder-${f.id}`}
                                                    onContextMenu={(e) => handleContextMenu(e, "folder", f.id)}
                                                    onClick={(e) => handleSelectionClick(e, { kind: "folder", id: f.id }, index, sortedItems)}
                                                    onDoubleClick={() => router.push(`/shared-with-me/f/${f.id}`)}
                                                    style={{
                                                        display: "flex", justifyContent: "space-between", padding: 12, borderBottom: "1px solid #f2f2f2", alignItems: "center",
                                                        cursor: "pointer",
                                                        background: isSelected ? "#e8f0fe" : "white"
                                                    }}
                                                    title={`Shared by ${f.owner?.username || f.owner?.name || f.owner?.email}`}
                                                >
                                                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                                                        {/* FOLDER THUMBNAIL */}
                                                        <div
                                                            style={{
                                                                width: 40, height: 40, borderRadius: 8, overflow: "hidden",
                                                                background: isSelected ? "#d2e3fc" : "#e8f0fe", display: "flex", alignItems: "center", justifyContent: "center",
                                                                flexShrink: 0, fontSize: 20
                                                            }}
                                                        >
                                                            📁
                                                        </div>

                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                                {f.name}
                                                            </div>
                                                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                                Shared by {f.owner?.username || f.owner?.name || f.owner?.email?.split('@')[0] || "Unknown"}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {selectionMode ? (
                                                        <div
                                                            onClick={(e) => { e.stopPropagation(); handleSelectionClick(e, { kind: "folder", id: f.id }, index, sortedItems); }}
                                                            style={{ width: 34, height: 34, borderRadius: 10, border: "2px solid", borderColor: isSelected ? "#1a73e8" : "#ccc", background: isSelected ? "#1a73e8" : "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 8 }}
                                                        >
                                                            {isSelected && <span style={{ color: "white", fontSize: 18 }}>✓</span>}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                handleContextMenu(e, "folder", f.id);
                                                            }}
                                                            style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", marginLeft: 8 }}
                                                        >
                                                            ⋯
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        } else {
                                            const file = item as FileObject;
                                            const isSelected = selectedIds.has(`file:${file.id}`);
                                            return (
                                                <div key={`file-${file.id}`}
                                                    onContextMenu={(e) => handleContextMenu(e, "file", file.id)}
                                                    onClick={(e) => handleSelectionClick(e, { kind: "file", id: file.id }, index, sortedItems)}
                                                    onDoubleClick={() => {
                                                        if (["image/jpeg", "video/mp4", "audio/mpeg"].includes(file.mimeType)) {
                                                            setPreviewFile(file);
                                                        } else {
                                                            router.push(`/drive/file/${file.id}`);
                                                        }
                                                    }}
                                                    style={{
                                                        display: "flex", justifyContent: "space-between", padding: 12, borderBottom: "1px solid #f2f2f2", alignItems: "center",
                                                        background: isSelected ? "#e8f0fe" : "white",
                                                        cursor: "default"
                                                    }}
                                                >
                                                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                                                        {/* THUMBNAIL */}
                                                        <div
                                                            style={{
                                                                width: 40, height: 40, borderRadius: 8, overflow: "hidden",
                                                                background: isSelected ? "#d2e3fc" : "#f1f3f4", display: "flex", alignItems: "center", justifyContent: "center",
                                                                flexShrink: 0
                                                            }}
                                                        >
                                                            {file.mimeType === "image/jpeg" ? (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img src={`/api/files/${file.id}/download`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                            ) : file.mimeType === "video/mp4" ? (
                                                                <video src={`/api/files/${file.id}/download`} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                                                            ) : file.mimeType === "audio/mpeg" ? (
                                                                <span style={{ fontSize: 20 }}>📻</span>
                                                            ) : (
                                                                <span style={{ fontSize: 20 }}>📄</span>
                                                            )}
                                                        </div>

                                                        <div style={{ minWidth: 0 }}>
                                                            <div
                                                                style={{ fontWeight: 700, cursor: ["image/jpeg", "video/mp4", "audio/mpeg"].includes(file.mimeType) ? "pointer" : "default" }}
                                                                title={["image/jpeg", "video/mp4", "audio/mpeg"].includes(file.mimeType) ? "Double click to preview" : ""}
                                                            >
                                                                {file.name}
                                                            </div>
                                                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                                {file.mimeType} • {file.size ? Math.round(file.size / 1024) + " KB" : ""} • Shared by {file.owner?.username || file.owner?.name || file.owner?.email?.split('@')[0] || "Unknown"}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {selectionMode ? (
                                                        <div
                                                            onClick={(e) => { e.stopPropagation(); handleSelectionClick(e, { kind: "file", id: file.id }, index, sortedItems); }}
                                                            style={{ width: 34, height: 34, borderRadius: 10, border: "2px solid", borderColor: isSelected ? "#1a73e8" : "#ccc", background: isSelected ? "#1a73e8" : "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 8 }}
                                                        >
                                                            {isSelected && <span style={{ color: "white", fontSize: 18 }}>✓</span>}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                handleContextMenu(e, "file", file.id);
                                                            }}
                                                            style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", marginLeft: 8 }}
                                                        >
                                                            ⋯
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        }
                                    })}
                                </div>
                            ) : (
                                <div style={{ textAlign: "center", padding: 60, color: "#666", border: "1px dashed #ddd", borderRadius: 12 }}>
                                    <div style={{ fontSize: 16 }}>Empty folder</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PLUS BUTTON */}
                    {permission === "EDIT" && (
                        <div style={{ position: "fixed", bottom: 40, left: 272, zIndex: 1000 }}>
                            <button
                                ref={addBtnRef}
                                onClick={() => setAddMenuOpen(!addMenuOpen)}
                                style={{
                                    width: 56, height: 56, borderRadius: "50%",
                                    background: "#1a73e8", color: "white",
                                    border: "none", fontSize: 32, lineHeight: 1,
                                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                }}
                            >
                                +
                            </button>

                            {addMenuOpen && (
                                <div
                                    ref={addMenuRef}
                                    style={{
                                        position: "absolute", bottom: 70, left: 0,
                                        background: "white", borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
                                        width: 180, overflow: "hidden", border: "1px solid #ddd"
                                    }}
                                >
                                    <button
                                        onClick={() => { setAddMenuOpen(false); setCreateFolderModalOpen(true); }}
                                        style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500 }}
                                    >
                                        New Folder
                                    </button>
                                    <button
                                        onClick={() => { setAddMenuOpen(false); fileInputRef.current?.click(); }}
                                        style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500 }}
                                    >
                                        File Upload
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Hidden File Input */}
                    <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                            setUploading(true);
                            fetch("/api/files/presign", { method: "POST", body: JSON.stringify({ name: f.name, size: f.size, mimeType: f.type, folderId: folderId ?? null }) })
                                .then(r => r.json())
                                .then(({ uploadUrl, s3Key }) => fetch(uploadUrl, { method: "PUT", body: f }).then(() => ({ s3Key })))
                                .then(({ s3Key }) => fetch("/api/files/finalize", { method: "POST", body: JSON.stringify({ name: f.name, size: f.size, mimeType: f.type, s3Key, folderId: folderId ?? null }) }))
                                .then(() => load())
                                .finally(() => setUploading(false));
                        }
                    }} />

                    {/* Overlay if Uploading */}
                    {uploading && (
                        <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 24px", background: "#333", color: "white", borderRadius: 8 }}>
                            Uploading...
                        </div>
                    )}

                </main>

                {/* MODALS */}
                {createFolderModalOpen && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 6000, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ background: "white", padding: 24, borderRadius: 12, width: 320 }}>
                            <h3 style={{ marginTop: 0 }}>New Folder</h3>
                            <input
                                autoFocus
                                placeholder="Folder name"
                                value={newFolderNameInput}
                                onChange={e => setNewFolderNameInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && createFolder()}
                                style={{ width: "100%", padding: 8, marginBottom: 16, border: "1px solid #ddd", borderRadius: 4 }}
                            />
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                                <button onClick={() => setCreateFolderModalOpen(false)} style={{ padding: "8px 16px", background: "transparent", border: "none", cursor: "pointer", color: "#1a73e8" }}>Cancel</button>
                                <button onClick={createFolder} style={{ padding: "8px 16px", background: "#1a73e8", color: "white", borderRadius: 4, border: "none", cursor: "pointer" }}>Create</button>
                            </div>
                        </div>
                    </div>
                )}

                {menu && (
                    <div
                        ref={menuRef}
                        style={{
                            position: "fixed", top: menu.y, left: menu.x - 200, background: "white", border: "1px solid #ddd", borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.1)", zIndex: 3000,
                            width: 200, display: "flex", flexDirection: "column"
                        }}
                    >
                        {menu.multi ? (
                            <>
                                <div style={{ padding: "8px 12px", fontSize: 12, color: "#666", fontWeight: 600 }}>
                                    {selectedIds.size} Selected
                                </div>
                                <MenuDivider />
                                {permission === "EDIT" && (
                                    <>
                                        <MenuItem label="Move to..." onClick={initiateMoveSelected} />
                                        <MenuItem label="Delete" danger onClick={deleteSelected} />
                                    </>
                                )}
                            </>
                        ) : (
                            <>
                                <MenuItem label="Select" onClick={() => {
                                    setSelectionMode(true);
                                    const key = `${menu.kind}:${menu.id}`;
                                    setSelectedIds(prev => {
                                        const next = new Set(prev);
                                        next.add(key);
                                        return next;
                                    });
                                    setMenu(null);
                                }} />
                                <MenuItem label="Open" onClick={() => {
                                    if (menu.kind === "folder") router.push(`/shared-with-me/f/${menu.id}`);
                                    else router.push(`/drive/file/${menu.id}`);
                                }} />
                                {permission === "EDIT" && (
                                    <>
                                        <MenuItem label="Rename" onClick={() => { if (menu.kind === "file") renameFile(menu.id); else renameFolder(menu.id); }} />
                                        <MenuItem label="Move to..." onClick={() => initiateMoveSingle(menu.kind, menu.id)} />
                                        <MenuDivider />
                                        <MenuItem label="Delete" danger onClick={() => { if (menu.kind === "file") deleteFile(menu.id); else deleteFolder(menu.id); }} />
                                    </>
                                )}
                                {menu.kind === "file" && <MenuItem label="Download" onClick={() => window.location.href = `/api/files/${menu.id}/download`} />}
                            </>
                        )}
                    </div>
                )}

                {previewFile && (
                    <MediaPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
                )}

                {movePicker && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ background: "white", padding: 20, borderRadius: 12, width: 400 }}>
                            <h3>Move {movePicker.display}</h3>
                            <div style={{ maxHeight: 300, overflow: "auto", margin: "10px 0" }}>
                                <div onClick={() => performMove(null)} style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #eee", fontWeight: 600 }}>.. (Parent Root)</div>
                                {moveDestinations.map(f => (
                                    <div key={f.id} onClick={() => performMove(f.id)} style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #eee" }}>📁 {f.name}</div>
                                ))}
                                {moveDestinations.length === 0 && <div style={{ padding: 10, opacity: 0.6 }}>No destinations in current view</div>}
                            </div>
                            <button onClick={() => setMovePicker(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "white", width: "100%" }}>Cancel</button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
    return (
        <button
            onClick={onClick}
            style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 10px",
                borderRadius: 10,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: danger ? "#b00020" : "inherit",
                fontWeight: danger ? 700 : 600,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
            {label}
        </button>
    );
}

function MenuDivider() {
    return <div style={{ height: 1, background: "#efefef", margin: "6px 6px" }} />;
}
