"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AgentLoginPage() {
    const router = useRouter();
    const [msg, setMsg] = useState("Attempting auto-login...");

    useEffect(() => {
        // Attempt to log in immediately on mount
        signIn("credentials", {
            email: "agent@test.com",
            password: "password123",
            redirect: false,
        }).then((res) => {
            if (res?.ok) {
                setMsg("Login successful. Redirecting to / ...");
                router.refresh(); // Refresh to ensure server session is recognized
                router.push("/");
            } else {
                setMsg("Login failed: " + (res?.error || "Unknown error"));
            }
        });
    }, [router]);

    return (
        <div style={{ padding: 24, fontFamily: "sans-serif" }}>
            <h1>Agent Auto-Login Checkpoint</h1>
            <div style={{ padding: 12, background: "#f0f0f0", borderRadius: 8, margin: "10px 0" }}>
                {msg}
            </div>
            <p>
                Typically this page is accessed by automated agents to establish a session before starting a task.
            </p>
        </div>
    );
}
