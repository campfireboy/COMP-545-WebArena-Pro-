"use client";

import { signOut, useSession } from "next-auth/react";

export function Header({ title }: { title?: string }) {
    const { data: session } = useSession();

    return (
        <header style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid #ddd",
            background: "white"
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#1a73e8" }}>MyDrive</div>
                {title && <div style={{ fontSize: 18, color: "#555", borderLeft: "1px solid #ddd", paddingLeft: 16 }}>{title}</div>}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {session?.user?.username && (
                    <div style={{ fontWeight: 600 }}>{session.user.username}</div>
                )}
                <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "white",
                        cursor: "pointer",
                        fontWeight: 500
                    }}
                >
                    Sign Out
                </button>
            </div>
        </header>
    );
}
