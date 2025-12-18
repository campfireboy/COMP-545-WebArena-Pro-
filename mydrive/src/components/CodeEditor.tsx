"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { yCollab } from "y-codemirror.next";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { cpp } from "@codemirror/lang-cpp";
import { oneDark } from "@codemirror/theme-one-dark";
import { useSession } from "next-auth/react";

function stringToColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
}

type FileObject = {
    id: string;
    name: string;
    mimeType: string;
    size: number;
};

export default function CodeEditor({ fileId, initialFile }: { fileId: string, initialFile: FileObject }) {
    const { data: session } = useSession();
    const editorRef = useRef<HTMLDivElement>(null);
    const [language, setLanguage] = useState("Plain Text");
    const [status, setStatus] = useState<"saved" | "saving" | "modified">("saved");

    // Yjs Refs
    const ydocRef = useRef<Y.Doc>(new Y.Doc());

    const save = useCallback(async () => {
        if (!initialFile || !ydocRef.current) return;
        setStatus("saving");
        try {
            const content = ydocRef.current.getText("codemirror").toString();

            const presignRes = await fetch("/api/files/presign", {
                method: "POST",
                body: JSON.stringify({
                    name: initialFile.name,
                    size: new Blob([content]).size,
                    mimeType: initialFile.mimeType || "text/plain",
                    folderId: null
                })
            });
            if (!presignRes.ok) throw new Error("Failed to init upload");
            const { uploadUrl, s3Key } = await presignRes.json();

            await fetch(uploadUrl, {
                method: "PUT",
                body: content,
                headers: { "Content-Type": initialFile.mimeType || "text/plain" }
            });

            await fetch(`/api/files/${fileId}`, {
                method: "PATCH",
                body: JSON.stringify({ s3Key, size: new Blob([content]).size })
            });

            setStatus("saved");
        } catch (err) {
            console.error(err);
            setStatus("modified");
        }
    }, [initialFile, fileId]);

    // Autosave
    useEffect(() => {
        if (status === "modified") {
            const timer = setTimeout(() => save(), 5000);
            return () => clearTimeout(timer);
        }
    }, [status, save]);

    useEffect(() => {
        if (!session) return;

        let provider: WebsocketProvider | null = null;
        let persistence: IndexeddbPersistence | null = null;
        let view: EditorView | null = null;
        let canceled = false;

        const ydoc = ydocRef.current;
        const ytext = ydoc.getText("codemirror");

        async function init() {
            // Local Persistence
            try {
                persistence = new IndexeddbPersistence(fileId, ydoc);
                await persistence.whenSynced;
            } catch (e) {
                console.error("Persistence failed", e);
            }

            if (canceled) return;

            // WebSocket
            provider = new WebsocketProvider("ws://localhost:1234", fileId, ydoc);

            // Fetch initial if empty
            provider.on('synced', async (synced: any) => {
                if (synced && ytext.toString().length === 0) {
                    try {
                        const res = await fetch(`/api/files/${fileId}/download`);
                        if (res.ok) {
                            const txt = await res.text();
                            if (ytext.toString().length === 0 && !canceled) { // Check again
                                ydoc.transact(() => { ytext.insert(0, txt); });
                            }
                        }
                    } catch (e) { console.error("Failed to load initial content", e); }
                }
            });

            ydoc.on('update', () => setStatus("modified"));

            const userColor = session?.user?.id ? stringToColor(session.user.id) : '#f783ac';
            const userName = session?.user?.username || session?.user?.name || "User";

            // Awareness
            provider.awareness.setLocalStateField('user', {
                name: userName,
                color: userColor
            });

            const theme = EditorView.theme({
                "&": { height: "100%" },
                ".cm-scroller": { overflow: "auto" },
                ".cm-ySelectionInfo": {
                    padding: "2px 4px", position: "absolute", top: "-20px", left: "0", fontSize: "10px", color: "white", fontWeight: "bold", borderRadius: "4px", zIndex: 10, pointerEvents: "none", whiteSpace: "nowrap", backgroundColor: userColor
                }
            });

            const ext = initialFile.name.split('.').pop()?.toLowerCase();
            let langExtension: any = [];
            let langName = "Plain Text";

            if (ext === "js" || ext === "ts" || ext === "jsx" || ext === "tsx") { langExtension = javascript(); langName = "JavaScript"; }
            else if (ext === "py") { langExtension = python(); langName = "Python"; }
            else if (ext === "java") { langExtension = java(); langName = "Java"; }
            else if (ext === "html") { langExtension = html(); langName = "HTML"; }
            else if (ext === "css") { langExtension = css(); langName = "CSS"; }
            else if (ext === "c" || ext === "cpp" || ext === "h" || ext === "hpp") { langExtension = cpp(); langName = "C/C++"; }

            if (!canceled) {
                setLanguage(langName);

                const state = EditorState.create({
                    doc: ytext.toString(),
                    extensions: [
                        keymap.of([]),
                        EditorView.lineWrapping,
                        langExtension,
                        oneDark,
                        yCollab(ytext, provider.awareness),
                        theme
                    ]
                });

                if (editorRef.current) {
                    view = new EditorView({ state, parent: editorRef.current });
                }
            }
        }

        init();

        return () => {
            canceled = true;
            if (view) view.destroy();
            if (provider) provider.destroy();
            if (persistence) persistence.destroy();
        };
    }, [fileId, session, initialFile.name]);

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
            <style>{`
                .cm-ySelectionInfo { opacity: 0; transition: opacity 0.2s; }
                .cm-ySelection:hover .cm-ySelectionInfo { opacity: 1; }
            `}</style>
            <div style={{ marginBottom: 10, display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#666" }}>Code Editor ({language})</span>
                <span style={{ color: status === "modified" ? "#f59e0b" : status === "saved" ? "#10b981" : "#3b82f6", fontWeight: 500, fontSize: 12 }}>
                    {status === "modified" ? "Unsaved..." : status === "saved" ? "Saved" : "Saving..."}
                </span>
                <button onClick={save} disabled={status === "saving"} style={{ padding: "6px 12px", borderRadius: 4, background: "#1a73e8", color: "white", border: "none", cursor: "pointer", fontSize: 12 }}>
                    Save Now
                </button>
            </div>
            <div ref={editorRef} style={{ flex: 1, border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", background: "white", fontSize: 14 }} />
        </div>
    );
}
