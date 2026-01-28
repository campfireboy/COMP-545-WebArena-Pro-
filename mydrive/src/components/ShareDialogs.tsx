"use client";

import { useEffect, useRef, useState } from "react";
import { Users, X } from "lucide-react";

export type Share = {
    id: string;
    sharedWithUser: { email: string; name: string | null; username?: string | null } | null;
    permission: "READ" | "EDIT";
};

type ShareModalProps = {
    kind: "file" | "folder";
    id: string;
    name: string;
    onClose: () => void;
};

export function ShareModal({ kind, id, name, onClose }: ShareModalProps) {
    const [shares, setShares] = useState<Share[]>([]);
    const [loading, setLoading] = useState(true);
    const [shareEmail, setShareEmail] = useState("");
    const [sharePermission, setSharePermission] = useState<"READ" | "EDIT">("READ");
    const [error, setError] = useState("");

    const fetchShares = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/shares");
            if (res.ok) {
                const all = await res.json();
                // Filter client-side for simplicity, matching DriveView logic
                setShares(all.filter((s: any) => (kind === "file" ? s.fileId === id : s.folderId === id)));
            }
        } catch (e) {
            console.error(e);
            setError("Failed to load shares");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchShares();
    }, [kind, id]);

    const addShare = async () => {
        if (!shareEmail.trim()) return;
        setError("");
        try {
            const res = await fetch("/api/shares", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    [kind === "file" ? "fileId" : "folderId"]: id,
                    sharedWithEmail: shareEmail.trim(),
                    permission: sharePermission,
                }),
            });
            if (!res.ok) {
                const msg = await res.json().catch(() => ({}));
                setError(msg?.error || "Failed to share");
                return;
            }
            setShareEmail("");
            await fetchShares();
        } catch (e) {
            console.error(e);
            setError("Failed to share");
        }
    };

    const removeShare = async (shareId: string) => {
        try {
            const res = await fetch(`/api/shares/${shareId}`, { method: "DELETE" });
            if (res.ok) await fetchShares();
            else setError("Failed to remove share");
        } catch (e) {
            console.error(e);
            setError("Failed to remove share");
        }
    };

    const updateSharePermission = async (shareId: string, newPermission: string) => {
        try {
            const res = await fetch(`/api/shares/${shareId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permission: newPermission })
            });
            if (res.ok) await fetchShares();
            else setError("Failed to update permission");
        } catch (e) {
            console.error(e);
            setError("Failed to update permission");
        }
    };

    return (
        <div
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
            <div style={{ background: "white", padding: 24, borderRadius: 12, width: 500, maxWidth: "90%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ margin: 0 }}>Share "{name}"</h3>
                    <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer" }}>
                        <X size={20} />
                    </button>
                </div>

                {error && <div style={{ color: "red", marginBottom: 8 }}>{error}</div>}

                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    <input
                        data-testid="share-email-input"
                        placeholder="Username or email"
                        value={shareEmail}
                        onChange={e => setShareEmail(e.target.value)}
                        style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 8 }}
                    />
                    <select
                        data-testid="share-permission-select"
                        value={sharePermission}
                        onChange={(e) => setSharePermission(e.target.value as "READ" | "EDIT")}
                        style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, background: "white" }}
                    >
                        <option value="READ">Viewer</option>
                        <option value="EDIT">Editor</option>
                    </select>
                    <button
                        data-testid="share-add-button"
                        onClick={addShare}
                        style={{ padding: "8px 16px", background: "#1a73e8", color: "white", borderRadius: 8, border: "none", cursor: "pointer" }}
                    >
                        Share
                    </button>
                </div>

                <div>
                    <h4 style={{ marginBottom: 8 }}>People with access</h4>
                    {loading ? (
                        <div>Loading...</div>
                    ) : shares.length === 0 ? (
                        <div style={{ color: "#666", fontStyle: "italic" }}>Not shared with anyone</div>
                    ) : (
                        shares.map(s => (
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
                        ))
                    )}
                </div>

                <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                    <button
                        data-testid="share-done-button"
                        onClick={onClose}
                        style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer" }}
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

type SharePopoverProps = {
    kind: "file" | "folder";
    id: string;
    name: string;
    owner?: { id: string; name: string | null; email: string; username?: string | null };
    isOwned: boolean;
    targetRef: HTMLElement;
    onClose: () => void;
    onManageSharing: () => void;
};

export function SharedItemPopover({ kind, id, owner, isOwned, targetRef, onClose, onManageSharing }: SharePopoverProps) {
    const [shares, setShares] = useState<Share[]>([]);
    const [loading, setLoading] = useState(true);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/shares?${kind}Id=${id}`)
            .then((res) => res.json())
            .then((data) => {
                setShares(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [kind, id]);

    useEffect(() => {
        function onMouseDown(e: MouseEvent) {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                if (!targetRef.contains(e.target as Node)) {
                    onClose();
                }
            }
        }
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, [onClose, targetRef]);

    const rect = targetRef.getBoundingClientRect();
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
                    {isOwned
                        ? "Me (You)"
                        : owner?.username
                            ? owner.name ? `${owner.username} (${owner.name})` : owner.username
                            : owner?.name || owner?.email || "Unknown"}
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

            {isOwned && (
                <button
                    data-testid="manage-sharing-button"
                    onClick={onManageSharing}
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
}
