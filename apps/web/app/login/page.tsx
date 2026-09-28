"use client";

import { handleAuthCallback, login, oauthLogin, signup } from "@netlify/identity";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    handleAuthCallback().then((result) => {
      if (result) window.location.href = "/integrations";
    }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      const email = String(formData.get("email") ?? "").trim();
      const password = String(formData.get("password") ?? "");
      if (mode === "signup") {
        await signup(email, password, { full_name: String(formData.get("name") ?? "").trim() });
      } else {
        await login(email, password);
      }
      window.location.href = "/integrations";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand"><div className="brand-mark">V</div><div><strong>VenueLoom</strong><span>Venue OS</span></div></div>
        <span className="eyebrow">Secure workspace</span>
        <h1>{mode === "login" ? "Welcome back." : "Create your VenueLoom account."}</h1>
        <p>Your login identifies you. VenueLoom separately verifies which organizations and venues you can access on every request.</p>
        <form action={submit} className="auth-form">
          {mode === "signup" && <label>Name<input name="name" autoComplete="name" required /></label>}
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required /></label>
          {error && <div className="notice error">{error}</div>}
          <button className="button primary full" disabled={busy}>{busy ? "Working…" : mode === "login" ? "Log in" : "Create account"}</button>
        </form>
        <button className="button secondary full" onClick={() => oauthLogin("google")}>Continue with Google</button>
        <button className="text-button auth-toggle" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>
      </section>
    </main>
  );
}
