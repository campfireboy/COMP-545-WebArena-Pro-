"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface AutoLoginProps {
    email: string;
    password?: string;
}

export default function AutoLoginClient({ email, password = "password123" }: AutoLoginProps) {
    const router = useRouter();
    const [msg, setMsg] = useState(`Attempting auto-login for ${email}...`);

    useEffect(() => {
        if (!email) {
            setMsg("No email provided.");
            return;
        }

        // Attempt to log in immediately on mount
        signIn("credentials", {
            email,
            password,
            redirect: false,
        }).then((res) => {
            if (res?.ok) {
                setMsg(`Login successful for ${email}. Redirecting...`);
                router.refresh(); // Refresh to ensure server session is recognized
                router.push("/");
            } else {
                setMsg("Login failed: " + (res?.error || "Unknown error"));
            }
        });
    }, [email, password, router]);

    return (
        <div style={{ padding: 12, background: "#f0f0f0", borderRadius: 8, margin: "10px 0" }}>
            {msg}
        </div>
    );
}
