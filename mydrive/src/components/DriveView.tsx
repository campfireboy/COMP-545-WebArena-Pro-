"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Sidebar } from "@/components/Sidebar";

type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  ownerId: string;
  owner?: { id: string; name: string | null; email: string };
};

type FileObject = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  folderId: string | null;
  createdAt: string;
  ownerId: string;
  owner?: { id: string; name: string | null; email: string };
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
  owner?: { id: string; name: string | null; email: string };
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
  sharedWithUser: { email: string; name: string | null } | null;
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
            : `${item.owner?.name || item.owner?.email || "Unknown"} (Shared with you)`}
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
            {shares.map((s) => (
              <div key={s.id} style={{ marginBottom: 4 }}>
                {s.sharedWithUser?.name || s.sharedWithUser?.email || "Link"} ({s.permission})
              </div>
            ))}
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
  const [menu, setMenu] = useState<MenuState>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // New Folder Modal
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState("");

  // Add Button Menu
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Share Modal & Popover
  const [shareModal, setShareModal] = useState<ShareModalState>(null);
  const [sharePopover, setSharePopover] = useState<SharePopoverState>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [shareEmail, setShareEmail] = useState("");
  const [loadingShares, setLoadingShares] = useState(false);

  // Unshare Check
  const [unshareModal, setUnshareModal] = useState<UnshareModalState>(null);

  const [movePicker, setMovePicker] = useState<null | { kind: "folder" | "file"; id: string }>(null);

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

  const moveDestinations = useMemo(() => {
    const excludeId = movePicker?.kind === "folder" ? movePicker.id : null;
    return filteredFolders.filter((f) => f.id !== excludeId);
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
    if (!res.ok) alert("Failed to rename");
    else await load();
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
    if (!res.ok) alert("Failed to rename");
    else await load();
  }

  // --- MOVE LOGIC ---

  async function initiateMove(itemId: string, itemKind: "file" | "folder", targetId: string | null) {
    setMenu(null);
    setMovePicker(null);

    // Check for shared parent
    if (folderId) {
      const res = await fetch(`/api/shares?folderId=${folderId}`);
      if (res.ok) {
        const currentFolderShares = await res.json();
        if (currentFolderShares.length > 0) {
          setUnshareModal({
            itemKind,
            itemId,
            targetId,
            parentShares: currentFolderShares
          });
          return;
        }
      }
    }
    await performMove(itemId, itemKind, targetId);
  }

  async function performMove(itemId: string, itemKind: "file" | "folder", targetId: string | null) {
    const endpoint = itemKind === "file" ? `/api/files/${itemId}` : `/api/folders/${itemId}`;
    const payload = itemKind === "file" ? { folderId: targetId } : { parentId: targetId };

    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "Failed to move");
      return;
    }
    await load();
  }

  async function handleUnshareDecision(keepShares: boolean) {
    if (!unshareModal) return;
    const { itemKind, itemId, targetId, parentShares } = unshareModal;
    setUnshareModal(null);

    if (keepShares) {
      for (const s of parentShares) {
        if (!s.sharedWithUser) continue;
        await fetch("/api/shares", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [itemKind === "file" ? "fileId" : "folderId"]: itemId,
            sharedWithEmail: s.sharedWithUser.email,
            permission: s.permission,
          }),
        });
      }
    }
    await performMove(itemId, itemKind, targetId);
  }


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
        permission: "READ",
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
    <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
      {/* Sidebar */}
      <Sidebar activePage="drive" />

      {/* Main */}
      <main style={{ flex: 1, padding: 16, position: "relative" }}>
        {/* Top Bar */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 10 }}
          />
          <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "white" }}>
            Sign Out
          </button>
        </div>

        {loading ? <div>Loading...</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* FOLDERS */}
            <section>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Folders</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                {filteredFolders.map(f => {
                  const owned = isOwned(f);
                  return (
                    <div key={f.id}
                      onClick={() => router.push(`/drive/f/${f.id}`)}
                      style={{
                        border: "1px solid #eee", padding: 12, borderRadius: 12,
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        cursor: "pointer", background: "white"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                        <button
                          onClick={(e) => toggleSharePopover(e, "folder", f)}
                          style={{
                            width: 34, height: 34, borderRadius: 10,
                            border: "1px solid #ddd", background: "white",
                            cursor: "pointer", fontSize: 16, flexShrink: 0
                          }}
                          title={owned ? "Share" : "Shared Details"}
                        >
                          👥
                        </button>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>Folder {!owned ? `(Shared by ${f.owner?.name || f.owner?.email || "Unknown"})` : ""}</div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => openMenu(e, "folder", f.id)}
                        style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", marginLeft: 8 }}
                      >
                        ⋯
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* FILES */}
            <section>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Files</div>
              <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
                {filteredFiles.map(file => {
                  const owned = isOwned(file);
                  return (
                    <div key={file.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderBottom: "1px solid #f2f2f2", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                        <button
                          onClick={(e) => toggleSharePopover(e, "file", file)}
                          style={{
                            width: 34, height: 34, borderRadius: 10,
                            border: "1px solid #ddd", background: "white",
                            cursor: "pointer", fontSize: 16, flexShrink: 0
                          }}
                          title={owned ? "Share" : "Shared Details"}
                        >
                          👥
                        </button>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>{file.name}</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>{file.mimeType} • {Math.round(file.size / 1024)} KB {!owned ? `(Shared by ${file.owner?.name || file.owner?.email || "Unknown"})` : ""}</div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => openMenu(e, "file", file.id)}
                        style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", marginLeft: 8 }}
                      >
                        ⋯
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

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

      {shareModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", padding: 24, borderRadius: 12, width: 500, maxWidth: "90%" }}>
            <h3>Share "{shareModal.name}"</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input placeholder="user@example.com" value={shareEmail} onChange={e => setShareEmail(e.target.value)} style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 8 }} />
              <button onClick={addShare} style={{ padding: "8px 16px", background: "#1a73e8", color: "white", borderRadius: 8, border: "none", cursor: "pointer" }}>Share</button>
            </div>
            <div>
              <h4 style={{ marginBottom: 8 }}>People with access</h4>
              {shares.map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", margin: "4px 0", padding: 8, border: "1px solid #eee", borderRadius: 8 }}>
                  <span>{s.sharedWithUser?.email}</span>
                  <button onClick={() => removeShare(s.id)} style={{ background: "transparent", border: "none", color: "red", cursor: "pointer" }}>Remove</button>
                </div>
              ))}
            </div>
            <button onClick={() => setShareModal(null)} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer" }}>Done</button>
          </div>
        </div>
      )}

      {unshareModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", padding: 24, borderRadius: 12, width: 450, maxWidth: "90%", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 16px 0" }}>Move out of shared folder?</h3>
            <p style={{ lineHeight: 1.5, color: "#444", marginBottom: 20 }}>
              Would you like to also unshare this {unshareModal.itemKind}?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => handleUnshareDecision(false)}
                style={{ padding: "12px", background: "#d93025", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
              >
                Yes, Unshare (Remove Access)
              </button>
              <button
                onClick={() => handleUnshareDecision(true)}
                style={{ padding: "12px", background: "#f1f3f4", color: "#3c4043", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
              >
                No, Maintain Shares (Copy Permissions)
              </button>
              <button
                onClick={() => setUnshareModal(null)}
                style={{ padding: "12px", background: "transparent", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", marginTop: 8 }}
              >
                Cancel Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTEXT MENU */}
      {menu && (
        <div
          ref={menuRef}
          style={{
            position: "fixed", top: menu.y, left: menu.x - 200, background: "white", border: "1px solid #ddd", borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.1)", zIndex: 3000,
            width: 200, display: "flex", flexDirection: "column"
          }}
        >
          <MenuItem label="Open" onClick={() => { if (menu.kind === "folder") router.push(`/drive/f/${menu.id}`); }} />
          <MenuItem label="Rename" onClick={() => { if (menu.kind === "file") renameFile(menu.id); else renameFolder(menu.id); }} />
          <MenuItem label="Move to..." onClick={() => setMovePicker({ kind: menu.kind, id: menu.id })} />
          <MenuDivider />
          <MenuItem label="Delete" danger onClick={() => { if (menu.kind === "file") deleteFile(menu.id); else deleteFolder(menu.id); }} />
          {menu.kind === "file" && <MenuItem label="Download" onClick={() => window.location.href = `/api/files/${menu.id}/download`} />}
        </div>
      )}

      {movePicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", padding: 20, borderRadius: 12, width: 400 }}>
            <h3>Move {movePicker.kind}</h3>
            <div style={{ maxHeight: 300, overflow: "auto", margin: "10px 0" }}>
              <div onClick={() => initiateMove(movePicker.id, movePicker.kind, null)} style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #eee", fontWeight: 600 }}>My Drive (Root)</div>
              {moveDestinations.map(f => (
                <div key={f.id} onClick={() => initiateMove(movePicker.id, movePicker.kind, f.id)} style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #eee" }}>{f.name}</div>
              ))}
              {moveDestinations.length === 0 && <div style={{ padding: 10, opacity: 0.6 }}>No other folders</div>}
            </div>
            <button onClick={() => setMovePicker(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "white", width: "100%" }}>Cancel</button>
          </div>
        </div>
      )}

    </div>
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
