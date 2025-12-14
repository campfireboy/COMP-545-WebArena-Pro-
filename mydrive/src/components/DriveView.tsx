"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

type FileObject = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  folderId: string | null;
  createdAt: string;
};

type MenuState =
  | null
  | {
      kind: "folder" | "file";
      id: string;
      x: number;
      y: number;
    };

export default function DriveView({ folderId }: { folderId: string | null }) {
  const router = useRouter();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileObject[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [newFolderName, setNewFolderName] = useState("");

  const [uploading, setUploading] = useState(false);

  const [menu, setMenu] = useState<MenuState>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  // Close menu on click outside / ESC
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!menu) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

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

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;

    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
      name,
      parentId: folderId ?? null,
      }),
    });


    if (!res.ok) {
      if (res.status === 401) router.push("/login");
      alert("Failed to create folder");
      return;
    }

    setNewFolderName("");
    await load();
  }

  function chooseDestinationFolderId(): string | null | undefined {
  // returns:
  // - string: destination folder id
  // - null: move to root
  // - undefined: user cancelled
  const options =
    `Move to where?\n\n` +
    `Type one of:\n` +
    `- root\n` +
    filteredFolders.map((f) => `- ${f.name}: ${f.id}`).join("\n") +
    `\n\nPaste the folder id, or type "root".`;

  const input = window.prompt(options);
  if (input === null) return undefined; // cancelled

  const t = input.trim();
  if (!t) return undefined;

  if (t.toLowerCase() === "root") return null;

  // allow quick "name" entry too (optional)
  const byName = filteredFolders.find((f) => f.name.toLowerCase() === t.toLowerCase());
  if (byName) return byName.id;

  // otherwise treat it as an id
  return t;
}

    async function moveFolder(folderIdToMove: string, parentId: string | null) {
    setMenu(null);

    const res = await fetch(`/api/folders/${encodeURIComponent(folderIdToMove)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId }),
    });

    if (!res.ok) {
      const msg = await res.json().catch(() => ({}));
      alert(msg?.error ?? "Failed to move folder");
      return;
    }

    await load();
  }


  
  async function deleteFile(fileId: string) {
    setMenu(null);
    const ok = confirm("Delete this file? This cannot be undone.");
    if (!ok) return;

    const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
    if (!res.ok) {
      if (res.status === 401) router.push("/login");
      alert("Failed to delete file");
      return;
    }
    await load();
  }

  async function moveFile(fileId: string, targetFolderId: string | null) {
    setMenu(null);

    const res = await fetch(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: targetFolderId }),
    });

    if (!res.ok) {
      if (res.status === 401) router.push("/login");
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "Failed to move file");
      return;
    }
    await load();
  }

  async function deleteFolder(folderIdToDelete: string) {
    setMenu(null);
    const ok = confirm("Delete this folder and everything inside it? This cannot be undone.");
    if (!ok) return;

    const res = await fetch(`/api/folders/${folderIdToDelete}`, { method: "DELETE" });
    if (!res.ok) {
      if (res.status === 401) router.push("/login");
      alert("Failed to delete folder");
      return;
    }
    await load();
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const presign = await fetch("/api/files/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          folderId: folderId ?? null,
        }),
      });

      if (!presign.ok) {
        if (presign.status === 401) router.push("/login");
        throw new Error("presign failed");
      }

      const { uploadUrl, s3Key } = await presign.json();

      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) throw new Error("upload failed");

      const finalize = await fetch("/api/files/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          s3Key,
          folderId: folderId ?? null,
        }),
      });

      if (!finalize.ok) throw new Error("finalize failed");

      await load();
    } catch (e) {
      console.error(e);
      alert("Upload failed. Check server logs.");
    } finally {
      setUploading(false);
    }
  }

  function downloadFile(fileId: string) {
    setMenu(null);
    window.location.href = `/api/files/${fileId}/download`;
  }

  function openMenu(e: React.MouseEvent, kind: "folder" | "file", id: string) {
    e.preventDefault();
    e.stopPropagation();

    const clickX = e.clientX;
    const clickY = e.clientY;

    // small offset so it doesn't overlap cursor
    setMenu({ kind, id, x: clickX + 6, y: clickY + 6 });
  }

  function FolderRow({ f }: { f: Folder }) {
  return (
    <div
      onClick={() => router.push(`/drive/f/${f.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") router.push(`/drive/f/${f.id}`);
      }}
      style={{
        border: "1px solid #eee",
        padding: 12,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        cursor: "pointer",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {f.name}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Folder</div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          openMenu(e, "folder", f.id);
        }}
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "white",
          cursor: "pointer",
          fontSize: 18,
          lineHeight: "18px",
        }}
        aria-label="Folder actions"
        title="Actions"
      >
        ⋯
      </button>
    </div>
  );
}


  function FileRow({ file }: { file: FileObject }) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: 12,
          borderBottom: "1px solid #f2f2f2",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {file.mimeType} • {Math.max(1, Math.round(file.size / 1024))} KB
          </div>
        </div>

        <button
          onClick={(e) => openMenu(e, "file", file.id)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: "18px",
            flexShrink: 0,
          }}
          aria-label="File actions"
          title="Actions"
        >
          ⋯
        </button>
      </div>
    );
  }

  // helper to get name/id lists for Move prompt
  function movePrompt(fileId: string) {
    // Offer: root + visible folders on this screen
    const promptText =
      `Move to which folder?\n\n` +
      `Type one of:\n` +
      `- root\n` +
      filteredFolders.map((f) => `- ${f.name}: ${f.id}`).join("\n") +
      `\n\nPaste the folder id, or type "root".`;

    const target = prompt(promptText);
    if (target === null) return;

    const t = target.trim();
    if (!t) return;

    if (t.toLowerCase() === "root") {
      moveFile(fileId, null);
      return;
    }

    moveFile(fileId, t);
  }

    function openMovePicker(kind: "folder" | "file", id: string) {
    setMenu(null);
    setMovePicker({ kind, id });
  }

  function closeMovePicker() {
    setMovePicker(null);
  }

  const moveDestinations = useMemo(() => {
    // For folder moves, don't allow selecting the folder being moved.
    const excludeId = movePicker?.kind === "folder" ? movePicker.id : null;
    return filteredFolders.filter((f) => f.id !== excludeId);
  }, [filteredFolders, movePicker]);


  return (
    <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
      {/* Sidebar */}
      <aside style={{ width: 240, borderRight: "1px solid #eee", padding: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 16 }}>MyDrive</div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => router.push("/drive")} style={{ textAlign: "left" }}>
            My Drive
          </button>
          <button disabled style={{ textAlign: "left", opacity: 0.6 }}>
            Shared with me (later)
          </button>
          <button disabled style={{ textAlign: "left", opacity: 0.6 }}>
            Recent (later)
          </button>
          <button disabled style={{ textAlign: "left", opacity: 0.6 }}>
            Trash (later)
          </button>
        </nav>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: 16 }}>
        {/* Top bar */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <input
            placeholder="Search files and folders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 10 }}
          />

          <label style={{ border: "1px solid #ddd", padding: "8px 12px", borderRadius: 10, cursor: "pointer" }}>
            {uploading ? "Uploading..." : "Upload"}
            <input
              type="file"
              style={{ display: "none" }}
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        {/* Create folder */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            placeholder="New folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 10, width: 280 }}
          />
          <button onClick={createFolder} style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 10 }}>
            Create folder
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Folders */}
            <section>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Folders</div>
              {filteredFolders.length === 0 ? (
                <div style={{ opacity: 0.7 }}>No folders</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                  {filteredFolders.map((f) => (
                    <FolderRow key={f.id} f={f} />
                  ))}
                </div>
              )}
            </section>

            {/* Files */}
            <section>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Files</div>
              {filteredFiles.length === 0 ? (
                <div style={{ opacity: 0.7 }}>No files</div>
              ) : (
                <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
                  {filteredFiles.map((file) => (
                    <FileRow key={file.id} file={file} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Context menu */}
            {/* Move picker modal */}
      {movePicker && (
        <div
          onMouseDown={(e) => {
            // click outside closes
            if (e.target === e.currentTarget) closeMovePicker();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: 9998,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: 520,
              maxWidth: "100%",
              background: "white",
              border: "1px solid #e6e6e6",
              borderRadius: 16,
              boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                Move {movePicker.kind === "folder" ? "folder" : "file"} to…
              </div>
              <button
                onClick={closeMovePicker}
                style={{
                  border: "1px solid #ddd",
                  background: "white",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {/* Root */}
              <button
                onClick={async () => {
                  const item = movePicker;
                  closeMovePicker();
                  if (!item) return;

                  if (item.kind === "file") await moveFile(item.id, null);
                  else await moveFolder(item.id, null);
                }}
                style={{
                  textAlign: "left",
                  width: "100%",
                  border: "1px solid #ddd",
                  background: "white",
                  borderRadius: 12,
                  padding: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 800 }}>Root</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>folderId = null</div>
              </button>

              {/* Subfolders */}
              {moveDestinations.length === 0 ? (
                <div style={{ padding: 10, opacity: 0.7, border: "1px dashed #ddd", borderRadius: 12 }}>
                  No subfolders in this folder.
                </div>
              ) : (
                moveDestinations.map((f) => (
                  <button
                    key={f.id}
                    onClick={async () => {
                      const item = movePicker;
                      closeMovePicker();
                      if (!item) return;

                      if (item.kind === "file") await moveFile(item.id, f.id);
                      else await moveFolder(item.id, f.id);
                    }}
                    style={{
                      textAlign: "left",
                      width: "100%",
                      border: "1px solid #ddd",
                      background: "white",
                      borderRadius: 12,
                      padding: 10,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {f.name}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{f.name} = {f.id}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}



      {menu && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            width: 220,
            background: "white",
            border: "1px solid #e6e6e6",
            borderRadius: 12,
            boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
            padding: 6,
            zIndex: 9999,
          }}
        >
          {menu.kind === "folder" ? (
            <>
              <MenuItem
                label="Open"
                onClick={() => {
                  const id = menu.id;
                  setMenu(null);
                  router.push(`/drive/f/${id}`);
                }}
              />
              <MenuDivider />
              <MenuItem label="Delete" danger onClick={() => deleteFolder(menu.id)} />
              <MenuDivider />
              <MenuItem label="Move…" onClick={() => openMovePicker("folder", menu.id)} />

            </>
          ) : (
            <>
              <MenuItem label="Download" onClick={() => downloadFile(menu.id)} />
              <MenuItem label="Move…" onClick={() => openMovePicker("file", menu.id)} />
              {folderId ? (
                <MenuItem label="Remove from folder" onClick={() => moveFile(menu.id, null)} />
              ) : null}
              <MenuDivider />
              <MenuItem label="Delete" danger onClick={() => deleteFile(menu.id)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
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
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: "#efefef", margin: "6px 6px" }} />;
}
