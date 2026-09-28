"use client";

import { handleAuthCallback, login, oauthLogin } from "@netlify/identity";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void handleAuthCallback()
      .then((result) => {
        if (result?.user) router.replace("/integrations");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Authentication callback failed."));
  }, [router]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      router.replace("/integrations");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">V</div>
          <div><strong>VenueLoom</strong><span>Venue OS</span></div>
        </div>
        <span className="eyebrow">Secure workspace</span>
        <h1>Welcome back.</h1>
        <p>Sign in to manage venues, migrations, calendars, integrations, and booking availability.</p>

        <form onSubmit={signIn} className="auth-form">
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <div className="notice error">{error}</div>}
          <button className="button primary full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>

        <div className="auth-divider"><span>or</span></div>
        <button className="button secondary full" onClick={() => oauthLogin("google")}>Continue with Google</button>
        <small className="auth-note">Netlify Identity must be enabled on the VenueLoom Netlify project. Invite-only registration is recommended for launch.</small>
      </section>
    </main>
  );
}
