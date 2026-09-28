import ical from "node-ical";
import type { ExternalCalendarEvent } from "./calendar-types";

export function parseRentalIcal(text: string): ExternalCalendarEvent[] {
  const parsed = ical.sync.parseICS(text);
  const events: ExternalCalendarEvent[] = [];

  for (const value of Object.values(parsed)) {
    if (!value || value.type !== "VEVENT" || !value.uid || !value.start || !value.end) continue;
    events.push({
      id: String(value.uid),
      summary: typeof value.summary === "string" ? value.summary : "Reserved",
      startsAt: new Date(value.start),
      endsAt: new Date(value.end),
      allDay: Boolean((value.start as Date & { dateOnly?: boolean }).dateOnly),
      status: String(value.status ?? "").toUpperCase() === "CANCELLED" ? "cancelled" : "busy",
      updatedAt: value.lastmodified ? new Date(value.lastmodified) : null,
      version: value.sequence !== undefined ? String(value.sequence) : null,
      payloadHashSource: {
        uid: value.uid,
        start: value.start,
        end: value.end,
        summary: value.summary,
        status: value.status,
        sequence: value.sequence
      }
    });
  }

  return events;
}

function esc(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function utc(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildVenueLoomIcal(input: {
  name: string;
  events: Array<{ id: string; summary: string | null; starts_at: Date; ends_at: Date; all_day: boolean }>;
}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VenueLoom//Rental Availability//EN",
    `X-WR-CALNAME:${esc(input.name)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];
  for (const event of input.events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}@venueloom`);
    lines.push(`DTSTAMP:${utc(new Date())}`);
    if (event.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${event.starts_at.toISOString().slice(0, 10).replaceAll("-", "")}`);
      lines.push(`DTEND;VALUE=DATE:${event.ends_at.toISOString().slice(0, 10).replaceAll("-", "")}`);
    } else {
      lines.push(`DTSTART:${utc(event.starts_at)}`);
      lines.push(`DTEND:${utc(event.ends_at)}`);
    }
    lines.push(`SUMMARY:${esc(event.summary ?? "Unavailable")}`);
    lines.push("STATUS:CONFIRMED");
    lines.push("TRANSP:OPAQUE");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
