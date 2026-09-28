"use client";

import { updateUser } from "@netlify/identity";
import { useState } from "react";

export default function ResetPasswordPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      await updateUser({ password: String(formData.get("password") ?? "") });
      window.location.href = "/integrations";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="eyebrow">Account recovery</span>
        <h1>Choose a new password.</h1>
        <form action={submit} className="auth-form">
          <label>New password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
          {error && <div className="notice error">{error}</div>}
          <button className="button primary full" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
        </form>
      </section>
    </main>
  );
}
