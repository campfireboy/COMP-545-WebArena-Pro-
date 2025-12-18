"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { MediaPreviewModal } from "@/components/MediaPreviewModal";

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

const SharedItemPopover = ({
  item,
  onClose,
  onShare,
}: {
  item: SharePopoverState;
  onClose: () => void;
  onShare: () => void;
}) => {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    fetch(`/api/shares?${item.kind}Id=${item.id}`)
      .then((res) => res.json())
      .then((data) => {
        setShares(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [item]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        if (!item?.targetRef.contains(e.target as Node)) {
          onClose();
        }
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose, item]);

  if (!item) return null;

  const rect = item.targetRef.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 8;
  const left = Math.min(rect.left + window.scrollX, window.innerWidth - 320);

  return (
    <div
      ref={popoverRef}
      style={{
        position: "absolute",
        top,
        left,
        zIndex: 1000,
        background: "white",
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 16,
        width: 300,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Access Details</h3>
        <button
          onClick={onClose}
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div style={{ marginBottom: 12, fontSize: 13 }}>
        <div style={{ fontWeight: 600 }}>Owner:</div>
        <div>
          {item.isOwned
            ? "Me (You)"
            : item.owner?.username
              ? item.owner.name ? `${item.owner.username} (${item.owner.name})` : item.owner.username
              : item.owner?.name || item.owner?.email || "Unknown"}
        </div>
      </div>

      <div style={{ fontSize: 13, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Shared with:</div>
        {loading ? (
          <div style={{ color: "#666" }}>Loading...</div>
        ) : shares.length === 0 ? (
          <div style={{ color: "#666" }}>Not shared</div>
        ) : (
          <div style={{ maxHeight: 100, overflow: "auto" }}>
            {shares.map((s) => {
              const display = s.sharedWithUser?.username || s.sharedWithUser?.name || s.sharedWithUser?.email || "Link";

              return (
                <div key={s.id} style={{ marginBottom: 4 }}>
                  {display} ({s.permission})
                </div>
              );
            })}
          </div>
        )}
      </div>

      {item.isOwned && (
        <button
          onClick={onShare}
          style={{
            width: "100%",
            padding: "8px",
            background: "#e8f0fe",
            color: "#1a73e8",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Manage Sharing
        </button>
      )}
    </div>
  );
};

export default function DriveView({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const { data: session } = useSession();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileObject[]>([]);
  const [loading, setLoading] = useState(true);
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

  async function createFile(defaultName: string, content: string, mimeType: string, askForName: boolean = true) {
    setAddMenuOpen(false);
    setCodeMenuOpen(false);

    let name = defaultName;
    if (askForName) {
      const input = prompt("Enter file name:", defaultName);
      if (input === null) return; // Cancelled
      if (!input.trim()) return; // Empty
      name = input.trim();

      // Ensure extension matches default if needed
      const extIndex = defaultName.lastIndexOf(".");
      if (extIndex !== -1) {
        const ext = defaultName.substring(extIndex);
        if (!name.endsWith(ext)) {
          name = name + ext;
        }
      }
    }

    const res = await fetch("/api/files/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: folderId ?? null, name, content, mimeType }),
    });

    if (res.ok) {
      const newFile = await res.json();
      // Redirect to the new file
      router.push(`/drive/file/${newFile.id}`);
    } else {
      alert(`Failed to create ${name}`);
    }
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
  const [shares, setShares] = useState<Share[]>([]);
  const [shareEmail, setShareEmail] = useState("");
  const [sharePermission, setSharePermission] = useState("READ");
  const [loadingShares, setLoadingShares] = useState(false);

  // Unshare Check
  const [unshareModal, setUnshareModal] = useState<UnshareModalState>(null);

  const [movePicker, setMovePicker] = useState<null | { ids: string[]; display: string }>(null);
  const [previewFile, setPreviewFile] = useState<FileObject | null>(null);

  async function deleteSelected() {
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

  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, search]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, search]);

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
        // Folders first in 'type' sort usually, but let's strictly sort by type string
        const typeA = a.kind === "folder" ? "000_folder" : (a as FileObject).mimeType;
        const typeB = b.kind === "folder" ? "000_folder" : (b as FileObject).mimeType;
        res = typeA.localeCompare(typeB);
      }
      return sortDirection === "asc" ? res : -res;
    });
  }, [filteredFolders, filteredFiles, sortField, sortDirection]);

  const moveDestinations = useMemo(() => {
    if (!movePicker) return filteredFolders;
    // Exclude any folders that are currently being moved to avoid cycles/self-move
    const movingFolderIds = new Set(movePicker.ids.filter(id => id.startsWith("folder:")).map(id => id.split(":")[1]));
    return filteredFolders.filter((f) => !movingFolderIds.has(f.id));
  }, [filteredFolders, movePicker]);

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
    if (!confirm("Delete this folder and everything inside it?")) return;
    const res = await fetch(`/api/folders/${folderIdToDelete}`, { method: "DELETE" });
    if (!res.ok) alert("Failed to delete folder");
    else await load();
  }

  async function deleteFile(fileId: string) {
    setMenu(null);
    if (!confirm("Delete this file?")) return;
    const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
    if (!res.ok) alert("Failed to delete file");
    else await load();
  }

  async function renameFolder(id: string) {
    setMenu(null);
    const folder = folders.find((f) => f.id === id);
    if (!folder) return;
    const newName = prompt("New folder name:", folder.name);
    if (!newName || !newName.trim() || newName === folder.name) return;
    const res = await fetch(`/api/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, type: "folder", name: newName.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to rename");
    } else await load();
  }

  async function renameFile(id: string) {
    setMenu(null);
    const file = files.find((f) => f.id === id);
    if (!file) return;
    const newName = prompt("New file name:", file.name);
    if (!newName || !newName.trim() || newName === file.name) return;
    const res = await fetch(`/api/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, type: "file", name: newName.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to rename");
    } else await load();
  }

  // --- MOVE LOGIC ---




  // --- SHARING LOGIC ---

  async function loadModalShares(kind: "file" | "folder", id: string) {
    setLoadingShares(true);
    const res = await fetch("/api/shares");
    if (res.ok) {
      const all = await res.json();
      setShares(all.filter((s: any) => (kind === "file" ? s.fileId === id : s.folderId === id)));
    }
    setLoadingShares(false);
  }

  async function addShare() {
    if (!shareModal || !shareEmail.trim()) return;
    const res = await fetch("/api/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [shareModal.kind === "file" ? "fileId" : "folderId"]: shareModal.id,
        sharedWithEmail: shareEmail.trim(),
        permission: sharePermission,
      }),
    });
    if (!res.ok) {
      const msg = await res.json().catch(() => ({}));
      alert(msg?.error || "Failed to share");
      return;
    }
    setShareEmail("");
    await loadModalShares(shareModal.kind, shareModal.id);
  }

  async function removeShare(shareId: string) {
    if (!shareModal) return;
    const res = await fetch(`/api/shares/${shareId}`, { method: "DELETE" });
    if (res.ok) await loadModalShares(shareModal.kind, shareModal.id);
  }

  async function updateSharePermission(shareId: string, newPermission: string) {
    if (!shareModal) return;
    const res = await fetch(`/api/shares/${shareId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission: newPermission })
    });
    if (res.ok) await loadModalShares(shareModal.kind, shareModal.id);
    else alert("Failed to update permission");
  }

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
          {/* Top Bar */}
          <div style={{ marginBottom: 16 }} onClick={(e) => e.stopPropagation()}>
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 10 }}
            />
          </div>

          {loading ? <div>Loading...</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* BREADCRUMBS & SORT */}
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 600, color: "#5f6368" }}>
                  <span
                    onClick={() => router.push("/drive")}
                    style={{ cursor: "pointer", color: breadcrumbs.length === 0 ? "#202124" : "inherit" }}
                  >
                    My Drive
                  </span>
                  {breadcrumbs.map((b, i) => (
                    <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{'>'}</span>
                      <span
                        onClick={() => i < breadcrumbs.length - 1 ? router.push(`/drive/f/${b.id}`) : null}
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

              {/* ACTION TOOLBAR (Always Visible) */}
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 16px", background: "#f1f3f4", borderRadius: 8, marginBottom: 12,
                  border: "1px solid #dadce0",
                  opacity: selectedIds.size > 0 ? 1 : 0.5,
                  pointerEvents: selectedIds.size > 0 ? "auto" : "none",
                  transition: "opacity 0.2s"
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }}
                    style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: "#5f6368", visibility: selectedIds.size > 0 ? "visible" : "hidden" }}
                  >
                    ✕
                  </button>
                  <span style={{ fontWeight: 600, color: "#202124" }}>
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select items..."}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
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
                            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18 }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => toggleSharePopover(e, kind as "folder" | "file", item)}
                            title="Share"
                            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18 }}
                          >
                            👥
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
                      style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18 }}
                    >
                      ⬇️
                    </button>
                  )}
                  <button onClick={initiateMoveSelected} title="Move" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18 }}>➡️</button>
                  <button onClick={deleteSelected} title="Delete" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18 }}>🗑️</button>
                </div>
              </div>

              {/* UNIFIED LIST */}
              <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden", userSelect: "none" }}>
                {sortedItems.map((item, index) => {
                  if (item.kind === "folder") {
                    const f = item as Folder;
                    const owned = isOwned(f);
                    const isSelected = selectedIds.has(`folder:${f.id}`);
                    return (
                      <div key={`folder-${f.id}`}
                        onContextMenu={(e) => handleContextMenu(e, "folder", f.id)}
                        onClick={(e) => handleSelectionClick(e, { kind: "folder", id: f.id }, index, sortedItems)}
                        onDoubleClick={() => router.push(`/drive/f/${f.id}`)}
                        style={{
                          display: "flex", justifyContent: "space-between", padding: 12, borderBottom: "1px solid #f2f2f2", alignItems: "center",
                          cursor: "pointer",
                          background: isSelected ? "#e8f0fe" : "white"
                        }}
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
                            <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>Folder {!owned ? `(Shared by ${f.owner?.username || f.owner?.name || f.owner?.email || "Unknown"})` : ""}</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={(e) => toggleSharePopover(e, "folder", f)}
                            style={{
                              width: 34, height: 34, borderRadius: 10,
                              border: "1px solid #ddd", background: "white",
                              cursor: "pointer", fontSize: 16, flexShrink: 0,
                              display: "flex", alignItems: "center", justifyContent: "center"
                            }}
                            title={owned ? "Share" : "Shared Details"}
                          >
                            👥
                          </button>
                          {selectionMode ? (
                            <div
                              onClick={(e) => { e.stopPropagation(); handleSelectionClick(e, { kind: "folder", id: f.id }, index, sortedItems); }}
                              style={{ width: 34, height: 34, borderRadius: 10, border: "2px solid", borderColor: isSelected ? "#1a73e8" : "#ccc", background: isSelected ? "#1a73e8" : "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                              {isSelected && <span style={{ color: "white", fontSize: 18 }}>✓</span>}
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                handleContextMenu(e, "folder", f.id);
                              }}
                              style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                              ⋯
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  } else {
                    const file = item as FileObject;
                    const owned = isOwned(file);
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
                              {item.name}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>{file.mimeType} • {Math.round(file.size / 1024)} KB {!owned ? `(Shared by ${file.owner?.username || file.owner?.name || file.owner?.email || "Unknown"})` : ""}</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={(e) => toggleSharePopover(e, "file", file)}
                            style={{
                              width: 34, height: 34, borderRadius: 10,
                              border: "1px solid #ddd", background: "white",
                              cursor: "pointer", fontSize: 16, flexShrink: 0,
                              display: "flex", alignItems: "center", justifyContent: "center"
                            }}
                            title={owned ? "Share" : "Shared Details"}
                          >
                            👥
                          </button>
                          {selectionMode ? (
                            <div
                              onClick={(e) => { e.stopPropagation(); handleSelectionClick(e, { kind: "file", id: file.id }, index, sortedItems); }}
                              style={{ width: 34, height: 34, borderRadius: 10, border: "2px solid", borderColor: isSelected ? "#1a73e8" : "#ccc", background: isSelected ? "#1a73e8" : "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                              {isSelected && <span style={{ color: "white", fontSize: 18 }}>✓</span>}
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                handleContextMenu(e, "file", file.id);
                              }}
                              style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                              ⋯
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            </div >
          )
          }

          {/* PLUS BUTTON */}
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
                  width: 200, overflow: "hidden", border: "1px solid #ddd"
                }}
              >
                {!codeMenuOpen ? (
                  <>
                    <button
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
          )
        }

        <SharedItemPopover
          item={sharePopover}
          onClose={() => setSharePopover(null)}
          onShare={() => {
            if (sharePopover) {
              setShareModal({ kind: sharePopover.kind, id: sharePopover.id, name: sharePopover.name });
              setShareEmail("");
              loadModalShares(sharePopover.kind, sharePopover.id);
            }
          }}
        />

        {
          shareModal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "white", padding: 24, borderRadius: 12, width: 500, maxWidth: "90%" }}>
                <h3>Share "{shareModal.name}"</h3>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <input placeholder="Username or email" value={shareEmail} onChange={e => setShareEmail(e.target.value)} style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 8 }} />
                  <select
                    value={sharePermission}
                    onChange={(e) => setSharePermission(e.target.value)}
                    style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, background: "white" }}
                  >
                    <option value="READ">Viewer</option>
                    <option value="EDIT">Editor</option>
                  </select>
                  <button onClick={addShare} style={{ padding: "8px 16px", background: "#1a73e8", color: "white", borderRadius: 8, border: "none", cursor: "pointer" }}>Share</button>
                </div>
                <div>
                  <h4 style={{ marginBottom: 8 }}>People with access</h4>
                  {shares.map(s => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", margin: "4px 0", padding: 8, border: "1px solid #eee", borderRadius: 8, alignItems: "center" }}>
                      <span>{s.sharedWithUser?.username || s.sharedWithUser?.name || s.sharedWithUser?.email}</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <select
                          value={s.permission}
                          onChange={(e) => updateSharePermission(s.id, e.target.value)}
                          style={{ padding: 4, borderRadius: 4, border: "1px solid #ddd", background: "white", fontSize: 13 }}
                        >
                          <option value="READ">Viewer</option>
                          <option value="EDIT">Editor</option>
                        </select>
                        <button onClick={() => removeShare(s.id)} style={{ background: "transparent", border: "none", color: "red", cursor: "pointer" }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShareModal(null)} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer" }}>Done</button>
              </div>
            </div>
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
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "white", padding: 20, borderRadius: 12, width: 400 }}>
                <h3>Move {movePicker.display}</h3>
                <div style={{ maxHeight: 300, overflow: "auto", margin: "10px 0" }}>
                  <div onClick={() => performMove(null)} style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #eee", fontWeight: 600 }}>My Drive (Root)</div>
                  {moveDestinations.map(f => (
                    <div key={f.id} onClick={() => performMove(f.id)} style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #eee" }}>{f.name}</div>
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
