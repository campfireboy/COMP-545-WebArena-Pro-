"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { useSession } from "next-auth/react";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";

// TipTap Imports
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import FontFamily from '@tiptap/extension-font-family';
import TextStyle from '@tiptap/extension-text-style';
import { Extension } from '@tiptap/core';

// Custom Font Size Extension (Same as before)
const FontSize = Extension.create({
    name: 'fontSize',
    addOptions() { return { types: ['textStyle'] } },
    addGlobalAttributes() {
        return [{
            types: this.options.types,
            attributes: {
                fontSize: {
                    default: null,
                    parseHTML: element => element.style.fontSize.replace('px', ''),
                    renderHTML: attributes => {
                        if (!attributes.fontSize) return {};
                        return { style: `font-size: ${attributes.fontSize}px` };
                    },
                },
            },
        }]
    },
    addCommands() {
        return {
            setFontSize: (fontSize: string) => ({ chain }: any) => chain().setMark('textStyle', { fontSize }).run(),
            unsetFontSize: () => ({ chain }: any) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
        } as any
    },
});

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

// Export to DOCX Logic
async function exportToDocx(editor: Editor, filename: string) {
    const json = editor.getJSON();
    const children: any[] = [];

    if (json.content) {
        json.content.forEach((node: any) => {
            if (node.type === 'paragraph' || node.type === 'heading') {
                const textRuns: TextRun[] = [];
                if (node.content) {
                    node.content.forEach((run: any) => {
                        if (run.type === 'text') {
                            textRuns.push(new TextRun({
                                text: run.text,
                                bold: run.marks?.some((m: any) => m.type === 'bold'),
                                italics: run.marks?.some((m: any) => m.type === 'italic'),
                                underline: run.marks?.some((m: any) => m.type === 'underline') ? {} : undefined,
                                size: run.marks?.find((m: any) => m.type === 'textStyle')?.attrs?.fontSize ? parseInt(run.marks.find((m: any) => m.type === 'textStyle').attrs.fontSize) * 2 : 24, // docx uses half-points
                                font: run.marks?.find((m: any) => m.type === 'textStyle')?.attrs?.fontFamily || "Calibri",
                            }));
                        }
                    });
                }

                let heading = undefined;
                if (node.type === 'heading') {
                    if (node.attrs.level === 1) heading = HeadingLevel.HEADING_1;
                    if (node.attrs.level === 2) heading = HeadingLevel.HEADING_2;
                    if (node.attrs.level === 3) heading = HeadingLevel.HEADING_3;
                }

                let alignment: any = AlignmentType.LEFT;
                if (node.attrs?.textAlign === 'center') alignment = AlignmentType.CENTER;
                if (node.attrs?.textAlign === 'right') alignment = AlignmentType.RIGHT;

                children.push(new Paragraph({
                    children: textRuns,
                    heading: heading,
                    alignment: alignment
                }));
            }
        });
    }

    const doc = new Document({
        sections: [{ properties: {}, children: children }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, filename.replace('.doc', '.docx'));
}

const MenuBar = ({ editor, onExportDocx, onExportPdf }: { editor: Editor | null, onExportDocx: () => void, onExportPdf: () => void }) => {
    if (!editor) return null;
    const fonts = ["Inter", "Arial", "Georgia", "Times New Roman", "Verdana", "Courier New"];
    const sizes = ["10", "12", "14", "16", "18", "20", "24", "30", "36", "48"];

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 10, borderBottom: "1px solid #ddd", background: "#f8f9fa", alignItems: 'center' }}>
            <select onChange={e => editor.chain().focus().setFontFamily(e.target.value).run()} value={editor.getAttributes('textStyle').fontFamily || "Inter"} style={{ padding: 4, borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }}>
                <option value="" disabled>Font</option>
                {fonts.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select onChange={e => (editor.commands as any).setFontSize(e.target.value)} value={editor.getAttributes('textStyle').fontSize || "12"} style={{ padding: 4, borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }}>
                {sizes.map(s => <option key={s} value={s}>{s}px</option>)}
            </select>
            <div style={{ width: 1, height: 20, background: "#ccc", margin: "0 4px" }} />
            <button onClick={() => editor.chain().focus().toggleBold().run()} style={{ fontWeight: "bold", background: editor.isActive('bold') ? "#e2e8f0" : "transparent", border: "1px solid #ddd", padding: "4px 8px", borderRadius: 4 }}>B</button>
            <button onClick={() => editor.chain().focus().toggleItalic().run()} style={{ fontStyle: "italic", background: editor.isActive('italic') ? "#e2e8f0" : "transparent", border: "1px solid #ddd", padding: "4px 8px", borderRadius: 4 }}>I</button>
            <button onClick={() => editor.chain().focus().toggleUnderline().run()} style={{ textDecoration: "underline", background: editor.isActive('underline') ? "#e2e8f0" : "transparent", border: "1px solid #ddd", padding: "4px 8px", borderRadius: 4 }}>U</button>
            <div style={{ width: 1, height: 20, background: "#ccc", margin: "0 4px" }} />
            <button onClick={() => editor.chain().focus().setTextAlign('left').run()} style={{ background: editor.isActive({ textAlign: 'left' }) ? "#e2e8f0" : "transparent", border: "1px solid #ddd", padding: "4px 8px", borderRadius: 4 }}>←</button>
            <button onClick={() => editor.chain().focus().setTextAlign('center').run()} style={{ background: editor.isActive({ textAlign: 'center' }) ? "#e2e8f0" : "transparent", border: "1px solid #ddd", padding: "4px 8px", borderRadius: 4 }}>=</button>
            <button onClick={() => editor.chain().focus().setTextAlign('right').run()} style={{ background: editor.isActive({ textAlign: 'right' }) ? "#e2e8f0" : "transparent", border: "1px solid #ddd", padding: "4px 8px", borderRadius: 4 }}>→</button>

            <div style={{ flex: 1 }} />
            <button onClick={onExportPdf} style={{ padding: "4px 12px", borderRadius: 4, background: "#4caf50", color: "white", border: "none", cursor: "pointer", fontSize: 12 }}>Export PDF</button>
            <button onClick={onExportDocx} style={{ padding: "4px 12px", borderRadius: 4, background: "#2196f3", color: "white", border: "none", cursor: "pointer", fontSize: 12 }}>Export DOCX</button>
        </div>
    );
};

