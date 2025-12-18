"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { useSession } from "next-auth/react";
import Papa from "papaparse";
import { evaluate } from "mathjs";

type FileObject = {
    id: string;
    name: string;
    mimeType: string;
    size: number;
};

// Helper: Convert "A1" to [0, 0]
function cellIdToCoords(cellId: string): [number, number] | null {
    const match = cellId.toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
    if (!match) return null;
    const colStr = match[1];
    const rowStr = match[2];

    let colIndex = 0;
    for (let i = 0; i < colStr.length; i++) {
        colIndex = colIndex * 26 + (colStr.charCodeAt(i) - 64);
    }
    return [parseInt(rowStr) - 1, colIndex - 1];
}

// Helper: Convert [0, 0] to "A1"
function coordsToCellId(row: number, col: number): string {
    let colStr = "";
    let c = col + 1;
    while (c > 0) {
        let remainder = (c - 1) % 26;
        colStr = String.fromCharCode(65 + remainder) + colStr;
        c = Math.floor((c - 1) / 26);
    }
    return `${colStr}${row + 1}`;
}

export default function SpreadsheetEditor({ fileId, initialFile }: { fileId: string, initialFile: FileObject }) {
    const { data: session } = useSession();
    const [status, setStatus] = useState<"saved" | "saving" | "modified">("saved");
    const [grid, setGrid] = useState<string[][]>([]); // [row][col]
    const [rows, setRows] = useState(20);
    const [cols, setCols] = useState(10);
    const ydocRef = useRef<Y.Doc>(new Y.Doc());
    const yMapRef = useRef<Y.Map<string>>(ydocRef.current.getMap("spreadsheet"));
    const [editingCell, setEditingCell] = useState<{ r: number, c: number } | null>(null);

    // Initial Grid Setup
    const ensureGridSize = (r: number, c: number) => {
        setRows(prev => Math.max(prev, r));
        setCols(prev => Math.max(prev, c));
    };

    // Calculate Value (Handles Formulas)
    const calculateValue = useCallback((val: string, currentGrid: string[][]) => {
        if (!val || !val.startsWith("=")) return val;
        try {
            const expression = val.substring(1).toUpperCase();
            // Replace cell refs (A1) with values
            const parsed = expression.replace(/[A-Z]+[0-9]+/g, (match) => {
                const coords = cellIdToCoords(match);
                if (!coords) return "0";
                const [r, c] = coords;
                if (r < currentGrid.length && c < currentGrid[0].length) {
                    const cellVal = currentGrid[r][c];
                    return isNaN(Number(cellVal)) ? "0" : cellVal; // Treat non-numbers as 0 for math
                }
                return "0";
            });
            return String(evaluate(parsed));
        } catch (e) {
            return "#ERROR";
        }
    }, []);

    // Load from Yjs to Grid
    const loadGridFromYjs = useCallback(() => {
        const map = yMapRef.current;
        const newGrid: string[][] = Array(rows).fill(null).map(() => Array(cols).fill(""));

        map.forEach((value, key) => {
            const [r, c] = key.split(":").map(Number);
            if (r < rows && c < cols) {
                newGrid[r][c] = value;
            }
        });
        setGrid(newGrid);
    }, [rows, cols]);

    // Handle Cell Change
    const handleCellChange = (r: number, c: number, value: string) => {
        const map = yMapRef.current;
        const key = `${r}:${c}`;
        if (value === "") map.delete(key);
        else map.set(key, value);
        setStatus("modified");
    };

    // Save Logic
    const save = useCallback(async () => {
        setStatus("saving");
        try {
            // Convert Grid to CSV
            const csv = Papa.unparse(grid);

            const presignRes = await fetch("/api/files/presign", {
                method: "POST",
                body: JSON.stringify({
                    name: initialFile.name,
                    size: new Blob([csv]).size,
                    mimeType: "text/csv",
                    folderId: null
                })
            });
            if (!presignRes.ok) throw new Error("Failed to init upload");
            const { uploadUrl, s3Key } = await presignRes.json();

            await fetch(uploadUrl, {
                method: "PUT",
                body: csv,
                headers: { "Content-Type": "text/csv" }
            });

            await fetch(`/api/files/${fileId}`, {
                method: "PATCH",
                body: JSON.stringify({ s3Key, size: new Blob([csv]).size })
            });

            setStatus("saved");
        } catch (err) {
            console.error(err);
            setStatus("modified");
        }
    }, [grid, initialFile, fileId]);

    // Autosave
    useEffect(() => {
        if (status === "modified") {
            const timer = setTimeout(() => save(), 5000);
            return () => clearTimeout(timer);
        }
    }, [status, save]);

    // Init Yjs
    useEffect(() => {
        if (!session) return;
        const ydoc = ydocRef.current;
        const persistence = new IndexeddbPersistence(fileId, ydoc);
        const provider = new WebsocketProvider("ws://localhost:1234", fileId, ydoc);

        persistence.whenSynced.then(() => {
            loadGridFromYjs(); // Initial load from local
        });

        provider.on('synced', async (synced: any) => {
            if (synced) {
                const map = ydoc.getMap("spreadsheet");
                if (map.size === 0) {
                    // Empty? Try load CSV from server
                    try {
                        const res = await fetch(`/api/files/${fileId}/download`);
                        if (res.ok) {
                            const csvText = await res.text();
                            const parsed = Papa.parse(csvText, { header: false });
                            const data = parsed.data as string[][];

                            ydoc.transact(() => {
                                data.forEach((row, r) => {
                                    row.forEach((cell, c) => {
                                        if (cell) map.set(`${r}:${c}`, cell);
                                    });
                                });
                            });

                            // Adjust size
                            ensureGridSize(data.length + 5, (data[0]?.length || 0) + 5);
                        }
                    } catch (e) { console.error("Failed load CSV", e); }
                }
            }
        });

        ydoc.on('update', () => {
            loadGridFromYjs();
            setStatus("modified");
        });

        return () => {
            provider.destroy();
            persistence.destroy();
        };
    }, [fileId, session, loadGridFromYjs]); // loadGridFromYjs added as dep

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", background: "#f8f9fa" }}>
            {/* Header */}
            <div style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", borderBottom: "1px solid #ddd" }}>
                <span style={{ fontWeight: 600 }}>{initialFile.name} (Spreadsheet)</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: status === "modified" ? "orange" : "green" }}>
                        {status === "modified" ? "Unsaved..." : "Saved"}
                    </span>
                    <button onClick={save} style={{ padding: "4px 12px", background: "#1a73e8", color: "white", border: "none", borderRadius: 4 }}>
                        Save
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div style={{ flex: 1, overflow: "auto", padding: 10 }}>
                <table style={{ borderCollapse: "collapse", background: "white" }}>
                    <thead>
                        <tr>
                            <th style={{ background: "#f0f0f0", border: "1px solid #ccc", width: 40 }}></th>
                            {Array.from({ length: cols }).map((_, i) => (
                                <th key={i} style={{ background: "#f0f0f0", border: "1px solid #ccc", width: 100, fontSize: 12, color: "#666" }}>
                                    {String.fromCharCode(65 + i)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {grid.map((row, r) => (
                            <tr key={r}>
                                <td style={{ background: "#f0f0f0", border: "1px solid #ccc", textAlign: "center", fontSize: 12, color: "#666" }}>
                                    {r + 1}
                                </td>
                                {row.map((cell, c) => (
                                    <td key={c} style={{ border: "1px solid #ccc", padding: 0, width: 100, height: 25 }}>
                                        <input
                                            type="text"
                                            value={editingCell?.r === r && editingCell?.c === c ? cell : calculateValue(cell, grid)}
                                            onFocus={() => setEditingCell({ r, c })}
                                            onBlur={() => setEditingCell(null)}
                                            onChange={(e) => handleCellChange(r, c, e.target.value)}
                                            style={{
                                                width: "100%", height: "100%", border: "none", outline: "none",
                                                padding: "0 4px", fontSize: 13,
                                                background: editingCell?.r === r && editingCell?.c === c ? "#e8f0fe" : "transparent"
                                            }}
                                        />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
