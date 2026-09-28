import * as ical from "node-ical";
import { createHash } from "node:crypto";

export interface LodgingCalendarStay {
  uid: string;
  startsOn: string;
  endsOn: string;
  status: "tentative" | "confirmed" | "cancelled" | "blocked";
  sourceHash: string;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseLodgingCalendar(icsText: string): LodgingCalendarStay[] {
  const parsed = ical.sync.parseICS(icsText);
  const stays: LodgingCalendarStay[] = [];
  for (const value of Object.values(parsed)) {
    if (!value || value.type !== "VEVENT" || !(value.start instanceof Date) || !(value.end instanceof Date)) continue;
    const statusText = String(value.status ?? "").toUpperCase();
    const status = statusText === "CANCELLED" ? "cancelled" : statusText === "TENTATIVE" ? "tentative" : "confirmed";
    const uid = String(value.uid ?? createHash("sha256").update(`${value.start.toISOString()}|${value.end.toISOString()}`).digest("hex"));
    const startsOn = dateOnly(value.start);
    const endsOn = dateOnly(value.end);
    if (endsOn <= startsOn) continue;
    stays.push({
      uid,
      startsOn,
      endsOn,
      status,
      sourceHash: createHash("sha256").update(`${uid}|${startsOn}|${endsOn}|${status}`).digest("hex")
    });
  }
  return stays;
}

function icsDate(value: string): string {
  return value.replaceAll("-", "");
}
function escapeIcs(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(";", "\\;").replaceAll("\n", "\\n");
}

export function buildLodgingCalendar(input: {
  name: string;
  events: Array<{ uid: string; startsOn: string; endsOn: string; summary?: string }>;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VenueLoom//Lodging Availability//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcs(input.name)}`
  ];
  for (const event of input.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(event.uid)}@venueloom`,
      `DTSTART;VALUE=DATE:${icsDate(event.startsOn)}`,
      `DTEND;VALUE=DATE:${icsDate(event.endsOn)}`,
      `SUMMARY:${escapeIcs(event.summary ?? "Unavailable")}`,
      "TRANSP:OPAQUE",
      "STATUS:CONFIRMED",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
