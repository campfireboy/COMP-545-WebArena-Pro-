import { useRouter } from "next/navigation";
import { HardDrive, Users, Trash2 } from "lucide-react";

export function Sidebar({ activePage, onDropToDrive, onDropToTrash, children }: { activePage: "drive" | "shared" | "trash", onDropToDrive?: (e: React.DragEvent) => void, onDropToTrash?: (e: React.DragEvent) => void, children?: React.ReactNode }) {
    const router = useRouter();

    const baseStyle = {
        textAlign: "left" as const,
        cursor: "pointer",
        border: "none",
        borderRadius: 24,
        padding: "8px 16px 8px 12px",
        width: "90%",
        fontSize: 14,
        color: "#444746",
        background: "transparent",
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 12
    };

    const activeStyle = {
        ...baseStyle,
        background: "#c2e7ff",
        color: "#001d35",
    };

    return (
        <aside style={{ width: 256, padding: "16px 0 16px 16px", flexShrink: 0, height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 400, marginBottom: 16, fontSize: 22, color: "#444746", paddingLeft: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 24 }}>✨</span>
                <span>MyDrive</span>
            </div>
            <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button
                    onClick={() => router.push("/drive")}
                    style={activePage === "drive" ? activeStyle : baseStyle}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={onDropToDrive}
                >
                    <HardDrive size={20} />
                    My Drive
                </button>
                <button
                    onClick={() => router.push("/shared-with-me")}
                    style={activePage === "shared" ? activeStyle : baseStyle}
                >
                    <Users size={20} />
                    Shared with me
                </button>
                <button
                    onClick={() => router.push("/drive/trash")}
                    style={activePage === "trash" ? activeStyle : baseStyle}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={onDropToTrash}
                >
                    <Trash2 size={20} />
                    Trash
                </button>
            </nav>
            {children}
        </aside>
    );
}
