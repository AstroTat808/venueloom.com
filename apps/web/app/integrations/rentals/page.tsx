"use client";

import { useEffect, useMemo, useState } from "react";
 
type RentalData = {
  venues: Array<{ id: string; name: string; timezone: string }>;
  venueCalendars: Array<{ id: string; venueId: string; name: string; resourceKind: string; timezone: string }>;
  links: Array<{ id: string; providerCode: string; listingName: string; venueCalendarId: string }>;
};

export default function RentalIntegrationsPage() {
  const initialProvider: "airbnb" | "vrbo" = "airbnb";
  const [data, setData] = useState<RentalData | null>(null);
  const [providerCode, setProviderCode] = useState<"airbnb" | "vrbo">(initialProvider);
  const [venueId, setVenueId] = useState("");
  const [venueCalendarId, setVenueCalendarId] = useState("");
  const [listingName, setListingName] = useState("");
  const [inboundUrl, setInboundUrl] = useState("");
  const [outboundUrl, setOutboundUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get("provider");
    if (selected === "vrbo" || selected === "airbnb") setProviderCode(selected);
    void fetch("/api/integrations/rentals")
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error ?? "Rental integrations could not be loaded.");
        setData(json);
        setVenueId(json.venues[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Rental integrations could not be loaded."));
  }, []);

  const calendars = useMemo(
    () => data?.venueCalendars.filter((calendar) => !venueId || calendar.venueId === venueId) ?? [],
    [data, venueId]
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setOutboundUrl("");
    try {
      const response = await fetch("/api/integrations/rentals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerCode,
          venueId,
          venueCalendarId: venueCalendarId || undefined,
          listingName,
          inboundUrl
        })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Rental calendar setup failed.");
      setOutboundUrl(json.outboundUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rental calendar setup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card setup-card rental-setup-card">
        <span className="eyebrow">House booking availability</span>
        <h1>Sync Airbnb & Vrbo with VenueLoom.</h1>
        <p>Paste the calendar export URL from the booking platform. VenueLoom imports reservations as availability blocks and gives you a VenueLoom calendar URL to paste back into the platform.</p>
        {error && <div className="notice error">{error}</div>}
        <form className="auth-form" onSubmit={submit}>
          <label>Platform
            <select value={providerCode} onChange={(e) => setProviderCode(e.target.value as "airbnb" | "vrbo")}>
              <option value="airbnb">Airbnb</option>
              <option value="vrbo">Vrbo</option>
            </select>
          </label>
          <label>Venue / property group
            <select value={venueId} onChange={(e) => { setVenueId(e.target.value); setVenueCalendarId(""); }} required>
              {data?.venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
          </label>
          <label>House / listing name
            <input value={listingName} onChange={(e) => setListingName(e.target.value)} placeholder="Main House" required />
          </label>
          <label>Existing VenueLoom house calendar <small>Optional — leave blank to create one</small>
            <select value={venueCalendarId} onChange={(e) => setVenueCalendarId(e.target.value)}>
              <option value="">Create a new rental-house calendar</option>
              {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
            </select>
          </label>
          <label>{providerCode === "airbnb" ? "Airbnb" : "Vrbo"} exported .ics calendar URL
            <input value={inboundUrl} onChange={(e) => setInboundUrl(e.target.value)} placeholder="https://..." required />
          </label>
          <button className="button primary full" disabled={busy}>{busy ? "Connecting…" : "Connect rental calendar"}</button>
        </form>

        {outboundUrl && (
          <div className="rental-outbound-result">
            <span className="eyebrow">Step 2 · Complete two-way availability</span>
            <h3>Paste this VenueLoom calendar URL into {providerCode === "airbnb" ? "Airbnb" : "Vrbo"}.</h3>
            <input readOnly value={outboundUrl} onFocus={(e) => e.currentTarget.select()} />
            <p>This feed excludes reservations imported from that same source connection, preventing circular duplicate blocks.</p>
          </div>
        )}
      </section>
    </main>
  );
}
