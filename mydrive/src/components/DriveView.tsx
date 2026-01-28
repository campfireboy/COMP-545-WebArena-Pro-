"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { MediaPreviewModal } from "@/components/MediaPreviewModal";
import {
  Folder as FolderIcon, FileText, Image as ImageIcon, Music, Video,
  MoreVertical, X, Plus, Users, Download, Trash2, Edit2, ArrowRight,
  ChevronRight, Search, ChevronDown, ChevronUp, File, Check, Share2
} from "lucide-react";
import { ShareModal, SharedItemPopover } from "@/components/ShareDialogs";

type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  ownerId: string;
  owner?: { id: string; name: string | null; email: string; username?: string | null };
};

type FileObject = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  folderId: string | null;
  createdAt: string;
  ownerId: string;
  owner?: { id: string; name: string | null; email: string; username?: string | null };
};

type MenuState =
  | null
  | {
    kind: "folder" | "file";
    id: string;
    x: number;
    y: number;
  };

type ShareModalState = null | {
  kind: "folder" | "file";
  id: string;
  name: string;
};

type SharePopoverState = null | {
  kind: "folder" | "file";
  id: string;
  name: string;
  owner?: { id: string; name: string | null; email: string; username?: string | null };
  isOwned: boolean;
  targetRef: HTMLElement;
};

type UnshareModalState = null | {
  itemKind: "folder" | "file";
  itemId: string;
  targetId: string | null;
  parentShares: Share[];
};

type Share = {
  id: string;
  sharedWithUser: { email: string; name: string | null; username?: string | null } | null;
  permission: string;
};



