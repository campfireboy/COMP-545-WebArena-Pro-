"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") || "/drive";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setSubmitting(false);

    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push(callbackUrl);
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form
        onSubmit={handleSubmit}
        style={{ width: "100%", maxWidth: 420, border: "1px solid #eee", borderRadius: 16, padding: 16 }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Log in</h1>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            type="password"
            autoComplete="current-password"
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        {error ? <div style={{ color: "crimson", marginBottom: 10 }}>{error}</div> : null}

        <button
          disabled={submitting}
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Logging in..." : "Log in"}
        </button>

        <div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
          No account?{" "}
          <a href="/signup" style={{ textDecoration: "underline" }}>
            Sign up
          </a>
        </div>
      </form>
    </div>
  );
}
