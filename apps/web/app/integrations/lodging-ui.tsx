"use client";

import { useEffect, useState } from "react";

type Venue = { id: string; name: string };
type Unit = {
  id: string;
  name: string;
  timezone: string;
  venue_id?: string | null;
  blocks_venue_availability: boolean;
  feeds: Array<{ id: string; provider: "airbnb" | "vrbo"; enabled: boolean; lastSyncedAt?: string | null; lastError?: string | null }>;
};

export function LodgingSyncPanel({ venues }: { venues: Venue[] }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ provider: string; exportUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/lodging", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Unable to load lodging"); return; }
    setUnits(data.units ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function createUnit(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true); setError("");
    const response = await fetch("/api/lodging/units", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        timezone: data.get("timezone"),
        venueId: data.get("venueId") || null,
        blocksVenueAvailability: data.get("blocksVenueAvailability") === "on"
      })
    });
    const json = await response.json();
    setBusy(false);
    if (!response.ok) { setError(json.error ?? "Unable to create house"); return; }
    form.reset();
    await load();
  }

  async function connectFeed(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true); setError(""); setResult(null);
    const provider = String(data.get("provider"));
    const response = await fetch("/api/lodging/feeds", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitId: data.get("unitId"), provider, sourceUrl: data.get("sourceUrl") })
    });
    const json = await response.json();
    setBusy(false);
    if (!response.ok) { setError(json.error ?? "Unable to connect calendar"); return; }
    setResult({ provider, exportUrl: json.exportUrl });
    await load();
  }

  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">House occupancy sync</span>
          <h2>Airbnb + Vrbo availability in VenueLoom.</h2>
          <p>Each house gets its own occupancy calendar. VenueLoom imports booked/blocked dates and gives you a private export URL to paste back into the other platform.</p>
        </div>
        <span className="secure-badge">iCal two-way availability</span>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="lodging-grid">
        <div className="step-card">
          <div className="step-number">1</div>
          <div className="step-body">
            <h3>Add a house / lodging unit</h3>
            <form className="auth-form compact-form" onSubmit={(event) => { event.preventDefault(); void createUnit(event.currentTarget); }}>
              <label>House name<input name="name" placeholder="Guest House" required /></label>
              <label>Timezone<input name="timezone" defaultValue="Pacific/Honolulu" required /></label>
              <label>Related venue<select name="venueId"><option value="">No venue link</option>{venues.map((venue) => <option value={venue.id} key={venue.id}>{venue.name}</option>)}</select></label>
              <label className="inline-check"><input type="checkbox" name="blocksVenueAvailability" /> A house stay should also block the linked venue</label>
              <button className="button primary" disabled={busy}>Add house</button>
            </form>
          </div>
        </div>

        <div className="step-card">
          <div className="step-number">2</div>
          <div className="step-body">
            <h3>Connect Airbnb or Vrbo</h3>
            <form className="auth-form compact-form" onSubmit={(event) => { event.preventDefault(); void connectFeed(event.currentTarget); }}>
              <label>House<select name="unitId" required><option value="">Choose house</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
              <label>Platform<select name="provider" defaultValue="airbnb"><option value="airbnb">Airbnb</option><option value="vrbo">Vrbo</option></select></label>
              <label>Platform export iCal URL<input name="sourceUrl" type="text" inputMode="url" placeholder="https://www.airbnb.com/calendar/ical/... or webcal://..." required /></label>
              <button className="button primary" disabled={busy}>Connect calendar</button>
            </form>
          </div>
        </div>
      </div>

      {result && (
        <div className="export-result">
          <span className="eyebrow">VenueLoom → {result.provider}</span>
          <h3>Paste this VenueLoom calendar URL into {result.provider === "airbnb" ? "Airbnb" : "Vrbo"} as an imported calendar.</h3>
          <code>{result.exportUrl}</code>
          <button className="button secondary" onClick={() => navigator.clipboard.writeText(result.exportUrl)}>Copy URL</button>
          <p>The export automatically excludes reservations that originally came from that same platform, preventing calendar echo loops.</p>
        </div>
      )}

      <div className="unit-grid">
        {units.map((unit) => (
          <article className="provider-card lodging-unit-card" key={unit.id}>
            <div className="provider-card-top"><div className="provider-logo">⌂</div><span className="status status-ready">Active</span></div>
            <h3>{unit.name}</h3>
            <p>{unit.timezone}{unit.blocks_venue_availability ? " · blocks linked venue" : ""}</p>
            <div className="binding-list">
              {unit.feeds?.length ? unit.feeds.map((feed) => (
                <div className="binding-row" key={feed.id}>
                  <div><strong>{feed.provider === "airbnb" ? "Airbnb" : "Vrbo"}</strong><span>{feed.lastError ? feed.lastError : "Calendar connected"}</span></div>
                  <small>{feed.lastSyncedAt ? new Date(feed.lastSyncedAt).toLocaleString() : "Initial sync queued"}</small>
                </div>
              )) : <small>No booking platform connected yet.</small>}
            </div>
          </article>
        ))}
      </div>

      <div className="notice amber">
        iCal is availability synchronization, not a full reservation API: VenueLoom intentionally stores only the occupancy dates/UID/status needed to block availability, not guest names or messages from the feed.
      </div>
    </section>
  );
}
