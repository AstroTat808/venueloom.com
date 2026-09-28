"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Data = {
  connection: { id: string; providerCode: string; name: string };
  externalCalendars: Array<{ id: string; name: string; primary?: boolean; canEdit?: boolean }>;
  venueCalendars: Array<{ id: string; venueId: string; name: string; resourceKind: string; timezone: string }>;
};

export default function CalendarSetupPage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [externalCalendarId, setExternalCalendarId] = useState("");
  const [venueCalendarId, setVenueCalendarId] = useState("");
  const [syncMode, setSyncMode] = useState<"inbound" | "outbound" | "two_way">("two_way");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/integrations/calendar/connections/${connectionId}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error ?? "Calendar connection could not be loaded.");
        setData(json);
        setExternalCalendarId(json.externalCalendars.find((item: { primary?: boolean }) => item.primary)?.id ?? json.externalCalendars[0]?.id ?? "");
        setVenueCalendarId(json.venueCalendars[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Calendar connection could not be loaded."));
  }, [connectionId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      const external = data.externalCalendars.find((calendar) => calendar.id === externalCalendarId);
      const response = await fetch("/api/integrations/calendar/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          venueCalendarId,
          externalCalendarId,
          externalCalendarName: external?.name,
          syncMode,
          blockAvailability: true
        })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Calendar sync setup failed.");
      router.replace("/integrations?calendar_connected=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calendar sync setup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card setup-card calendar-setup-card">
        <span className="eyebrow">Two-way calendar sync</span>
        <h1>{data?.connection.name ?? "Choose calendars"}</h1>
        <p>Select exactly which external calendar maps to which VenueLoom calendar and how changes are allowed to flow.</p>
        {error && <div className="notice error">{error}</div>}
        {!data ? <div className="notice">Loading calendars…</div> : (
          <form className="auth-form" onSubmit={save}>
            <label>External calendar
              <select value={externalCalendarId} onChange={(e) => setExternalCalendarId(e.target.value)} required>
                {data.externalCalendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.primary ? " · Primary" : ""}</option>
                ))}
              </select>
            </label>
            <label>VenueLoom calendar
              <select value={venueCalendarId} onChange={(e) => setVenueCalendarId(e.target.value)} required>
                {data.venueCalendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>{calendar.name} · {calendar.timezone}</option>
                ))}
              </select>
            </label>
            <label>Sync direction
              <select value={syncMode} onChange={(e) => setSyncMode(e.target.value as typeof syncMode)}>
                <option value="two_way">Two-way — VenueLoom ↔ external</option>
                <option value="inbound">Inbound — external → VenueLoom</option>
                <option value="outbound">Outbound — VenueLoom → external</option>
              </select>
            </label>
            <div className="notice">External busy events block the selected VenueLoom calendar. VenueLoom-origin blocks are the only records eligible for write-back, preventing provider events from echoing back to their source.</div>
            <button className="button primary full" disabled={busy || !externalCalendarId || !venueCalendarId}>
              {busy ? "Connecting…" : "Connect calendars"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
