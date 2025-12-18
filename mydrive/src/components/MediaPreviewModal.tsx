"use client";

import { useEffect, useRef } from "react";

type FileObject = {
    id: string;
    name: string;
    mimeType: string;
};

export function MediaPreviewModal({ file, onClose }: { file: FileObject; onClose: () => void }) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    // Close on click outside
    function onBackdropClick(e: React.MouseEvent) {
        if (e.target === dialogRef.current) {
            onClose();
        }
    }

    const src = `/api/files/${file.id}/download`;

    let content = null;
    if (file.mimeType === "image/jpeg") {
        content = (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={file.name} style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain" }} />
        );
    } else if (file.mimeType === "video/mp4") {
        content = (
            <video controls autoPlay src={src} style={{ maxWidth: "90vw", maxHeight: "80vh" }}>
                Your browser does not support the video tag.
            </video>
        );
    } else if (file.mimeType === "audio/mpeg") {
        content = (
            <div style={{ background: "white", padding: 32, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 64 }}>🎵</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{file.name}</div>
                <audio controls autoPlay src={src} style={{ width: 300 }} />
            </div>
        );
    } else {
        content = <div style={{ color: "white" }}>Unsupported preview format</div>;
    }

    return (
        <div
            ref={dialogRef}
            onClick={onBackdropClick}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 10000,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(4px)",
            }}
        >
            <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10001 }}>
                <button
                    onClick={onClose}
                    style={{
                        background: "rgba(255,255,255,0.1)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        color: "white",
                        fontSize: 24,
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center"
                    }}
                >
                    ✕
                </button>
            </div>
            {content}
        </div>
    );
}