export default function DriveView({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const { data: session } = useSession();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileObject[]>([]);
  const [loading, setLoading] = useState(true);

  // File Creation Modal State
  const [createFileModal, setCreateFileModal] = useState<{ defaultName: string, content: string, mimeType: string } | null>(null);
  const [newFileNameInput, setNewFileNameInput] = useState("");

  const [search, setSearch] = useState("");
  // const [newFolderName, setNewFolderName] = useState(""); // Removed inline input
  const [uploading, setUploading] = useState(false);
  const [menu, setMenu] = useState<{ kind: "folder" | "file"; id: string; x: number; y: number; multi?: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState("");

  // Add Button Menu
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [codeMenuOpen, setCodeMenuOpen] = useState(false);

  function createFile(defaultName: string, content: string, mimeType: string) {
    setAddMenuOpen(false);
    setCodeMenuOpen(false);
    setNewFileNameInput(defaultName);
    setCreateFileModal({ defaultName, content, mimeType });
  }

  async function performCreateFile() {
    if (!createFileModal) return;
    const name = newFileNameInput.trim();
    if (!name) return;

    // Ensure extension matches default if needed
    let finalName = name;
    const extIndex = createFileModal.defaultName.lastIndexOf(".");
    if (extIndex !== -1) {
      const ext = createFileModal.defaultName.substring(extIndex);
      if (!finalName.endsWith(ext) && !finalName.endsWith(ext.toLowerCase())) {
        finalName = finalName + ext;
      }
    }

    const res = await fetch("/api/files/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: folderId ?? null, name: finalName, content: createFileModal.content, mimeType: createFileModal.mimeType }),
    });

    if (res.ok) {
      const newFile = await res.json();
      router.push(`/drive/file/${newFile.id}`);
    } else {
      alert(`Failed to create ${finalName}`);
    }
    setCreateFileModal(null);
  }

  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // --- FOLDER UPLOAD LOGIC ---
  async function handleFolderUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setUploading(true);
    setAddMenuOpen(false);
    const files = e.target.files;
    if (!files || files.length === 0) {
      setUploading(false);
      return;
    }

    // cache path -> folderId
    const folderCache = new Map<string, string>();
    if (folderId) folderCache.set("", folderId);

    // Helper to ensure a folder exists
    async function ensureFolder(path: string): Promise<string | null> {
      if (folderCache.has(path)) return folderCache.get(path)!;
      if (path === "") return folderId;

      const parts = path.split("/");
      const name = parts.pop()!;
      const parentPath = parts.join("/");

      const parentId = await ensureFolder(parentPath);

      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId }),
      });

      if (!res.ok) return null;
      const folder = await res.json();
      folderCache.set(path, folder.id);
      return folder.id;
    }

    try {
      // 1. Collect all unique folder paths
      const pathsToCreate = new Set<string>();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relPath = file.webkitRelativePath;
        const lastSlash = relPath.lastIndexOf("/");
        if (lastSlash !== -1) {
          const dirPath = relPath.substring(0, lastSlash);
          pathsToCreate.add(dirPath);
        }
      }

      // 2. Sort paths by length so we create parents first
      const sortedPaths = Array.from(pathsToCreate).sort();

      // 3. Create folders
      for (const path of sortedPaths) {
        await ensureFolder(path);
      }

      // 4. Upload files
      const promises = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relPath = file.webkitRelativePath;
        const lastSlash = relPath.lastIndexOf("/");
        let targetFolderId = folderId;

        if (lastSlash !== -1) {
          const dirPath = relPath.substring(0, lastSlash);
          targetFolderId = folderCache.get(dirPath) ?? folderId;
        }

        promises.push((async () => {
          // Presign
          const preRes = await fetch("/api/files/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: file.name, size: file.size, mimeType: file.type || "application/octet-stream", folderId: targetFolderId }),
          });
          if (!preRes.ok) return;
          const { uploadUrl, s3Key } = await preRes.json();

          // Upload S3
          await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });

          // Finalize
          await fetch("/api/files/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: file.name, size: file.size, mimeType: file.type || "application/octet-stream", s3Key, folderId: targetFolderId }),
          });
        })());

        // Batch limit
        if (promises.length >= 5) {
          await Promise.all(promises);
          promises.length = 0;
        }
      }
      await Promise.all(promises);

    } catch (e) {
      console.error("Upload failed", e);
      alert("Some files failed to upload");
    } finally {
      setUploading(false);
      if (folderInputRef.current) folderInputRef.current.value = "";
      load();
    }
  }

  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);

  // Share Modal & Popover
  const [shareModal, setShareModal] = useState<ShareModalState>(null);
  const [sharePopover, setSharePopover] = useState<SharePopoverState>(null);

  // Unshare Check
  const [unshareModal, setUnshareModal] = useState<UnshareModalState>(null);

  const [movePicker, setMovePicker] = useState<null | { ids: string[]; display: string }>(null);
  const [renameModal, setRenameModal] = useState<null | { id: string; type: "file" | "folder"; name: string }>(null);
  const [previewFile, setPreviewFile] = useState<FileObject | null>(null);

  async function deleteSelected() {
    setMenu(null);

    for (const key of Array.from(selectedIds)) {
      const [kind, id] = key.split(":");
      const res = await fetch(`/api/${kind}s/${id}`, { method: "DELETE" });
      if (!res.ok) console.error(`Failed to delete ${kind} ${id}`);
    }
    setSelectedIds(new Set());
    await load();
  }

  function initiateMoveSelected() {
    setMenu(null);
    setMovePicker({
      ids: Array.from(selectedIds),
      display: `${selectedIds.size} items`
    });
  }

  async function performMove(targetId: string | null) {
    if (!movePicker) return;
    for (const key of movePicker.ids) {
      const [kind, id] = key.split(":");
      // Skip if moving folder into itself (simple check)
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
    setSelectedIds(new Set()); // Clear selection after move
    await load();
  }

  // --- SINGLE ACTIONS WRAPPERS ---
  function initiateMoveSingle(kind: "file" | "folder", id: string) {
    setMenu(null);
    setMovePicker({ ids: [`${kind}:${id}`], display: kind });
  }

  async function load() {
    setLoading(true);
    const url = folderId ? `/api/folders?parentId=${encodeURIComponent(folderId)}` : `/api/folders`;

    const res = await fetch(url);
    if (!res.ok) {
      setLoading(false);
      if (res.status === 401) router.push("/login");
      return;
    }

    const data = await res.json();
    setFolders(data.folders ?? []);
    setFiles(data.files ?? []);
    setBreadcrumbs(data.breadcrumbs ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

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

  // Sorting State
  const [sortField, setSortField] = useState<"name" | "type">("type");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Selection State
  // Format: "folder:id" or "file:id"
  // Selection State
  // Format: "folder:id" or "file:id"
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

    // Open Menu
    setMenu({ kind, id, x: e.clientX, y: e.clientY, multi: newSelection.size > 1 });
  }

  // Search State
  const [searchResults, setSearchResults] = useState<(FileObject | Folder)[] | null>(null);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      const parentParam = folderId ? `&parentId=${encodeURIComponent(folderId)}` : "";
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}${parentParam}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results);
      }
    }, 300); // Debounce

    return () => clearTimeout(timer);
  }, [search, folderId]);

  const displayedFolders = useMemo(() => {
    if (searchResults) return searchResults.filter(i => (i as any).kind === "folder") as Folder[];
    return folders;
  }, [folders, searchResults]);

  const displayedFiles = useMemo(() => {
    if (searchResults) return searchResults.filter(i => (i as any).kind === "file") as FileObject[];
    return files;
  }, [files, searchResults]);

  const sortedItems = useMemo(() => {
    const combined = [
      ...displayedFolders.map(f => ({ ...f, kind: "folder" as const })),
      ...displayedFiles.map(f => ({ ...f, kind: "file" as const }))
    ];

    return combined.sort((a, b) => {
      let res = 0;
      if (sortField === "name") {
        res = a.name.localeCompare(b.name);
      } else if (sortField === "type") {
        const typeA = a.kind === "folder" ? "000_folder" : (a as FileObject).mimeType;
        const typeB = b.kind === "folder" ? "000_folder" : (b as FileObject).mimeType;
        res = typeA.localeCompare(typeB);
      }
      return sortDirection === "asc" ? res : -res;
    });
  }, [displayedFolders, displayedFiles, sortField, sortDirection]);

  const moveDestinations = useMemo(() => {
    if (!movePicker) return displayedFolders;
    // Exclude any folders that are currently being moved to avoid cycles/self-move
    const movingFolderIds = new Set(movePicker.ids.filter(id => id.startsWith("folder:")).map(id => id.split(":")[1]));
    return displayedFolders.filter((f) => !movingFolderIds.has(f.id));
  }, [displayedFolders, movePicker]);

  function isOwned(item: { owner?: { email: string } }) {
    if (!session?.user?.email || !item.owner?.email) return false;
    return session.user.email === item.owner.email;
  }

  async function createFolder() {
    const name = newFolderNameInput.trim();
    if (!name) return;
    setCreateFolderModalOpen(false); // OPTIMISTIC
    setNewFolderNameInput("");

    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: folderId ?? null }),
    });
    if (!res.ok) {
      if (res.status === 401) router.push("/login");
      else alert("Failed to create folder");
      return;
    }
    await load();
  }

  async function deleteFolder(folderIdToDelete: string) {
    setMenu(null);
    const res = await fetch(`/api/folders/${folderIdToDelete}`, { method: "DELETE" });
    if (!res.ok) alert("Failed to delete folder");
    else await load();
  }

  async function deleteFile(fileId: string) {
    setMenu(null);
    const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
    if (!res.ok) alert("Failed to delete file");
    else await load();
  }

  async function renameFolder(id: string) {
    setMenu(null);
    const folder = folders.find((f) => f.id === id);
    if (!folder) return;
    setRenameModal({ id, type: "folder", name: folder.name });
  }

  async function renameFile(id: string) {
    setMenu(null);
    const file = files.find((f) => f.id === id);
    if (!file) return;
    setRenameModal({ id, type: "file", name: file.name });
  }

  async function performRename() {
    if (!renameModal) return;
    const { id, type, name } = renameModal;
    if (!name || !name.trim()) return;

    const res = await fetch(`/api/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, type, name: name.trim() }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to rename");
    } else {
      await load();
      setRenameModal(null);
    }
  }

  // --- MOVE LOGIC ---




  // --- SHARING LOGIC ---



  // --- RENDER HELPERS ---

  function openMenu(e: React.MouseEvent, kind: "folder" | "file", id: string) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ kind, id, x: e.clientX, y: e.clientY });
  }

  function toggleSharePopover(e: React.MouseEvent, kind: "folder" | "file", item: Folder | FileObject) {
    e.stopPropagation();
    if (sharePopover?.id === item.id) {
      setSharePopover(null);
    } else {
      setSharePopover({
        kind,
        id: item.id,
        name: item.name,
        owner: item.owner,
        isOwned: isOwned(item),
        targetRef: e.currentTarget as HTMLElement,
      });
    }
  }




  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <div style={{ display: "flex", flex: 1, position: "relative" }}>
        {/* Sidebar */}
        <Sidebar activePage="drive" />

        {/* Main */}
        <main
          style={{ flex: 1, padding: 16, position: "relative" }}
          onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }}
        >
          {loading ? <div>Loading...</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* TOP SEARCH BAR */}
              <div style={{ marginBottom: 0, position: "relative" }} onClick={(e) => e.stopPropagation()}>
                <Search
                  size={20}
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#444746" }}
                />
                <input
                  placeholder="Search in Drive..."
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
              {/* BREADCRUMBS & SORT */}
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 600, color: "#444746" }}>
                  <span
                    onClick={() => router.push("/drive")}
                    style={{ cursor: "pointer", color: breadcrumbs.length === 0 ? "#1f1f1f" : "inherit" }}
                  >
                    My Drive
                  </span>
                  {breadcrumbs.map((b, i) => (
                    <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ChevronRight size={16} color="#747775" />
                      <span
                        onClick={() => i < breadcrumbs.length - 1 ? router.push(`/drive/f/${b.id}`) : null}
                        style={{
                          cursor: i < breadcrumbs.length - 1 ? "pointer" : "default",
                          color: i === breadcrumbs.length - 1 ? "#1f1f1f" : "inherit"
                        }}
                      >
                        {b.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* SORT CONTROLS */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ position: "relative" }}>
                    <select
                      value={sortField}
                      onChange={(e) => setSortField(e.target.value as any)}
                      style={{
                        padding: "8px 32px 8px 12px",
                        borderRadius: 8,
                        border: "1px solid #747775",
                        background: "white",
                        cursor: "pointer",
                        fontSize: 14,
                        color: "#444746",
                        appearance: "none",
                        fontWeight: 500
                      }}
                    >
                      <option value="name">Name</option>
                      <option value="type">Type</option>
                    </select>
                    <ChevronDown size={14} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#444746" }} />
                  </div>
                  <button
                    onClick={() => setSortDirection(prev => prev === "asc" ? "desc" : "asc")}
                    style={{
                      width: 36, height: 36, borderRadius: 18, border: "none", background: "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#444746"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f0f0f0"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    title={sortDirection === "asc" ? "Ascending" : "Descending"}
                  >
                    {sortDirection === "asc" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
              </div>

              {/* ACTION TOOLBAR (Always Visible) */}
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 16px", background: "#f8fafd", borderRadius: 12, marginBottom: 16,
                  border: "none",
                  opacity: selectedIds.size > 0 ? 1 : 0,
                  pointerEvents: selectedIds.size > 0 ? "auto" : "none",
                  transition: "opacity 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "#444746", display: "flex", alignItems: "center" }}
                  >
                    <X size={20} />
                  </button>
                  <span style={{ fontWeight: 500, color: "#1f1f1f" }}>
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select items..."}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  {selectedIds.size === 1 && (() => {
                    const key = Array.from(selectedIds)[0];
                    const [kind, id] = key.split(":");
                    const item = kind === "folder" ? folders.find(f => f.id === id) : files.find(f => f.id === id);
                    if (item) {
                      return (
                        <>
                          <button
                            onClick={() => kind === "file" ? renameFile(id) : renameFolder(id)}
                            title="Rename"
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#444746" }}
                          >
                            <Edit2 size={20} />
                          </button>
                          <button
                            onClick={(e) => toggleSharePopover(e, kind as "folder" | "file", item)}
                            title="Share"
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#444746" }}
                          >
                            <Users size={20} />
                          </button>
                        </>
                      );
                    }
                    return null;
                  })()}

                  {selectedIds.size === 1 && (
                    <button
                      onClick={() => {
                        const key = Array.from(selectedIds)[0];
                        const [kind, id] = key.split(":");
                        if (kind === "file") {
                          window.location.href = `/api/files/${id}/download`;
                        } else {
                          window.location.href = `/api/folders/${id}/download`;
                        }
                      }}
                      title="Download"
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "#444746" }}
                    >
                      <Download size={20} />
                    </button>
                  )}
                  <button onClick={initiateMoveSelected} title="Move" aria-label="Move" style={{ background: "transparent", border: "none", cursor: "pointer", color: "#444746" }}>
                    <ArrowRight size={20} />
                  </button>
                  <button onClick={deleteSelected} title="Delete" style={{ background: "transparent", border: "none", cursor: "pointer", color: "#444746" }}>
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>

              {/* UNIFIED LIST */}
              <div style={{ border: "1px solid #c4c7c5", borderRadius: 12, overflow: "hidden", userSelect: "none" }}>
                {sortedItems.map((item, index) => {
                  if (item.kind === "folder") {
                    const f = item as Folder;
                    const owned = isOwned(f);
                    const isSelected = selectedIds.has(`folder:${f.id}`);
                    return (
                      <div key={`folder-${f.id}`}
                        onContextMenu={(e) => handleContextMenu(e, "folder", f.id)}
                        onClick={() => router.push(`/drive/f/${f.id}`)}
                        onDoubleClick={() => router.push(`/drive/f/${f.id}`)}
                        role="button"
                        tabIndex={0}
                        aria-label={`Folder: ${f.name}`}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/drive/f/${f.id}`); }}
                        style={{
                          display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #f2f2f2", alignItems: "center",
                          cursor: "pointer",
                          background: isSelected ? "#c2e7ff" : "white",
                          transition: "background 0.1s"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
                          {/* FOLDER THUMBNAIL */}
                          <div
                            style={{
                              width: 32, height: 32,
                              color: isSelected ? "#001d35" : "#444746", display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0
                            }}
                          >
                            <FolderIcon size={24} fill="currentColor" strokeWidth={1} />
                          </div>

                          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div
                                style={{ fontWeight: 500, color: "#1f1f1f", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                              >
                                {f.name}
                              </div>
                              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleSharePopover(e, "folder", f); }}
                                  style={{
                                    width: 48, height: 48, borderRadius: 24,
                                    border: "none", background: "transparent",
                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                    color: "#444746"
                                  }}
                                  title={owned ? "Share" : "Shared Details"}
                                >
                                  <Users size={24} />
                                </button>
                                {selectionMode ? (
                                  <div
                                    onClick={(e) => { e.stopPropagation(); handleSelectionClick(e, { kind: "folder", id: f.id }, index, sortedItems); }}
                                    style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}
                                  >
                                    <div style={{
                                      width: 20, height: 20, borderRadius: 10,
                                      border: "2px solid", borderColor: isSelected ? "#0b57d0" : "#444746",
                                      background: isSelected ? "#0b57d0" : "transparent",
                                      display: "flex", alignItems: "center", justifyContent: "center"
                                    }}>
                                      {isSelected && <Check size={14} color="white" />}
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {/* Inline Actions */}
                                    {owned ? (
                                      <>
                                        <button
                                          aria-label="Rename"
                                          onClick={(e) => { e.stopPropagation(); renameFolder(f.id); }}
                                          style={{ width: 48, height: 48, borderRadius: 24, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#444746" }}
                                          title="Rename"
                                        >
                                          <Edit2 size={24} />
                                        </button>
                                        <button
                                          aria-label="Move"
                                          onClick={(e) => { e.stopPropagation(); initiateMoveSingle("folder", f.id); }}
                                          style={{ width: 48, height: 48, borderRadius: 24, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#444746" }}
                                          title="Move"
                                        >
                                          <ArrowRight size={24} />
                                        </button>
                                        <button
                                          aria-label="Delete"
                                          onClick={(e) => { e.stopPropagation(); deleteFolder(f.id); }}
                                          style={{ width: 48, height: 48, borderRadius: 24, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#d93025" }}
                                          title="Delete"
                                        >
                                          <Trash2 size={24} />
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        aria-label="Open"
                                        onClick={(e) => { e.stopPropagation(); router.push(`/drive/f/${f.id}`); }}
                                        style={{ width: 48, height: 48, borderRadius: 24, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#444746" }}
                                        title="Open"
                                      >
                                        <ArrowRight size={24} />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            {/* @ts-expect-error path is dynamic */}
                            {f.path && <div style={{ fontSize: 11, color: "#5e5e5e" }}>{f.path}</div>}
                            <div style={{ fontSize: 11, color: "#5e5e5e" }}>Folder {!owned ? `(Shared by ${f.owner?.username || f.owner?.name || f.owner?.email || "Unknown"})` : ""}</div>
                          </div>
                        </div>

                        {/* Spacer to replace old button area if needed, but flex justify-between handles spacing */}
                      </div>
                    );
                  } else {
                    const file = item as FileObject;
                    const owned = isOwned(file);
                    const isSelected = selectedIds.has(`file:${file.id}`);
                    return (
                      <div key={`file-${file.id}`}
                        onContextMenu={(e) => handleContextMenu(e, "file", file.id)}
                        onClick={() => {
                          if (["image/jpeg", "video/mp4", "audio/mpeg"].includes(file.mimeType)) {
                            setPreviewFile(file);
                          } else {
                            router.push(`/drive/file/${file.id}`);
                          }
                        }}
                        onDoubleClick={() => {
                          if (["image/jpeg", "video/mp4", "audio/mpeg"].includes(file.mimeType)) {
                            setPreviewFile(file);
                          } else {
                            router.push(`/drive/file/${file.id}`);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`File: ${file.name}`}
                        style={{
                          display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #f2f2f2", alignItems: "center",
                          background: isSelected ? "#c2e7ff" : "white",
                          cursor: "default",
                          transition: "background 0.1s"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
                          {/* THUMBNAIL */}
                          <div
                            style={{
                              width: 32, height: 32, borderRadius: 4, overflow: "hidden",
                              background: isSelected ? "#c2e7ff" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0, color: "#444746"
                            }}
                          >
                            {["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.mimeType) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/files/${file.id}/download`} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />
                            ) : file.mimeType === "video/mp4" ? (
                              <video src={`/api/files/${file.id}/download`} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} muted />
                            ) : file.mimeType === "audio/mpeg" ? (
                              <Music size={24} />
                            ) : (
                              <FileText size={24} />
                            )}
                          </div>


                          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div
                                style={{ fontWeight: 500, color: "#1f1f1f" }}
                              >
                                {item.name}
                              </div>
                              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleSharePopover(e, "file", file); }}
                                  style={{
                                    width: 48, height: 48, borderRadius: 24,
                                    border: "none", background: "transparent",
                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#444746"
                                  }}
                                  title={owned ? "Share" : "Shared Details"}
                                >
                                  <Users size={24} />
                                </button>
                                {selectionMode ? (
                                  <div
                                    onClick={(e) => { e.stopPropagation(); handleSelectionClick(e, { kind: "file", id: file.id }, index, sortedItems); }}
                                    style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}
                                  >
                                    <div style={{
                                      width: 20, height: 20, borderRadius: 10,
                                      border: "2px solid", borderColor: isSelected ? "#0b57d0" : "#444746",
                                      background: isSelected ? "#0b57d0" : "transparent",
                                      display: "flex", alignItems: "center", justifyContent: "center"
                                    }}>
                                      {isSelected && <Check size={14} color="white" />}
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {/* Inline Actions */}
                                    {owned ? (
                                      <>
                                        <button
                                          aria-label="Rename"
                                          onClick={(e) => { e.stopPropagation(); renameFile(file.id); }}
                                          style={{ width: 48, height: 48, borderRadius: 24, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#444746" }}
                                          title="Rename"
                                        >
                                          <Edit2 size={24} />
                                        </button>
                                        <button
                                          aria-label="Move"
                                          onClick={(e) => { e.stopPropagation(); initiateMoveSingle("file", file.id); }}
                                          style={{ width: 48, height: 48, borderRadius: 24, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#444746" }}
                                          title="Move"
                                        >
                                          <ArrowRight size={24} />
                                        </button>
                                        <button
                                          aria-label="Download"
                                          onClick={(e) => { e.stopPropagation(); window.location.href = `/api/files/${file.id}/download`; }}
                                          style={{ width: 48, height: 48, borderRadius: 24, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#444746" }}
                                          title="Download"
                                        >
                                          <Download size={24} />
                                        </button>
                                        <button
                                          aria-label="Delete"
                                          onClick={(e) => { e.stopPropagation(); deleteFile(file.id); }}
                                          style={{ width: 48, height: 48, borderRadius: 24, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#d93025" }}
                                          title="Delete"
                                        >
                                          <Trash2 size={24} />
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        aria-label="Download"
                                        onClick={(e) => { e.stopPropagation(); window.location.href = `/api/files/${file.id}/download`; }}
                                        style={{ width: 48, height: 48, borderRadius: 24, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#444746" }}
                                        title="Download"
                                      >
                                        <Download size={24} />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            {/* @ts-expect-error path is dynamic */}
                            {file.path && <div style={{ fontSize: 11, color: "#5e5e5e" }}>{file.path}</div>}
                            <div style={{ fontSize: 11, color: "#5e5e5e" }}>{file.mimeType} • {Math.round(file.size / 1024)} KB {!owned ? `(Shared by ${file.owner?.username || file.owner?.name || file.owner?.email || "Unknown"})` : ""}</div>
                          </div>
                        </div>

                        {/* Space placeholder */}
                      </div>
                    );
                  }
                })}
              </div>
            </div >
          )
          }



          {/* PLUS BUTTON */}
          <div style={{ position: "fixed", bottom: 40, right: 40, zIndex: 1000 }}>
            <button
              ref={addBtnRef}
              aria-label="New"
              title="New"
              onClick={() => setAddMenuOpen(!addMenuOpen)}
              style={{
                width: 56, height: 56, borderRadius: 16,
                background: "#c2e7ff", color: "#001d35",
                border: "none",
                boxShadow: "0 4px 8px 3px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.3)",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "box-shadow 0.08s linear, min-width 0.15s cubic-bezier(0.4,0.0,0.2,1)"
              }}
            >
              <Plus size={24} strokeWidth={2.5} />
            </button>

            {addMenuOpen && (
              <div
                ref={addMenuRef}
                style={{
                  position: "absolute", bottom: 70, left: 0,
                  background: "white", borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
                  width: 200, overflow: "hidden", border: "1px solid #ddd"
                }}
              >
                {!codeMenuOpen ? (
                  <>
                    <button
                      data-testid="new-folder-button"
                      onClick={() => { setAddMenuOpen(false); setCreateFolderModalOpen(true); }}
                      style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500 }}
                    >
                      New Folder
                    </button>
                    <button
                      onClick={() => createFile("Untitled Document.doc", JSON.stringify({ type: "doc", content: [] }), "application/vnd.google-apps.document")}
                      style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500 }}
                    >
                      New Document
                    </button>
                    <button
                      onClick={() => createFile("Untitled Spreadsheet.csv", "", "text/csv")}
                      style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500 }}
                    >
                      New Spreadsheet
                    </button>
                    <button
                      onClick={() => setCodeMenuOpen(true)}
                      style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    >
                      <span>Code File</span>
                      <span style={{ fontSize: 10 }}>▶</span>
                    </button>
                    <button
                      onClick={() => { setAddMenuOpen(false); folderInputRef.current?.click(); }}
                      style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500 }}
                    >
                      Folder Upload
                    </button>
                    <div style={{ height: 1, background: "#eee", margin: "4px 0" }} />
                    <button
                      onClick={() => { setAddMenuOpen(false); fileInputRef.current?.click(); }}
                      style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500 }}
                    >
                      File Upload
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setCodeMenuOpen(false)}
                      style={{ width: "100%", textAlign: "left", padding: "8px 16px", background: "#f8f9fa", border: "none", cursor: "pointer", fontWeight: 600, borderBottom: "1px solid #eee", color: "#555" }}
                    >
                      ◀ Back
                    </button>
                    {[
                      { name: "Python", ext: "py", mime: "text/x-python" },
                      { name: "Java", ext: "java", mime: "text/x-java-source" },
                      { name: "JavaScript", ext: "js", mime: "application/javascript" },
                      { name: "HTML", ext: "html", mime: "text/html" },
                      { name: "CSS", ext: "css", mime: "text/css" },
                      { name: "C++", ext: "cpp", mime: "text/x-c++src" },
                      { name: "Text", ext: "txt", mime: "text/plain" },
                    ].map(lang => (
                      <button
                        key={lang.ext}
                        onClick={() => createFile(`Untitled.${lang.ext}`, "", lang.mime)}
                        style={{ width: "100%", textAlign: "left", padding: "10px 16px", background: "transparent", border: "none", cursor: "pointer", fontSize: 14 }}
                      >
                        {lang.name}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={async (e) => {
              setUploading(true);
              setAddMenuOpen(false);
              const files = e.target.files;
              if (files) {
                for (let i = 0; i < files.length; i++) {
                  const file = files[i];
                  // 1. Presign
                  const preRes = await fetch("/api/files/presign", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: file.name, size: file.size, mimeType: file.type || "application/octet-stream", folderId: folderId ?? null }),
                  });
                  const { uploadUrl, s3Key, fileId: draftFileId } = await preRes.json();

                  // 2. Upload S3
                  await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });

                  // 3. Finalize
                  await fetch("/api/files/finalize", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: file.name, size: file.size, mimeType: file.type || "application/octet-stream", s3Key, folderId: folderId ?? null }),
                  });
                }
                await load();
              }
              setUploading(false);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is non-standard
            webkitdirectory=""
            directory=""
            multiple
            style={{ display: "none" }}
            onChange={handleFolderUpload}
          />

          {/* Overlay if Uploading */}
          {
            uploading && (
              <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 24px", background: "#333", color: "white", borderRadius: 8 }}>
                Uploading...
              </div>
            )
          }

        </main >

        {/* MODALS */}
        {
          createFolderModalOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-folder-title"
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 6000, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <div style={{ background: "white", padding: 24, borderRadius: 12, width: 320 }}>
                <h3 id="new-folder-title" style={{ marginTop: 0 }}>New Folder</h3>
                <input
                  data-testid="new-folder-input"
                  autoFocus
                  placeholder="Folder name"
                  value={newFolderNameInput}
                  onChange={e => setNewFolderNameInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createFolder()}
                  style={{ width: "100%", padding: 8, marginBottom: 16, border: "1px solid #ddd", borderRadius: 4 }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button onClick={() => setCreateFolderModalOpen(false)} style={{ padding: "8px 16px", background: "transparent", border: "none", cursor: "pointer", color: "#1a73e8" }}>Cancel</button>
                  <button
                    data-testid="new-folder-create-button"
                    onClick={createFolder}
                    style={{ padding: "8px 16px", background: "#1a73e8", color: "white", borderRadius: 4, border: "none", cursor: "pointer" }}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )
        }
        {
          createFileModal && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-file-title"
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 6000, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <div style={{ background: "white", padding: 24, borderRadius: 12, width: 320 }}>
                <h3 id="new-file-title" style={{ marginTop: 0 }}>New File</h3>
                <input
                  data-testid="new-file-input"
                  autoFocus
                  placeholder="File name"
                  value={newFileNameInput}
                  onChange={e => setNewFileNameInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && performCreateFile()}
                  style={{ width: "100%", padding: 8, marginBottom: 16, border: "1px solid #ddd", borderRadius: 4 }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button onClick={() => setCreateFileModal(null)} style={{ padding: "8px 16px", background: "transparent", border: "none", cursor: "pointer", color: "#1a73e8" }}>Cancel</button>
                  <button
                    data-testid="new-file-create-button"
                    onClick={performCreateFile}
                    style={{ padding: "8px 16px", background: "#1a73e8", color: "white", borderRadius: 4, border: "none", cursor: "pointer" }}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {sharePopover && (
          <SharedItemPopover
            kind={sharePopover.kind}
            id={sharePopover.id}
            name={sharePopover.name}
            owner={sharePopover.owner}
            isOwned={sharePopover.isOwned}
            targetRef={sharePopover.targetRef}
            onClose={() => setSharePopover(null)}
            onManageSharing={() => {
              if (sharePopover) {
                setShareModal({ kind: sharePopover.kind, id: sharePopover.id, name: sharePopover.name });
                // No need to load shares manually or clear email, internal component handles it
              }
            }}
          />
        )}

        {
          shareModal && (
            <ShareModal
              kind={shareModal.kind}
              id={shareModal.id}
              name={shareModal.name}
              onClose={() => setShareModal(null)}
            />
          )
        }


        {/* CONTEXT MENU */}
        {
          menu && (
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
                  <MenuItem label="Move to..." onClick={initiateMoveSelected} />
                  <MenuItem label="Delete" danger onClick={deleteSelected} />
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
                    if (menu.kind === "folder") router.push(`/drive/f/${menu.id}`);
                    else router.push(`/drive/file/${menu.id}`);
                  }} />
                  <MenuItem label="Rename" onClick={() => { if (menu.kind === "file") renameFile(menu.id); else renameFolder(menu.id); }} />
                  <MenuItem label="Move to..." onClick={() => initiateMoveSingle(menu.kind, menu.id)} />
                  <MenuDivider />
                  <MenuItem label="Delete" danger onClick={() => { if (menu.kind === "file") deleteFile(menu.id); else deleteFolder(menu.id); }} />
                  {menu.kind === "file" && <MenuItem label="Download" onClick={() => window.location.href = `/api/files/${menu.id}/download`} />}
                </>
              )}
            </div>
          )
        }

        {
          movePicker && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="move-item-title"
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <div style={{ background: "white", padding: 20, borderRadius: 12, width: 400 }}>
                <h3 id="move-item-title">Move {movePicker.display}</h3>
                <div style={{ maxHeight: 300, overflow: "auto", margin: "10px 0" }}>
                  <div
                    data-testid="move-destination-root"
                    onClick={() => performMove(null)}
                    role="button"
                    tabIndex={0}
                    aria-label="Move to Root"
                    onKeyDown={e => e.key === "Enter" && performMove(null)}
                    style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #eee", fontWeight: 600 }}
                  >
                    My Drive (Root)
                  </div>
                  {moveDestinations.map(f => (
                    <div
                      key={f.id}
                      data-testid={`move-destination-${f.id}`}
                      onClick={() => performMove(f.id)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Move to ${f.name}`}
                      onKeyDown={e => e.key === "Enter" && performMove(f.id)}
                      style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #eee" }}
                    >
                      {f.name}
                    </div>
                  ))}
                  {moveDestinations.length === 0 && <div style={{ padding: 10, opacity: 0.6 }}>No other folders</div>}
                </div>
                <button onClick={() => setMovePicker(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "white", width: "100%" }}>Cancel</button>
              </div>
            </div>
          )
        }

        {
          previewFile && (
            <MediaPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
          )
        }

      </div >
      {/* RENAME MODAL */}
      {renameModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 6000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-title"
            data-testid="rename-modal"
            style={{ background: "white", padding: 24, borderRadius: 12, width: 320 }}>
            <h3 id="rename-title" style={{ marginTop: 0 }}>Rename</h3>
            <input
              autoFocus
              data-testid="rename-input"
              value={renameModal.name}
              onChange={e => setRenameModal({ ...renameModal, name: e.target.value })}
              onKeyDown={e => e.key === "Enter" && performRename()}
              style={{ width: "100%", padding: 8, marginBottom: 16, border: "1px solid #ddd", borderRadius: 4 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                data-testid="rename-cancel"
                onClick={() => setRenameModal(null)}
                style={{ padding: "8px 16px", background: "transparent", border: "none", cursor: "pointer", color: "#1a73e8" }}>
                Cancel
              </button>
              <button
                data-testid="rename-ok"
                onClick={performRename}
                style={{ padding: "8px 16px", background: "#1a73e8", color: "white", borderRadius: 4, border: "none", cursor: "pointer" }}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  if (label === "Open" && onClick.toString().includes("menu.kind")) {
    // Safety check
  }
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
