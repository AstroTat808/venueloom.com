"use client";

import { useState } from "react";

export function OnboardingForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName: formData.get("organizationName"),
        venueName: formData.get("venueName"),
        timezone: formData.get("timezone")
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Onboarding failed");
      setBusy(false);
      return;
    }
    window.location.href = "/integrations";
  }

  return (
    <main className="auth-shell">
      <section className="auth-card wide-auth-card">
        <span className="eyebrow">Create your workspace</span>
        <h1>Set up the business and first venue.</h1>
        <p>This creates the organization tenant, your owner membership, and the first venue in one database transaction.</p>
        <form action={submit} className="auth-form">
          <label>Business / organization name<input name="organizationName" placeholder="Koa's Events" required /></label>
          <label>First venue name<input name="venueName" placeholder="Koa's Events" required /></label>
          <label>Venue timezone<input name="timezone" defaultValue="Pacific/Honolulu" required /></label>
          {error && <div className="notice error">{error}</div>}
          <button className="button primary full" disabled={busy}>{busy ? "Creating…" : "Create VenueLoom workspace"}</button>
        </form>
      </section>
    </main>
  );
}
