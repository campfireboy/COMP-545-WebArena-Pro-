"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { useSession } from "next-auth/react";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";

// @ts-ignore
import * as mammoth from "mammoth/mammoth.browser";

// TipTap Imports
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import TextStyle from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Extension, Node as TiptapNode } from '@tiptap/core';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
const FontSize = Extension.create({
    name: 'fontSize',
    addOptions() { return { types: ['textStyle'] } },
    addGlobalAttributes() {
        return [{
            types: this.options.types,
            attributes: {
                fontSize: {
                    default: null,
                    parseHTML: element => element.style.fontSize?.replace('px', '') || null,
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
            setFontSize: (fontSize: string) => ({ commands }: any) => {
                return commands.setMark('textStyle', { fontSize });
            },
            unsetFontSize: () => ({ chain }: any) => {
                return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
            },
        } as any
    },
});

const CustomFontFamily = Extension.create({
    name: 'customFontFamily',
    addOptions() { return { types: ['textStyle'] } },
    addGlobalAttributes() {
        return [{
            types: this.options.types,
            attributes: {
                fontFamily: {
                    default: null,
                    parseHTML: element => element.style.fontFamily || null,
                    renderHTML: attributes => {
                        if (!attributes.fontFamily) return {};
                        return { style: `font-family: ${attributes.fontFamily}` };
                    },
                },
            },
        }]
    },
    addCommands() {
        return {
            setFontFamily: (fontFamily: string) => ({ commands }: any) => {
                return commands.setMark('textStyle', { fontFamily });
            },
            unsetFontFamily: () => ({ chain }: any) => {
                return chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run();
            },
        } as any
    },
});

const PageBreak = TiptapNode.create({
    name: 'pageBreak',
    group: 'block',
    parseHTML() { return [{ tag: 'div[data-page-break]' }] },
    renderHTML() { return ['div', { 'data-page-break': '', style: 'page-break-after: always; border-bottom: 2px dashed #ccc; margin: 20px 0; height: 0;' }] },
    addCommands() {
        return {
            setPageBreak: () => ({ commands }: any) => commands.insertContent({ type: this.name }),
        } as any
    },
});

const Indent = Extension.create({
    name: 'indent',
    addGlobalAttributes() {
        return [{
            types: ['paragraph', 'heading'],
            attributes: {
                indent: {
                    default: 0,
                    parseHTML: (element: any) => parseInt(element.style.marginLeft || '0') / 40 || 0,
                    renderHTML: (attributes: any) => {
                        if (!attributes.indent) return {};
                        return { style: `margin-left: ${attributes.indent * 40}px` };
                    },
                },
            },
        }]
    },
    addCommands() {
        return {
            indent: () => ({ tr, state, dispatch }: any) => {
                const { from, to } = state.selection;
                state.doc.nodesBetween(from, to, (node: any, pos: number) => {
                    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
                        const current = node.attrs.indent || 0;
                        tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: Math.min(current + 1, 10) });
                    }
                });
                if (dispatch) dispatch(tr);
                return true;
            },
            outdent: () => ({ tr, state, dispatch }: any) => {
                const { from, to } = state.selection;
                state.doc.nodesBetween(from, to, (node: any, pos: number) => {
                    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
                        const current = node.attrs.indent || 0;
                        tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: Math.max(current - 1, 0) });
                    }
                });
                if (dispatch) dispatch(tr);
                return true;
            },
        } as any
    },
    addKeyboardShortcuts() {
        return {
            'Tab': () => {
                if (this.editor.isActive('listItem')) {
                    return this.editor.chain().sinkListItem('listItem').run();
                }
                // Insert a tab character at cursor position
                return this.editor.chain().focus().insertContent('\t').run();
            },
            'Shift-Tab': () => {
                if (this.editor.isActive('listItem')) {
                    return this.editor.chain().liftListItem('listItem').run();
                }
                return (this.editor.commands as any).outdent();
            },
        }
    },
});

