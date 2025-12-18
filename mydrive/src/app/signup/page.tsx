"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password, name: name.trim() ? name.trim() : undefined }),
    });

    setSubmitting(false);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data?.error || "Signup failed.");
      return;
    }

    router.push("/login");
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form
        onSubmit={handleSubmit}
        style={{ width: "100%", maxWidth: 420, border: "1px solid #eee", borderRadius: 16, padding: 16 }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Sign up</h1>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Name (optional)</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex"
            autoComplete="name"
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Username</div>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoComplete="username"
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

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
            placeholder="min 6 characters"
            type="password"
            autoComplete="new-password"
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
          {submitting ? "Creating..." : "Create account"}
        </button>

        <div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
          Already have an account?{" "}
          <a href="/login" style={{ textDecoration: "underline" }}>
            Log in
          </a>
        </div>
      </form>
    </div>
  );
}
