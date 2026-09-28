"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [timezone, setTimezone] = useState("Pacific/Honolulu");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationName, venueName, timezone, currency: "USD" })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Workspace setup failed.");
      router.replace("/integrations");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workspace setup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card setup-card">
        <span className="eyebrow">First workspace</span>
        <h1>Create your VenueLoom organization.</h1>
        <p>This creates the tenant boundary and first venue. Additional venues and team memberships remain scoped underneath the organization.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>Organization name<input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Koa's" required /></label>
          <label>First venue<input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Koa's Events" required /></label>
          <label>Venue timezone<input value={timezone} onChange={(e) => setTimezone(e.target.value)} required /></label>
          {error && <div className="notice error">{error}</div>}
          <button className="button primary full" disabled={busy}>{busy ? "Creating…" : "Create workspace"}</button>
        </form>
      </section>
    </main>
  );
}
