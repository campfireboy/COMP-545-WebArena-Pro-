"use client";

import { signOut, useSession } from "next-auth/react";

import { ReactNode } from "react";

import { LogOut } from "lucide-react";

export function Header({ title, actions }: { title?: ReactNode; actions?: ReactNode }) {
    const { data: session } = useSession();

    return (
        <header style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 24px",
            borderBottom: "1px solid #e0e0e0",
            background: "white",
            height: 64,
            boxSizing: "border-box"
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: "#444746", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 24 }}>✨</span>
                    <span>MyDrive</span>
                </div>
                {title && <div style={{ fontSize: 18, color: "#444746", borderLeft: "1px solid #747775", paddingLeft: 16, height: 24, display: "flex", alignItems: "center" }}>{title}</div>}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {actions}
                {session?.user?.username && (
                    <div style={{ fontWeight: 500, color: "#444746", fontSize: 14 }}>{session.user.username}</div>
                )}
                <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    style={{
                        padding: "8px 16px",
                        borderRadius: 20,
                        border: "1px solid #747775",
                        background: "white",
                        cursor: "pointer",
                        fontWeight: 500,
                        color: "#1f1f1f",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 14
                    }}
                >
                    <LogOut size={16} />
                    Sign Out
                </button>
            </div>
        </header>
    );
}
