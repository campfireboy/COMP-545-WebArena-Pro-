"use client";

import { useRouter } from "next/navigation";

export function Sidebar({ activePage }: { activePage: "drive" | "shared" }) {
    const router = useRouter();

    const baseStyle = {
        textAlign: "left" as const,
        cursor: "pointer",
        border: "none",
        borderRadius: 8,
        padding: "8px 12px",
        width: "100%",
        fontSize: 14,
        color: "#3c4043",
        background: "transparent",
        fontWeight: 400,
    };

    const activeStyle = {
        ...baseStyle,
        background: "#e8f0fe",
        color: "#1967d2",
        fontWeight: 500,
    };

    return (
        <aside style={{ width: 240, borderRight: "1px solid #eee", padding: 16, flexShrink: 0, height: "100vh", boxSizing: "border-box" }}>
            <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 18, color: "#444", paddingLeft: 12 }}>MyDrive</div>
            <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button
                    onClick={() => router.push("/drive")}
                    style={activePage === "drive" ? activeStyle : baseStyle}
                >
                    My Drive
                </button>
                <button
                    onClick={() => router.push("/shared-with-me")}
                    style={activePage === "shared" ? activeStyle : baseStyle}
                >
                    Shared with me 👥
                </button>
            </nav>
        </aside>
    );
}
