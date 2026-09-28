"use client";

import { acceptInvite } from "@netlify/identity";
import { useState } from "react";

export default function AcceptInvitePage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      const token = sessionStorage.getItem("vl_invite_token");
      if (!token) throw new Error("Invitation token is missing or expired");
      await acceptInvite(token, String(formData.get("password") ?? ""));
      sessionStorage.removeItem("vl_invite_token");
      window.location.href = "/integrations";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="eyebrow">VenueLoom invitation</span>
        <h1>Finish joining your workspace.</h1>
        <form action={submit} className="auth-form">
          <label>Create password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
          {error && <div className="notice error">{error}</div>}
          <button className="button primary full" disabled={busy}>{busy ? "Joining…" : "Accept invitation"}</button>
        </form>
      </section>
    </main>
  );
}