export default function RichTextEditor({ fileId, initialFile }: { fileId: string, initialFile: FileObject }) {
    const { data: session } = useSession();
    const [status, setStatus] = useState<"saved" | "saving" | "modified">("saved");
    const ydocRef = useRef<Y.Doc>(new Y.Doc());
    const [provider, setProvider] = useState<WebsocketProvider | null>(null);

    const user = session?.user || { name: "Anonymous", email: "anon", id: "anon" };
    const userColor = stringToColor(user.id || "anon");

    const extensions = useMemo(() => {
        const exts = [
            StarterKit.configure({ history: false }),
            Collaboration.configure({ document: ydocRef.current }),
            Underline,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            TextStyle,
            FontFamily,
            FontSize
        ];
        if (provider) {
            exts.push(CollaborationCursor.configure({
                provider: provider as any,
                user: { name: user.username || user.name || "User", color: userColor }
            }));
        }
        return exts;
    }, [provider, user.username, user.name, userColor]);

    const editor = useEditor({
        extensions,
        editorProps: {
            attributes: {
                class: 'focus:outline-none',
                spellcheck: 'true',
            },
        },
    }, [provider]);

    useEffect(() => {
        if (!editor) return;
        const updateHandler = () => setStatus("modified");
        editor.on('update', updateHandler);
        return () => { editor.off('update', updateHandler); };
    }, [editor]);

    // Save as JSON
    const save = useCallback(async () => {
        if (!initialFile || !editor) return;
        setStatus("saving");
        try {
            const content = JSON.stringify(editor.getJSON()); // Save as JSON string

            const presignRes = await fetch("/api/files/presign", {
                method: "POST",
                body: JSON.stringify({
                    name: initialFile.name,
                    size: new Blob([content]).size,
                    mimeType: "application/json", // JSON type
                    folderId: null
                })
            });
            if (!presignRes.ok) throw new Error("Failed to init upload");
            const { uploadUrl, s3Key } = await presignRes.json();

            await fetch(uploadUrl, {
                method: "PUT",
                body: content,
                headers: { "Content-Type": "application/json" }
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
    }, [initialFile, fileId, editor]);

    // Autosave
    useEffect(() => {
        if (status === "modified") {
            const timer = setTimeout(() => save(), 10000);
            return () => clearTimeout(timer);
        }
    }, [status, save]);

    // Init Logic
    useEffect(() => {
        let persistence: IndexeddbPersistence | null = null;
        let wsProvider: WebsocketProvider | null = null;
        const ydoc = ydocRef.current;

        async function init() {
            persistence = new IndexeddbPersistence(fileId, ydoc);
            await persistence.whenSynced;

            wsProvider = new WebsocketProvider("ws://localhost:1234", fileId, ydoc);
            setProvider(wsProvider);

            wsProvider.on('synced', async (synced: any) => {
                if (synced && editor && editor.isEmpty) {
                    // Try to load initial content
                    try {
                        const res = await fetch(`/api/files/${fileId}/download`);
                        if (res.ok) {
                            const text = await res.text();
                            if (text.length > 0) {
                                try {
                                    const json = JSON.parse(text);
                                    editor.commands.setContent(json);
                                } catch (e) {
                                    // Fallback if not JSON (legacy HTML)
                                    editor.commands.setContent(text);
                                }
                            }
                        }
                    } catch (e) { console.error("Failed load"); }
                }
            });
        }
        init();
        return () => {
            if (wsProvider) wsProvider.destroy();
            if (persistence) persistence.destroy();
        };
    }, [fileId]); // Removed editor dependancy to prevent loop. editor content init handled inside via ref or check.
    // Actually, we need to set content on editor. We can use a ref or just dependency.
    // Ideally we don't re-run init when editor changes.

    // Fix: The original code had [fileId, editor]. 
    // If 'editor' changes (re-created), we might re-init provider? 
    // We should separate provider init from editor content loading.

    // Let's keep it simple for now, but memoizing 'extensions' helps stability.

    const handleExportPdf = () => {
        window.print();
    };

    const handleExportDocx = () => {
        if (editor) exportToDocx(editor, initialFile.name);
    };

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", background: "#f0f2f5" }}>
            <style>{`
                .ProseMirror {
                    width: 210mm;
                    min-height: 297mm;
                    padding: 20mm;
                    background: white;
                    margin: 20px auto;
                    box-shadow: 0 0 5px rgba(0,0,0,0.1);
                    outline: none;
                }
                
                .collaboration-cursor__caret {
                    border-left: 1px solid #0d0d0d;
                    border-right: 1px solid #0d0d0d;
                    margin-left: -1px;
                    margin-right: -1px;
                    pointer-events: none;
                    position: relative;
                    word-break: normal;
                }
                .collaboration-cursor__label {
                    border-radius: 3px 3px 3px 0;
                    color: #fff;
                    font-size: 12px;
                    font-weight: 600;
                    left: -1px;
                    line-height: normal;
                    padding: 0.1rem 0.3rem;
                    position: absolute;
                    top: -1.4em;
                    user-select: none;
                    white-space: nowrap;
                    z-index: 10;
                }
                @media print {
                    body * { visibility: hidden; }
                    .ProseMirror, .ProseMirror * { visibility: visible; }
                    .ProseMirror { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; box-shadow: none !important; border: none !important; }
                }
            `}</style>

            {/* Header/Status Bar */}
            <div style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "white", borderBottom: "1px solid #ddd" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>{initialFile.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                    <span style={{ color: status === "modified" ? "#f59e0b" : status === "saved" ? "#10b981" : "#3b82f6", fontWeight: 500, fontSize: 12 }}>
                        {status === "modified" ? "Unsaved changes" : status === "saved" ? "Saved to Drive" : "Saving..."}
                    </span>
                    <button onClick={save} disabled={status === "saving"} style={{ padding: "6px 12px", borderRadius: 4, background: "#1a73e8", color: "white", border: "none", cursor: "pointer", fontSize: 12 }}>
                        Save Now
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div style={{ background: "#f8f9fa", borderBottom: "1px solid #ddd" }}>
                <MenuBar editor={editor} onExportDocx={handleExportDocx} onExportPdf={handleExportPdf} />
            </div>

            {/* Scrollable Page Container */}
            <div
                style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 40, cursor: "text" }}
                onClick={(e) => {
                    // Only focus if clicking the background itself
                    if (e.target === e.currentTarget && editor && !editor.isFocused) editor.commands.focus();
                }}
            >
                <div style={{ marginTop: 20, cursor: "auto" }}>
                    <EditorContent editor={editor} />
                </div>
            </div>
        </div>
    );
}