const ResizableImageExtension = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: { default: null, parseHTML: (el: any) => el.getAttribute('width') || el.style.width?.replace('px', '') || null, renderHTML: (attrs: any) => attrs.width ? { width: attrs.width, style: `width: ${attrs.width}px` } : {} },
            height: { default: null, parseHTML: (el: any) => el.getAttribute('height') || el.style.height?.replace('px', '') || null, renderHTML: (attrs: any) => attrs.height ? { height: attrs.height, style: `height: ${attrs.height}px` } : {} },
            display: { default: 'inline', parseHTML: (el: any) => el.getAttribute('data-display') || 'inline', renderHTML: (attrs: any) => ({ 'data-display': attrs.display }) },
        }
    },
    addNodeView() {
        return ({ node, getPos, editor }) => {
            const wrapper = document.createElement('span');
            wrapper.style.display = 'inline-block';
            wrapper.style.position = 'relative';
            wrapper.style.lineHeight = '0';
            wrapper.classList.add('image-node-wrapper');

            const img = document.createElement('img');
            img.src = node.attrs.src;
            if (node.attrs.alt) img.alt = node.attrs.alt;
            if (node.attrs.title) img.title = node.attrs.title;
            if (node.attrs.width) { img.style.width = node.attrs.width + 'px'; img.setAttribute('width', node.attrs.width); }
            if (node.attrs.height) { img.style.height = node.attrs.height + 'px'; img.setAttribute('height', node.attrs.height); }
            img.style.maxWidth = '100%';
            img.style.cursor = 'pointer';
            img.style.display = 'block';
            img.setAttribute('draggable', 'false');
            if (node.attrs.display) img.setAttribute('data-display', node.attrs.display);
            wrapper.appendChild(img);

            let selected = false;
            const handles: HTMLDivElement[] = [];
            const handlePositions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

            const createHandles = () => {
                handles.forEach(h => h.remove());
                handles.length = 0;
                handlePositions.forEach(pos => {
                    const h = document.createElement('div');
                    h.className = 'img-resize-handle img-resize-' + pos;
                    h.setAttribute('data-handle', pos);
                    wrapper.appendChild(h);
                    handles.push(h);

                    let startX = 0, startY = 0, startW = 0, startH = 0;
                    h.addEventListener('mousedown', (e: MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startX = e.clientX;
                        startY = e.clientY;
                        startW = img.offsetWidth;
                        startH = img.offsetHeight;
                        const onMove = (ev: MouseEvent) => {
                            const dx = ev.clientX - startX;
                            const dy = ev.clientY - startY;
                            let newW = startW, newH = startH;
                            if (pos.includes('e')) newW = Math.max(20, startW + dx);
                            if (pos.includes('w')) newW = Math.max(20, startW - dx);
                            if (pos.includes('s')) newH = Math.max(20, startH + dy);
                            if (pos.includes('n')) newH = Math.max(20, startH - dy);
                            if (pos === 'n' || pos === 's') newW = startW;
                            if (pos === 'e' || pos === 'w') newH = startH;
                            img.style.width = newW + 'px';
                            img.style.height = newH + 'px';
                        };
                        const onUp = () => {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                            const p = typeof getPos === 'function' ? getPos() : undefined;
                            if (p !== undefined) {
                                editor.chain().focus().setNodeSelection(p).updateAttributes('image', {
                                    width: Math.round(img.offsetWidth),
                                    height: Math.round(img.offsetHeight)
                                }).run();
                            }
                        };
                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                    });
                });
            };

            const showHandles = () => { if (!selected) { selected = true; createHandles(); wrapper.classList.add('img-selected'); } };
            const hideHandles = () => { selected = false; handles.forEach(h => h.remove()); handles.length = 0; wrapper.classList.remove('img-selected'); };

            img.addEventListener('click', (e) => {
                e.stopPropagation();
                const p = typeof getPos === 'function' ? getPos() : undefined;
                if (p !== undefined) editor.chain().focus().setNodeSelection(p).run();
                showHandles();
            });

            // Drag support via mousedown+hold
            let dragTimeout: any = null;
            img.addEventListener('mousedown', (e: MouseEvent) => {
                if (e.button !== 0) return; // only left button
                const startDragX = e.clientX, startDragY = e.clientY;
                dragTimeout = setTimeout(() => {
                    // Start drag
                    img.style.opacity = '0.6';
                    const ghost = document.createElement('div');
                    ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;border:2px dashed #3b82f6;background:rgba(59,130,246,0.1);';
                    ghost.style.width = img.offsetWidth + 'px';
                    ghost.style.height = img.offsetHeight + 'px';
                    ghost.style.left = e.clientX + 'px';
                    ghost.style.top = e.clientY + 'px';
                    document.body.appendChild(ghost);
                    const onDragMove = (ev: MouseEvent) => {
                        ghost.style.left = (ev.clientX - img.offsetWidth / 2) + 'px';
                        ghost.style.top = (ev.clientY - img.offsetHeight / 2) + 'px';
                    };
                    const onDragEnd = (ev: MouseEvent) => {
                        document.removeEventListener('mousemove', onDragMove);
                        document.removeEventListener('mouseup', onDragEnd);
                        ghost.remove();
                        img.style.opacity = '1';
                        // Find drop position in editor
                        const pos = editor.view.posAtCoords({ left: ev.clientX, top: ev.clientY });
                        if (pos) {
                            const currentPos = typeof getPos === 'function' ? getPos() : undefined;
                            if (currentPos !== undefined) {
                                const nodeSize = node.nodeSize;
                                // Delete from old position and insert at new position
                                editor.chain().focus()
                                    .deleteRange({ from: currentPos, to: currentPos + nodeSize })
                                    .run();
                                // Adjust position if we deleted before the target
                                let insertPos = pos.pos;
                                if (currentPos < pos.pos) insertPos -= nodeSize;
                                insertPos = Math.max(0, Math.min(insertPos, editor.state.doc.content.size));
                                editor.chain().focus().insertContentAt(insertPos, {
                                    type: 'image',
                                    attrs: node.attrs
                                }).run();
                            }
                        }
                    };
                    document.addEventListener('mousemove', onDragMove);
                    document.addEventListener('mouseup', onDragEnd);
                }, 200);
            });
            img.addEventListener('mouseup', () => { if (dragTimeout) clearTimeout(dragTimeout); });
            img.addEventListener('mouseleave', () => { if (dragTimeout) clearTimeout(dragTimeout); });

            // Click outside handler
            const outsideClick = (e: MouseEvent) => {
                if (!wrapper.contains(e.target as Node)) hideHandles();
            };
            document.addEventListener('click', outsideClick);

            return {
                dom: wrapper,
                update(updatedNode: any) {
                    if (updatedNode.type.name !== 'image') return false;
                    img.src = updatedNode.attrs.src;
                    if (updatedNode.attrs.alt) img.alt = updatedNode.attrs.alt;
                    if (updatedNode.attrs.width) { img.style.width = updatedNode.attrs.width + 'px'; } else { img.style.width = ''; }
                    if (updatedNode.attrs.height) { img.style.height = updatedNode.attrs.height + 'px'; } else { img.style.height = ''; }
                    if (updatedNode.attrs.display) img.setAttribute('data-display', updatedNode.attrs.display);
                    return true;
                },
                selectNode() { showHandles(); },
                deselectNode() { hideHandles(); },
                destroy() { document.removeEventListener('click', outsideClick); }
            };
        };
    }
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
                                size: run.marks?.find((m: any) => m.type === 'textStyle')?.attrs?.fontSize ? parseInt(run.marks.find((m: any) => m.type === 'textStyle').attrs.fontSize) * 2 : 22, // docx uses half-points
                                font: run.marks?.find((m: any) => m.type === 'textStyle')?.attrs?.fontFamily || "Times New Roman",
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

function getActiveFontFamily(editor: Editor) {
    if (editor.state.selection.empty) {
        return editor.getAttributes('textStyle').fontFamily || "Times New Roman";
    }

    let hasOther = false;
    let foundFont: string | null = null;
    editor.state.doc.nodesBetween(editor.state.selection.from, editor.state.selection.to, (node) => {
        if (!node.isText) return;
        const font = node.marks.find(m => m.type.name === 'textStyle')?.attrs.fontFamily || "Times New Roman";
        if (foundFont === null) foundFont = font;
        else if (foundFont !== font) hasOther = true;
    });

    if (hasOther || !foundFont) return "";
    return foundFont;
}

function getActiveFontSize(editor: Editor) {
    if (editor.state.selection.empty) {
        return editor.getAttributes('textStyle').fontSize || "11";
    }

    let hasOther = false;
    let foundSize: string | null = null;
    editor.state.doc.nodesBetween(editor.state.selection.from, editor.state.selection.to, (node) => {
        if (!node.isText) return;
        const size = node.marks.find(m => m.type.name === 'textStyle')?.attrs.fontSize || "11";
        if (foundSize === null) foundSize = size;
        else if (foundSize !== size) hasOther = true;
    });

    if (hasOther || !foundSize) return "";
    return foundSize;
}

