"use client";

import { signIn } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Agent1SkipLogin() {
    const router = useRouter();

    useEffect(() => {
        signIn("credentials", {
            email: "agent1@test.com",
            password: "password",
            redirect: false,
        }).then((res) => {
            if (res?.ok) {
                router.push("/drive");
            } else {
                alert("Login failed: " + res?.error);
            }
        });
    }, [router]);

    return (
        <div style={{ padding: 50, textAlign: "center" }}>
            <h1>Logging in as Agent 1...</h1>
        </div>
    );
}
