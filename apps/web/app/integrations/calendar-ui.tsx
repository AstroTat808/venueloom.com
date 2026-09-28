"use client";

import { useEffect, useState } from "react";

type Venue = { id: string; name: string };
type Connection = {
  id: string;
  provider_code: "google-calendar" | "outlook-calendar";
  connection_name: string;
  status: string;
  bindings: Array<{
    id: string;
    venueId: string;
    calendarId: string;
    calendarName: string;
    direction: string;
    blockAvailability: boolean;
    enabled: boolean;
    lastSyncedAt?: string | null;
    lastError?: string | null;
  }>;
};

export function CalendarSyncPanel({ venues }: { venues: Venue[] }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [calendars, setCalendars] = useState<Record<string, Array<{ id: string; name: string; primary?: boolean; writable?: boolean }>>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const response = await fetch("/api/integrations/calendar", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Unable to load calendar connections"); return; }
    setConnections(data.connections ?? []);
  }

  useEffect(() => { void load(); }, []);

  async function loadCalendars(connectionId: string) {
    setBusy(connectionId);
    setError("");
    const response = await fetch(`/api/integrations/calendar/${connectionId}/calendars`, { cache: "no-store" });
    const data = await response.json();
    setBusy("");
    if (!response.ok) { setError(data.error ?? "Unable to read calendars"); return; }
    setCalendars((current) => ({ ...current, [connectionId]: data.calendars ?? [] }));
  }

  async function saveBinding(connectionId: string, calendar: { id: string; name: string }, form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(`${connectionId}:${calendar.id}`);
    const response = await fetch("/api/integrations/calendar/bindings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId,
        calendarId: calendar.id,
        calendarName: calendar.name,
        venueId: data.get("venueId"),
        direction: data.get("direction"),
        blockAvailability: data.get("blockAvailability") === "on"
      })
    });
    const result = await response.json();
    setBusy("");
    if (!response.ok) { setError(result.error ?? "Unable to save calendar"); return; }
    await load();
  }

  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Native calendar sync</span>
          <h2>Google and Outlook, synchronized both ways.</h2>
          <p>Choose exactly which external calendars map to each VenueLoom venue. External busy events can block availability; VenueLoom events can be written back.</p>
        </div>
        <div className="calendar-connect-actions">
          <a className="button primary" href="/api/integrations/calendar/google/authorize">Connect Google Calendar</a>
          <a className="button secondary" href="/api/integrations/calendar/microsoft/authorize">Connect Outlook</a>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}

      {!connections.length ? (
        <div className="empty-state compact">
          <div className="empty-orbit">↔</div>
          <h3>No calendar account connected yet.</h3>
          <p>Authorize Google or Microsoft, then choose calendars and sync direction. OAuth tokens stay encrypted at rest.</p>
        </div>
      ) : (
        <div className="connection-stack">
          {connections.map((connection) => (
            <article className="connection-card" key={connection.id}>
              <div className="connection-head">
                <div>
                  <span className="eyebrow">{connection.provider_code === "google-calendar" ? "Google Calendar" : "Microsoft Outlook"}</span>
                  <h3>{connection.connection_name}</h3>
                </div>
                <button className="button secondary" disabled={busy === connection.id} onClick={() => void loadCalendars(connection.id)}>
                  {busy === connection.id ? "Loading…" : "Choose calendars"}
                </button>
              </div>

              {connection.bindings?.length > 0 && (
                <div className="binding-list">
                  {connection.bindings.map((binding) => (
                    <div className="binding-row" key={binding.id}>
                      <div><strong>{binding.calendarName}</strong><span>{binding.direction.replace("_"," ")} · {binding.blockAvailability ? "blocks availability" : "reference only"}</span></div>
                      <div><span>{binding.lastError ? "Needs attention" : "Healthy"}</span><small>{binding.lastSyncedAt ? new Date(binding.lastSyncedAt).toLocaleString() : "Initial sync queued"}</small></div>
                    </div>
                  ))}
                </div>
              )}

              {calendars[connection.id] && (
                <div className="external-calendar-list">
                  {calendars[connection.id].map((calendar) => (
                    <form
                      key={calendar.id}
                      className="external-calendar-row"
                      onSubmit={(event) => { event.preventDefault(); void saveBinding(connection.id, calendar, event.currentTarget); }}
                    >
                      <div><strong>{calendar.name}</strong><span>{calendar.primary ? "Primary calendar" : calendar.writable ? "Writable calendar" : "Read-only calendar"}</span></div>
                      <select name="venueId" defaultValue={venues[0]?.id} required>
                        {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                      </select>
                      <select name="direction" defaultValue={calendar.writable === false ? "inbound" : "two_way"}>
                        <option value="two_way" disabled={calendar.writable === false}>Two-way</option>
                        <option value="inbound">Into VenueLoom</option>
                        <option value="outbound" disabled={calendar.writable === false}>From VenueLoom</option>
                      </select>
                      <label className="inline-check"><input name="blockAvailability" type="checkbox" defaultChecked /> Block availability</label>
                      <button className="button primary" disabled={busy === `${connection.id}:${calendar.id}`}>Sync</button>
                    </form>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <div className="notice">
        VenueLoom uses provider notifications as a wake-up signal and then reconciles with Google sync tokens or Microsoft delta links. Conflicting changes to protected event dates are sent to Conflict Resolution instead of silently overwriting a booking.
      </div>
    </section>
  );
}