const CustomFontFamilyDropdown = ({ editor, currentFont }: { editor: Editor, currentFont: string }) => {
    const fonts = ["Inter", "Arial", "Georgia", "Times New Roman", "Verdana", "Courier New"];
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const listener = (event: MouseEvent | TouchEvent) => {
            if (!ref.current || ref.current.contains(event.target as Node)) return;
            setIsOpen(false);
        };
        document.addEventListener("mousedown", listener);
        document.addEventListener("touchstart", listener);
        return () => {
            document.removeEventListener("mousedown", listener);
            document.removeEventListener("touchstart", listener);
        };
    }, [ref]);

    const handleSelect = (font: string) => {
        (editor.commands as any).setFontFamily(font);
        setIsOpen(false);
    };

    return (
        <div ref={ref} style={{ position: 'relative', width: 140 }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                onMouseDown={(e) => e.preventDefault()}
                style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13, background: "white", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minHeight: 15 }}>{currentFont}</span>
                <span style={{ fontSize: 10, marginLeft: 4, color: "#666" }}>▼</span>
            </div>
            {isOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'white', border: '1px solid #ddd', borderRadius: 4, marginTop: 4, zIndex: 100, maxHeight: 200, overflowY: 'auto', boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
                    {fonts.map(f => (
                        <div
                            key={f}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelect(f)}
                            style={{ padding: "6px 8px", fontSize: 13, cursor: "pointer", fontFamily: f }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#f0f0f0")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                            {f}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const FontSizeDropdown = ({ editor, currentSize }: { editor: Editor, currentSize: string }) => {
    const sizes = ["10", "11", "12", "14", "16", "18", "20", "24", "30", "36", "48", "60", "72"];
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const listener = (event: MouseEvent | TouchEvent) => {
            if (!ref.current || ref.current.contains(event.target as Node)) return;
            setIsOpen(false);
        };
        document.addEventListener("mousedown", listener);
        document.addEventListener("touchstart", listener);
        return () => {
            document.removeEventListener("mousedown", listener);
            document.removeEventListener("touchstart", listener);
        };
    }, [ref]);

    const handleSelectOption = (size: string) => {
        (editor.commands as any).setFontSize(size);
        setIsOpen(false);
    };

    return (
        <div ref={ref} style={{ position: 'relative', width: 65 }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                onMouseDown={(e) => e.preventDefault()}
                style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13, background: "white", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
                <span>{currentSize}</span>
                <span style={{ fontSize: 10, marginLeft: 4, color: "#666" }}>▼</span>
            </div>
            {isOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'white', border: '1px solid #ddd', borderRadius: 4, marginTop: 4, zIndex: 100, maxHeight: 200, overflowY: 'auto', boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
                    {sizes.map(s => (
                        <div
                            key={s}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectOption(s);
                            }}
                            style={{ padding: "6px 8px", fontSize: 13, cursor: "pointer", background: s === currentSize ? "#e2e8f0" : "transparent" }}
                            onMouseEnter={e => (e.currentTarget.style.background = s === currentSize ? "#e2e8f0" : "#f0f0f0")}
                            onMouseLeave={e => (e.currentTarget.style.background = s === currentSize ? "#e2e8f0" : "transparent")}
                        >
                            {s}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// MenuBar is now inlined directly in RichTextEditor below

export default function RichTextEditor({ fileId, initialFile }: { fileId: string, initialFile: FileObject }) {
    const { data: session } = useSession();
    const [status, setStatus] = useState<"saved" | "saving" | "modified">("saved");
    const ydocRef = useRef<Y.Doc>(new Y.Doc());
    const [provider, setProvider] = useState<WebsocketProvider | null>(null);

    const user = session?.user || { name: "Anonymous", email: "anon", id: "anon" };
    const [userColor] = useState(stringToColor(user.id || "anon"));
    const [, forceUpdate] = useState(0);

    // UI state for new features
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [showTextColor, setShowTextColor] = useState(false);
    const [showHighlightColor, setShowHighlightColor] = useState(false);
    const [showTablePicker, setShowTablePicker] = useState(false);
    const [tableHover, setTableHover] = useState({ rows: 0, cols: 0 });
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'text' | 'image' } | null>(null);
    const [showImageSizeModal, setShowImageSizeModal] = useState(false);
    const [imageSizeInches, setImageSizeInches] = useState({ w: '3', h: '2' });
    const [margins, setMargins] = useState({ top: 20, right: 20, bottom: 20, left: 20 }); // mm
    const [showMarginModal, setShowMarginModal] = useState(false);
    const [showImageSourcePicker, setShowImageSourcePicker] = useState(false);
    const [showDriveImagePicker, setShowDriveImagePicker] = useState(false);
    const [driveImages, setDriveImages] = useState<{ id: string; name: string; mimeType: string }[]>([]);
    const [driveFolders, setDriveFolders] = useState<{ id: string; name: string }[]>([]);
    const [driveBreadcrumbs, setDriveBreadcrumbs] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'My Drive' }]);
    const [driveImagesLoading, setDriveImagesLoading] = useState(false);
    const [showCropModal, setShowCropModal] = useState(false);
    const [cropImageSrc, setCropImageSrc] = useState('');
    const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 100, h: 100 });
    const [cropImgDims, setCropImgDims] = useState({ natW: 0, natH: 0, dispW: 0, dispH: 0 });
    const [cropDragging, setCropDragging] = useState<string | null>(null);
    const [cropStart, setCropStart] = useState({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 });
    const cropCanvasRef = useRef<HTMLCanvasElement>(null);
    const textColorRef = useRef<HTMLDivElement>(null);
    const highlightColorRef = useRef<HTMLDivElement>(null);
    const tablePickerRef = useRef<HTMLDivElement>(null);
    const PRESET_COLORS = ['#000000', '#434343', '#666666', '#999999', '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6', '#E91E63'];

    const extensions = useMemo(() => {
        const exts = [
            StarterKit.configure({ history: false }),
            Collaboration.configure({ document: ydocRef.current }),
            Underline,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            TextStyle,
            CustomFontFamily,
            FontSize,
            Color,
            Highlight.configure({ multicolor: true }),
            Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: 'editor-link' } }),
            Table.configure({ resizable: true }),
            TableRow,
            TableCell,
            TableHeader,
            ResizableImageExtension.configure({ inline: true, allowBase64: true }),
            PageBreak,
            Indent
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
        const transactionHandler = () => forceUpdate(n => n + 1);

        editor.on('update', updateHandler);
        editor.on('transaction', transactionHandler);

        return () => {
            editor.off('update', updateHandler);
            editor.off('transaction', transactionHandler);
        };
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

    const editorRef = useRef<Editor | null>(null);
    useEffect(() => { editorRef.current = editor; }, [editor]);

    // Init Logic
    useEffect(() => {
        let persistence: IndexeddbPersistence | null = null;
        let wsProvider: WebsocketProvider | null = null;
        const ydoc = ydocRef.current;

        async function init() {
            persistence = new IndexeddbPersistence(fileId, ydoc);
            await persistence.whenSynced;

            const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const wsUrl = `${wsProtocol}//${window.location.host}/api/ws`;
            wsProvider = new WebsocketProvider(wsUrl, fileId, ydoc);
            setProvider(wsProvider);

            wsProvider.on('synced', async (synced: any) => {
                const currentEditor = editorRef.current;
                if (synced && currentEditor && currentEditor.isEmpty) {
                    // Try to load initial content
                    try {
                        const res = await fetch(`/api/files/${fileId}/download`);
                        if (res.ok) {
                            const arrayBuffer = await res.arrayBuffer();
                            const text = new TextDecoder().decode(arrayBuffer);

                            if (arrayBuffer.byteLength > 0) {
                                let loaded = false;
                                try {
                                    // Try JSON first (if it was previously saved by this editor)
                                    const json = JSON.parse(text);
                                    currentEditor.commands.setContent(json);
                                    loaded = true;
                                } catch (e) {
                                    // Not JSON
                                    const isWord = initialFile.name.endsWith('.doc') || initialFile.name.endsWith('.docx');
                                    console.log("Is Word DOC?:", isWord, "File name:", initialFile.name, "Buffer:", arrayBuffer.byteLength);
                                    if (isWord) {
                                        try {
                                            // Handle varying ESM/CommonJS imports for mammoth browser build
                                            const convertFn = mammoth.convertToHtml || (mammoth as any).default?.convertToHtml;
                                            if (!convertFn) {
                                                console.error("Mammoth convertToHtml function not found on imported object", mammoth);
                                            } else {
                                                console.log("Calling Mammoth convertToHtml...");
                                                const result = await convertFn({ arrayBuffer });
                                                console.log("Mammoth Result Length:", result.value.length, "Result preview:", result.value.substring(0, 50));
                                                currentEditor.commands.setContent(result.value);
                                                loaded = true;
                                            }
                                        } catch (mammothErr) {
                                            console.error("Mammoth conversion failed:", mammothErr);
                                        }
                                    }
                                    if (!loaded) {
                                        // Fallback legacy HTML / Text
                                        currentEditor.commands.setContent(text);
                                    }
                                }
                            }
                        }
                    } catch (e) { console.error("Failed load", e); }
                }
            });
        }
        init();
        return () => {
            if (wsProvider) wsProvider.destroy();
            if (persistence) persistence.destroy();
        };
    }, [fileId]);
    // If 'editor' changes (re-created), we might re-init provider? 
    // We should separate provider init from editor content loading.

    // Let's keep it simple for now, but memoizing 'extensions' helps stability.

    const handleExportPdf = () => {
        window.print();
    };

    const handleExportDocx = () => {
        if (editor) exportToDocx(editor, initialFile.name);
    };

    const handleInsertImage = () => {
        setShowImageSourcePicker(true);
    };

    const handleInsertFromComputer = () => {
        setShowImageSourcePicker(false);
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (!file || !editor) return;
            const reader = new FileReader();
            reader.onload = () => {
                editor.chain().focus().setImage({ src: reader.result as string }).run();
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    const loadDriveFolder = async (parentId: string | null) => {
        setDriveImagesLoading(true);
        try {
            const url = parentId ? `/api/folders?parentId=${parentId}` : '/api/folders';
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                const imgs = (data.files || []).filter((f: any) => f.mimeType?.startsWith('image/'));
                setDriveImages(imgs);
                setDriveFolders(data.folders || []);
            }
        } catch (err) { console.error(err); }
        setDriveImagesLoading(false);
    };

    const handleInsertFromDrive = async () => {
        setShowImageSourcePicker(false);
        setShowDriveImagePicker(true);
        setDriveBreadcrumbs([{ id: null, name: 'My Drive' }]);
        await loadDriveFolder(null);
    };

    const handleDriveFolderClick = async (folder: { id: string; name: string }) => {
        setDriveBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
        await loadDriveFolder(folder.id);
    };

    const handleDriveBreadcrumbClick = async (index: number) => {
        const crumb = driveBreadcrumbs[index];
        setDriveBreadcrumbs(prev => prev.slice(0, index + 1));
        await loadDriveFolder(crumb.id);
    };

    const handlePickDriveImage = (img: { id: string; name: string }) => {
        if (!editor) return;
        editor.chain().focus().setImage({ src: `/api/files/${img.id}/download`, alt: img.name }).run();
        setShowDriveImagePicker(false);
    };

    const openCropModal = () => {
        if (!editor) return;
        const { node } = (editor.state.selection as any);
        if (!node || node.type.name !== 'image') return;
        const src = node.attrs.src;
        setCropImageSrc(src);
        setContextMenu(null);
        setShowCropModal(true);
    };

    const handleCropMouseDown = (handle: string, e: React.MouseEvent) => {
        e.preventDefault();
        setCropDragging(handle);
        setCropStart({ mx: e.clientX, my: e.clientY, x: cropRect.x, y: cropRect.y, w: cropRect.w, h: cropRect.h });
    };

    const handleCropMouseMove = (e: React.MouseEvent) => {
        if (!cropDragging) return;
        const dx = e.clientX - cropStart.mx;
        const dy = e.clientY - cropStart.my;
        const maxW = cropImgDims.dispW;
        const maxH = cropImgDims.dispH;
        if (cropDragging === 'move') {
            setCropRect({ ...cropRect, x: Math.max(0, Math.min(maxW - cropRect.w, cropStart.x + dx)), y: Math.max(0, Math.min(maxH - cropRect.h, cropStart.y + dy)) });
        } else if (cropDragging === 'se') {
            setCropRect({ ...cropRect, w: Math.max(20, Math.min(maxW - cropRect.x, cropStart.w + dx)), h: Math.max(20, Math.min(maxH - cropRect.y, cropStart.h + dy)) });
        } else if (cropDragging === 'sw') {
            const newW = Math.max(20, cropStart.w - dx);
            const newX = Math.max(0, cropStart.x + cropStart.w - newW);
            setCropRect({ ...cropRect, x: newX, w: newW, h: Math.max(20, Math.min(maxH - cropRect.y, cropStart.h + dy)) });
        } else if (cropDragging === 'ne') {
            const newH = Math.max(20, cropStart.h - dy);
            const newY = Math.max(0, cropStart.y + cropStart.h - newH);
            setCropRect({ ...cropRect, y: newY, w: Math.max(20, Math.min(maxW - cropRect.x, cropStart.w + dx)), h: newH });
        } else if (cropDragging === 'nw') {
            const newW = Math.max(20, cropStart.w - dx);
            const newX = Math.max(0, cropStart.x + cropStart.w - newW);
            const newH = Math.max(20, cropStart.h - dy);
            const newY = Math.max(0, cropStart.y + cropStart.h - newH);
            setCropRect({ x: newX, y: newY, w: newW, h: newH });
        }
    };

    const applyCrop = () => {
        const canvas = cropCanvasRef.current;
        if (!canvas || !editor) return;
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const scaleX = img.naturalWidth / cropImgDims.dispW;
            const scaleY = img.naturalHeight / cropImgDims.dispH;
            const sx = cropRect.x * scaleX;
            const sy = cropRect.y * scaleY;
            const sw = cropRect.w * scaleX;
            const sh = cropRect.h * scaleY;
            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            const croppedUrl = canvas.toDataURL('image/png');
            editor.chain().focus().setImage({ src: croppedUrl }).run();
            setShowCropModal(false);
        };
        img.src = cropImageSrc;
    };

    const handleSetLink = () => {
        if (!editor) return;
        if (linkUrl) {
            editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
        } else {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
        }
        setShowLinkModal(false);
        setLinkUrl('');
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (!editor) return;
        const target = e.target as HTMLElement;
        const isImage = target.tagName === 'IMG';
        if (isImage || !editor.state.selection.empty) {
            setContextMenu({ x: e.clientX, y: e.clientY, type: isImage ? 'image' : 'text' });
        }
    };

    const handleImageResize = () => {
        if (!editor) return;
        const w = parseFloat(imageSizeInches.w) * 96;
        const h = parseFloat(imageSizeInches.h) * 96;
        editor.chain().focus().updateAttributes('image', { width: Math.round(w), height: Math.round(h) }).run();
        setShowImageSizeModal(false);
    };


    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", background: "#f0f2f5" }}>
            <style>{`
                .ProseMirror {
                    width: 8.5in;
                    min-height: 400px;
                    padding: 40px 40px;
                    background: transparent;
                    margin: 0 auto;
                    outline: none;
                    position: relative;
                    white-space: pre-wrap;
                    tab-size: 4;
                    box-shadow: none;
                    font-size: 16px;
                    line-height: 24px;
                }
                .ProseMirror p {
                    margin-top: 0;
                    margin-bottom: 0;
                }
                .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror blockquote {
                    margin-top: 24px;
                    margin-bottom: 0px;
                    line-height: 1.5; /* This keeps headings at multiples of 24 if font-sizes are multiples of 16 */
                }

                .ProseMirror table { border-collapse: collapse; width: 100%; margin: 24px 0; }
                .ProseMirror td, .ProseMirror th { border: 1px solid #ccc; padding: 6px 10px; min-width: 60px; vertical-align: top; }
                .ProseMirror th { background: #f5f5f5; font-weight: 600; }
                .ProseMirror .tableWrapper { overflow-x: auto; margin: 24px 0; }
                .ProseMirror .selectedCell { background: #e8f0fe; }
                .ProseMirror .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: #3b82f6; pointer-events: none; }
                .editor-link { color: #2563eb; text-decoration: underline; cursor: pointer; }
                .ProseMirror img { max-width: 100%; cursor: pointer; border: 2px solid transparent; }
                .ProseMirror img.ProseMirror-selectednode { border: 2px solid #3b82f6; }
                .ProseMirror img[data-display="behind"] { position: absolute; z-index: -1; opacity: 0.8; }
                .ProseMirror img[data-display="infront"] { position: absolute; z-index: 10; }
                /* Image resize handles */
                .image-node-wrapper { display: inline-block; position: relative; line-height: 0; }
                .image-node-wrapper.img-selected { outline: 2px solid #3b82f6; outline-offset: 1px; }
                .img-resize-handle {
                    position: absolute; width: 8px; height: 8px; background: #3b82f6; border: 1px solid white;
                    border-radius: 1px; z-index: 20; box-sizing: border-box;
                }
                .img-resize-nw { top: -4px; left: -4px; cursor: nw-resize; }
                .img-resize-n  { top: -4px; left: calc(50% - 4px); cursor: n-resize; }
                .img-resize-ne { top: -4px; right: -4px; cursor: ne-resize; }
                .img-resize-e  { top: calc(50% - 4px); right: -4px; cursor: e-resize; }
                .img-resize-se { bottom: -4px; right: -4px; cursor: se-resize; }
                .img-resize-s  { bottom: -4px; left: calc(50% - 4px); cursor: s-resize; }
                .img-resize-sw { bottom: -4px; left: -4px; cursor: sw-resize; }
                .img-resize-w  { top: calc(50% - 4px); left: -4px; cursor: w-resize; }
                .ProseMirror ul, .ProseMirror ol { padding-left: 28px; margin-top: 0; margin-bottom: 0px; }
                .ProseMirror li { margin: 0; padding: 0; }
                /* Bullet list: disc → circle → square → open square (repeat) */
                .ProseMirror ul { list-style-type: disc; }
                .ProseMirror ul ul { list-style-type: circle; }
                .ProseMirror ul ul ul { list-style-type: square; }
                .ProseMirror ul ul ul ul { list-style-type: '▫ '; }
                .ProseMirror ul ul ul ul ul { list-style-type: disc; }
                .ProseMirror ul ul ul ul ul ul { list-style-type: circle; }
                .ProseMirror ul ul ul ul ul ul ul { list-style-type: square; }
                .ProseMirror ul ul ul ul ul ul ul ul { list-style-type: '▫ '; }
                /* Numbered list: 1. 2. → a. b. → i. ii. (repeat) */
                .ProseMirror ol { list-style-type: decimal; }
                .ProseMirror ol ol { list-style-type: lower-alpha; }
                .ProseMirror ol ol ol { list-style-type: lower-roman; }
                .ProseMirror ol ol ol ol { list-style-type: decimal; }
                .ProseMirror ol ol ol ol ol { list-style-type: lower-alpha; }
                .ProseMirror ol ol ol ol ol ol { list-style-type: lower-roman; }
                .ProseMirror [data-page-break] { page-break-after: always; border-bottom: 2px dashed #ccc; margin: 20px 0; height: 0; }
                .collaboration-cursor__caret {
                    border-left: 1px solid #0d0d0d; border-right: 1px solid #0d0d0d;
                    margin-left: -1px; margin-right: -1px; pointer-events: none; position: relative; word-break: normal;
                }
                .collaboration-cursor__label {
                    border-radius: 3px 3px 3px 0; color: #fff; font-size: 12px; font-weight: 600;
                    left: -1px; line-height: normal; padding: 0.1rem 0.3rem; position: absolute;
                    top: -1.4em; user-select: none; white-space: nowrap; z-index: 10;
                }
                @media print {
                    body * { visibility: hidden; }
                    .ProseMirror, .ProseMirror * { visibility: visible; }
                    .ProseMirror { position: absolute; left: 0; top: 0; width: 100%; margin: 0; box-shadow: none !important; border: none !important; }
                    @page { margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; @bottom-center { content: counter(page); font-size: 10px; color: #666; } }
                }
                .toolbar-btn { background: transparent; border: 1px solid #ddd; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; }
                .toolbar-btn:hover { background: #e9ecef; }
                .toolbar-btn.active { background: #e2e8f0; }
                .color-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 8px; }
                .color-swatch { width: 24px; height: 24px; border-radius: 4px; cursor: pointer; border: 1px solid #ddd; }
                .color-swatch:hover { transform: scale(1.15); }
                .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 1000; }
                .modal-box { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); min-width: 320px; }
                .modal-box h3 { margin: 0 0 12px; font-size: 16px; }
                .modal-box input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; margin-bottom: 8px; box-sizing: border-box; }
                .modal-box .btn-row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
                .modal-box button { padding: 6px 16px; border-radius: 4px; border: none; cursor: pointer; font-size: 13px; }
                .modal-box .btn-primary { background: #1a73e8; color: white; }
                .modal-box .btn-secondary { background: #eee; color: #333; }
                .ctx-menu { position: fixed; background: white; border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 2px 12px rgba(0,0,0,0.15); z-index: 1000; min-width: 180px; padding: 4px 0; }
                .ctx-menu-item { padding: 8px 16px; cursor: pointer; font-size: 13px; }
                .ctx-menu-item:hover { background: #f0f0f0; }
                .table-grid { display: grid; grid-template-columns: repeat(6, 20px); gap: 2px; padding: 8px; }
                .table-cell-pick { width: 20px; height: 20px; border: 1px solid #ddd; cursor: pointer; border-radius: 2px; }
                .table-cell-pick.active { background: #3b82f6; border-color: #3b82f6; }
            `}</style>

            {/* Header/Status Bar */}
            <div style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "white", borderBottom: "1px solid #ddd" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>{initialFile.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                    {editor && (() => {
                        const text = editor.state.doc.textContent || '';
                        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
                        return <span style={{ fontSize: 12, color: '#888' }}>{words.toLocaleString()} word{words !== 1 ? 's' : ''}</span>;
                    })()}
                    <span style={{ color: status === "modified" ? "#f59e0b" : status === "saved" ? "#10b981" : "#3b82f6", fontWeight: 500, fontSize: 12 }}>
                        {status === "modified" ? "Unsaved changes" : status === "saved" ? "Saved to Drive" : "Saving..."}
                    </span>
                    <button onClick={save} disabled={status === "saving"} style={{ padding: "6px 12px", borderRadius: 4, background: "#1a73e8", color: "white", border: "none", cursor: "pointer", fontSize: 12 }}>
                        Save Now
                    </button>
                </div>
            </div>

            {/* Toolbar - inlined for guaranteed reactivity */}
            {editor && (() => {
                const currentFontFamily = getActiveFontFamily(editor);
                const currentFontSize = getActiveFontSize(editor);
                return (
                    <div style={{ position: "relative", zIndex: 100, background: "#f8f9fa", borderBottom: "1px solid #ddd" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "6px 10px", background: "#f8f9fa", alignItems: 'center' }}>
                            {/* Font controls */}
                            <CustomFontFamilyDropdown editor={editor} currentFont={currentFontFamily} />
                            <FontSizeDropdown editor={editor} currentSize={currentFontSize} />
                            <div style={{ width: 1, height: 20, background: "#ccc", margin: "0 2px" }} />

                            {/* B I U */}
                            <button className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()} onMouseDown={e => e.preventDefault()} title="Bold (Ctrl+B)"><b>B</b></button>
                            <button className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()} onMouseDown={e => e.preventDefault()} title="Italic (Ctrl+I)"><i>I</i></button>
                            <button className={`toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleUnderline().run()} onMouseDown={e => e.preventDefault()} title="Underline (Ctrl+U)"><u>U</u></button>

                            {/* Text Color */}
                            <div ref={textColorRef} style={{ position: 'relative' }}>
                                <button className="toolbar-btn" onClick={() => { setShowTextColor(!showTextColor); setShowHighlightColor(false); }} onMouseDown={e => e.preventDefault()} title="Text Color">
                                    <span style={{ borderBottom: `3px solid ${editor.getAttributes('textStyle').color || '#000'}` }}>A</span>
                                </button>
                                {showTextColor && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 200, padding: 8, width: 130 }}>
                                        <div className="color-grid">
                                            {PRESET_COLORS.map(c => (
                                                <div key={c} className="color-swatch" style={{ background: c }} onMouseDown={e => e.preventDefault()} onClick={() => { editor.chain().focus().setColor(c).run(); setShowTextColor(false); }} />
                                            ))}
                                        </div>
                                        <input type="color" style={{ width: '100%', marginTop: 4, cursor: 'pointer' }} onMouseDown={e => e.preventDefault()} onChange={e => { editor.chain().focus().setColor(e.target.value).run(); setShowTextColor(false); }} />
                                    </div>
                                )}
                            </div>

                            {/* Highlight */}
                            <div ref={highlightColorRef} style={{ position: 'relative' }}>
                                <button className="toolbar-btn" onClick={() => { setShowHighlightColor(!showHighlightColor); setShowTextColor(false); }} onMouseDown={e => e.preventDefault()} title="Highlight">
                                    <span style={{ background: '#FFEB3B', padding: '0 3px', borderRadius: 2 }}>H</span>
                                </button>
                                {showHighlightColor && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 200, padding: 8, width: 130 }}>
                                        <div className="color-grid">
                                            {['#FFEB3B', '#FFC107', '#FF9800', '#F44336', '#E91E63', '#9C27B0', '#2196F3', '#4CAF50', '#00BCD4', '#8BC34A', '#CDDC39', 'transparent'].map(c => (
                                                <div key={c} className="color-swatch" style={{ background: c === 'transparent' ? 'white' : c, border: c === 'transparent' ? '2px dashed #ccc' : '1px solid #ddd' }} onMouseDown={e => e.preventDefault()} onClick={() => { if (c === 'transparent') editor.chain().focus().unsetHighlight().run(); else editor.chain().focus().toggleHighlight({ color: c }).run(); setShowHighlightColor(false); }} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div style={{ width: 1, height: 20, background: "#ccc", margin: "0 2px" }} />

                            {/* Lists */}
                            <button className={`toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()} onMouseDown={e => e.preventDefault()} title="Bullet List">•≡</button>
                            <button className={`toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()} onMouseDown={e => e.preventDefault()} title="Numbered List">1.</button>

                            {/* Indent */}
                            <button className="toolbar-btn" onClick={() => { if (editor.isActive('listItem')) editor.chain().focus().sinkListItem('listItem').run(); else (editor.commands as any).indent(); }} onMouseDown={e => e.preventDefault()} title="Indent (Tab)">→|</button>
                            <button className="toolbar-btn" onClick={() => { if (editor.isActive('listItem')) editor.chain().focus().liftListItem('listItem').run(); else (editor.commands as any).outdent(); }} onMouseDown={e => e.preventDefault()} title="Outdent (Shift+Tab)">|←</button>
                            <div style={{ width: 1, height: 20, background: "#ccc", margin: "0 2px" }} />

                            {/* Alignment */}
                            <button className={`toolbar-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('left').run()} onMouseDown={e => e.preventDefault()} title="Align Left">←</button>
                            <button className={`toolbar-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('center').run()} onMouseDown={e => e.preventDefault()} title="Align Center">=</button>
                            <button className={`toolbar-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('right').run()} onMouseDown={e => e.preventDefault()} title="Align Right">→</button>
                            <div style={{ width: 1, height: 20, background: "#ccc", margin: "0 2px" }} />

                            {/* Link */}
                            <button className={`toolbar-btn ${editor.isActive('link') ? 'active' : ''}`} onClick={() => { setLinkUrl(editor.getAttributes('link').href || ''); setShowLinkModal(true); }} onMouseDown={e => e.preventDefault()} title="Insert Link">🔗</button>

                            {/* Table */}
                            <div ref={tablePickerRef} style={{ position: 'relative' }}>
                                <button className="toolbar-btn" onClick={() => setShowTablePicker(!showTablePicker)} onMouseDown={e => e.preventDefault()} title="Insert Table">⊞</button>
                                {showTablePicker && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 200, padding: 8 }}>
                                        <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{tableHover.rows > 0 ? `${tableHover.rows} × ${tableHover.cols}` : 'Pick size'}</div>
                                        <div className="table-grid">
                                            {Array.from({ length: 36 }, (_, i) => {
                                                const r = Math.floor(i / 6) + 1, c = (i % 6) + 1; return (
                                                    <div key={i} className={`table-cell-pick ${r <= tableHover.rows && c <= tableHover.cols ? 'active' : ''}`}
                                                        onMouseEnter={() => setTableHover({ rows: r, cols: c })}
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => { editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: true }).run(); setShowTablePicker(false); setTableHover({ rows: 0, cols: 0 }); }} />
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Image */}
                            <button className="toolbar-btn" onClick={handleInsertImage} onMouseDown={e => e.preventDefault()} title="Insert Image">🖼</button>



                            <div style={{ flex: 1 }} />
                            <button onClick={handleExportPdf} title="Export as PDF" style={{ padding: "4px 12px", borderRadius: 4, background: "#4caf50", color: "white", border: "none", cursor: "pointer", fontSize: 12 }}>Export PDF</button>
                            <button onClick={handleExportDocx} title="Export as Word Document" style={{ padding: "4px 12px", borderRadius: 4, background: "#2196f3", color: "white", border: "none", cursor: "pointer", fontSize: 12 }}>Export DOCX</button>
                        </div>

                        {/* Table sub-toolbar */}
                        {editor.isActive('table') && (
                            <div style={{ display: 'flex', gap: 4, padding: '4px 10px', background: '#eef', borderTop: '1px solid #ddd', fontSize: 11 }}>
                                <button className="toolbar-btn" onClick={() => editor.chain().focus().addRowBefore().run()} onMouseDown={e => e.preventDefault()}>+ Row ↑</button>
                                <button className="toolbar-btn" onClick={() => editor.chain().focus().addRowAfter().run()} onMouseDown={e => e.preventDefault()}>+ Row ↓</button>
                                <button className="toolbar-btn" onClick={() => editor.chain().focus().addColumnBefore().run()} onMouseDown={e => e.preventDefault()}>+ Col ←</button>
                                <button className="toolbar-btn" onClick={() => editor.chain().focus().addColumnAfter().run()} onMouseDown={e => e.preventDefault()}>+ Col →</button>
                                <button className="toolbar-btn" onClick={() => editor.chain().focus().deleteRow().run()} onMouseDown={e => e.preventDefault()}>− Row</button>
                                <button className="toolbar-btn" onClick={() => editor.chain().focus().deleteColumn().run()} onMouseDown={e => e.preventDefault()}>− Col</button>
                                <button className="toolbar-btn" onClick={() => editor.chain().focus().mergeCells().run()} onMouseDown={e => e.preventDefault()}>Merge</button>
                                <button className="toolbar-btn" onClick={() => editor.chain().focus().splitCell().run()} onMouseDown={e => e.preventDefault()}>Split</button>
                                <button className="toolbar-btn" onClick={() => editor.chain().focus().deleteTable().run()} onMouseDown={e => e.preventDefault()} style={{ color: '#e53e3e' }}>Delete Table</button>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Scrollable Page Container */}
            <div
                style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 40, paddingTop: 20, cursor: "text", background: '#e8eaed' }}
                onClick={(e) => {
                    if (e.target === e.currentTarget && editor && !editor.isFocused) editor.commands.focus();
                    setContextMenu(null);
                }}
                onContextMenu={handleContextMenu}
            >
                <div style={{ cursor: 'auto', position: 'relative', width: '8.5in', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 0 2px rgba(0,0,0,0.08)', borderRadius: 2 }}>
                    <EditorContent editor={editor} />
                </div>
            </div>

            {/* Context Menu */}
            {
                contextMenu && (
                    <div className="ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={() => setContextMenu(null)}>
                        {contextMenu.type === 'text' && (
                            <>
                                <div className="ctx-menu-item" onClick={() => { setLinkUrl(''); setShowLinkModal(true); }}>🔗 Add Hyperlink</div>
                                <div className="ctx-menu-item" onClick={() => editor?.chain().focus().toggleBold().run()}>Bold</div>
                                <div className="ctx-menu-item" onClick={() => editor?.chain().focus().toggleItalic().run()}>Italic</div>
                            </>
                        )}
                        {contextMenu.type === 'image' && (
                            <>
                                <div className="ctx-menu-item" onClick={() => setShowImageSizeModal(true)}>📏 Set Size (inches)</div>
                                <div className="ctx-menu-item" onClick={openCropModal}>✂️ Crop Image</div>
                                <div className="ctx-menu-item" onClick={() => editor?.chain().focus().updateAttributes('image', { display: 'inline' }).run()}>Inline with Text</div>
                                <div className="ctx-menu-item" onClick={() => editor?.chain().focus().updateAttributes('image', { display: 'behind' }).run()}>Behind Text</div>
                                <div className="ctx-menu-item" onClick={() => editor?.chain().focus().updateAttributes('image', { display: 'infront' }).run()}>In Front of Text</div>
                            </>
                        )}
                    </div>
                )
            }

            {/* Link Modal */}
            {
                showLinkModal && (
                    <div className="modal-overlay" onClick={() => setShowLinkModal(false)}>
                        <div className="modal-box" onClick={e => e.stopPropagation()}>
                            <h3>Insert Hyperlink</h3>
                            <input placeholder="https://example.com" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetLink()} autoFocus />
                            <div className="btn-row">
                                <button className="btn-secondary" onClick={() => setShowLinkModal(false)}>Cancel</button>
                                <button className="btn-secondary" onClick={() => { editor?.chain().focus().unsetLink().run(); setShowLinkModal(false); }}>Remove Link</button>
                                <button className="btn-primary" onClick={handleSetLink}>Apply</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Image Size Modal */}
            {
                showImageSizeModal && (
                    <div className="modal-overlay" onClick={() => setShowImageSizeModal(false)}>
                        <div className="modal-box" onClick={e => e.stopPropagation()}>
                            <h3>Set Image Size (inches)</h3>
                            <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>Page is 8.5" × 11"</p>
                            <label style={{ fontSize: 12 }}>Width (inches)</label>
                            <input type="number" step="0.1" value={imageSizeInches.w} onChange={e => setImageSizeInches({ ...imageSizeInches, w: e.target.value })} />
                            <label style={{ fontSize: 12 }}>Height (inches)</label>
                            <input type="number" step="0.1" value={imageSizeInches.h} onChange={e => setImageSizeInches({ ...imageSizeInches, h: e.target.value })} />
                            <div className="btn-row">
                                <button className="btn-secondary" onClick={() => setShowImageSizeModal(false)}>Cancel</button>
                                <button className="btn-primary" onClick={handleImageResize}>Apply</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Margins Modal */}
            {
                showMarginModal && (
                    <div className="modal-overlay" onClick={() => setShowMarginModal(false)}>
                        <div className="modal-box" onClick={e => e.stopPropagation()}>
                            <h3>Page Margins (mm)</h3>
                            {(['top', 'right', 'bottom', 'left'] as const).map(side => (
                                <div key={side} style={{ marginBottom: 6 }}>
                                    <label style={{ fontSize: 12, textTransform: 'capitalize' }}>{side}</label>
                                    <input type="number" value={margins[side]} onChange={e => setMargins({ ...margins, [side]: parseInt(e.target.value) || 0 })} />
                                </div>
                            ))}
                            <div className="btn-row">
                                <button className="btn-secondary" onClick={() => setShowMarginModal(false)}>Close</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Image Source Picker */}
            {
                showImageSourcePicker && (
                    <div className="modal-overlay" onClick={() => setShowImageSourcePicker(false)}>
                        <div className="modal-box" onClick={e => e.stopPropagation()}>
                            <h3>Insert Image</h3>
                            <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>Choose where to insert the image from:</p>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className="btn-primary" style={{ flex: 1, padding: '12px 16px', fontSize: 14 }} onClick={handleInsertFromComputer}>💻 From Computer</button>
                                <button className="btn-primary" style={{ flex: 1, padding: '12px 16px', fontSize: 14, background: '#4caf50' }} onClick={handleInsertFromDrive}>📁 From MyDrive</button>
                            </div>
                            <div className="btn-row"><button className="btn-secondary" onClick={() => setShowImageSourcePicker(false)}>Cancel</button></div>
                        </div>
                    </div>
                )
            }

            {/* MyDrive Image Picker */}
            {
                showDriveImagePicker && (
                    <div className="modal-overlay" onClick={() => setShowDriveImagePicker(false)}>
                        <div className="modal-box" style={{ maxWidth: 540, maxHeight: '75vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                            <h3>Select Image from MyDrive</h3>
                            {/* Breadcrumb navigation */}
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: '#666', marginBottom: 8, flexWrap: 'wrap' }}>
                                {driveBreadcrumbs.map((crumb, idx) => (
                                    <span key={idx}>
                                        {idx > 0 && <span style={{ margin: '0 2px' }}>/</span>}
                                        <span
                                            onClick={() => handleDriveBreadcrumbClick(idx)}
                                            style={{ cursor: 'pointer', color: idx === driveBreadcrumbs.length - 1 ? '#333' : '#3b82f6', fontWeight: idx === driveBreadcrumbs.length - 1 ? 600 : 400 }}
                                        >
                                            {crumb.name}
                                        </span>
                                    </span>
                                ))}
                            </div>
                            {driveImagesLoading ? (
                                <p style={{ textAlign: 'center', color: '#888', padding: 20 }}>Loading...</p>
                            ) : (
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {/* Folders first */}
                                    {driveFolders.length > 0 && (
                                        <div style={{ marginBottom: 8 }}>
                                            {driveFolders.map(folder => (
                                                <div key={folder.id} onClick={() => handleDriveFolderClick(folder)} style={{
                                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                                    cursor: 'pointer', borderRadius: 6, border: '1px solid #eee', marginBottom: 4,
                                                    transition: 'background 0.15s'
                                                }} onMouseEnter={e => (e.currentTarget.style.background = '#f0f4ff')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                    <span style={{ fontSize: 18 }}>📁</span>
                                                    <span style={{ fontSize: 13 }}>{folder.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Images */}
                                    {driveImages.length > 0 ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '4px 0' }}>
                                            {driveImages.map(img => (
                                                <div key={img.id} onClick={() => handlePickDriveImage(img)} style={{
                                                    cursor: 'pointer', borderRadius: 6, border: '2px solid #eee', overflow: 'hidden',
                                                    transition: 'border-color 0.15s', textAlign: 'center'
                                                }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3b82f6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#eee')}>
                                                    <img src={`/api/files/${img.id}/download`} alt={img.name} style={{ width: '100%', height: 100, objectFit: 'cover' }} />
                                                    <div style={{ fontSize: 11, padding: '4px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : driveFolders.length === 0 ? (
                                        <p style={{ textAlign: 'center', color: '#888', padding: 20 }}>No images or folders found here.</p>
                                    ) : null}
                                </div>
                            )}
                            <div className="btn-row"><button className="btn-secondary" onClick={() => setShowDriveImagePicker(false)}>Cancel</button></div>
                        </div>
                    </div>
                )
            }

            {/* Crop Modal */}
            {
                showCropModal && (
                    <div className="modal-overlay" onClick={() => { setShowCropModal(false); setCropDragging(null); }}>
                        <div className="modal-box" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()} onMouseMove={handleCropMouseMove} onMouseUp={() => setCropDragging(null)} onMouseLeave={() => setCropDragging(null)}>
                            <h3>Crop Image</h3>
                            <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>Drag the crop area or corners to adjust.</p>
                            <div style={{ position: 'relative', display: 'inline-block', userSelect: 'none' }}>
                                <img src={cropImageSrc} alt="crop preview" style={{ maxWidth: 500, display: 'block' }} crossOrigin="anonymous"
                                    onLoad={(e) => {
                                        const el = e.currentTarget;
                                        setCropImgDims({ natW: el.naturalWidth, natH: el.naturalHeight, dispW: el.clientWidth, dispH: el.clientHeight });
                                        setCropRect({ x: 0, y: 0, w: el.clientWidth, h: el.clientHeight });
                                    }} />
                                {/* Darkened overlay outside crop */}
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: cropRect.y, background: 'rgba(0,0,0,0.45)' }} />
                                    <div style={{ position: 'absolute', top: cropRect.y + cropRect.h, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)' }} />
                                    <div style={{ position: 'absolute', top: cropRect.y, left: 0, width: cropRect.x, height: cropRect.h, background: 'rgba(0,0,0,0.45)' }} />
                                    <div style={{ position: 'absolute', top: cropRect.y, left: cropRect.x + cropRect.w, right: 0, height: cropRect.h, background: 'rgba(0,0,0,0.45)' }} />
                                </div>
                                {/* Crop selection border */}
                                <div style={{ position: 'absolute', left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h, border: '2px dashed #fff', cursor: 'move', boxSizing: 'border-box' }} onMouseDown={e => handleCropMouseDown('move', e)} />
                                {/* Corner handles */}
                                {['nw', 'ne', 'sw', 'se'].map(h => (
                                    <div key={h} onMouseDown={e => handleCropMouseDown(h, e)} style={{
                                        position: 'absolute', width: 10, height: 10, background: '#fff', border: '1px solid #333', cursor: `${h}-resize`,
                                        left: h.includes('w') ? cropRect.x - 5 : cropRect.x + cropRect.w - 5,
                                        top: h.includes('n') ? cropRect.y - 5 : cropRect.y + cropRect.h - 5,
                                    }} />
                                ))}
                            </div>
                            <canvas ref={cropCanvasRef} style={{ display: 'none' }} />
                            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                                Crop: {Math.round(cropRect.w * (cropImgDims.natW / (cropImgDims.dispW || 1)))} × {Math.round(cropRect.h * (cropImgDims.natH / (cropImgDims.dispH || 1)))} px
                            </div>
                            <div className="btn-row">
                                <button className="btn-secondary" onClick={() => setShowCropModal(false)}>Cancel</button>
                                <button className="btn-primary" onClick={applyCrop}>Apply Crop</button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}