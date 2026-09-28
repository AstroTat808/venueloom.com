import assert from "node:assert/strict";
import test from "node:test";
import { buildVenueLoomIcal, parseRentalIcal } from "../src/index";

test("parses a rental reservation iCalendar", () => {
  const input = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:reservation-1",
    "DTSTART;VALUE=DATE:20261010",
    "DTEND;VALUE=DATE:20261013",
    "SUMMARY:Reserved",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const events = parseRentalIcal(input);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, "reservation-1");
  assert.equal(events[0]?.status, "busy");
});

test("builds a VenueLoom availability feed", () => {
  const feed = buildVenueLoomIcal({
    name: "Main House",
    events: [{
      id: "block-1",
      summary: "Unavailable",
      starts_at: new Date("2026-10-10T10:00:00Z"),
      ends_at: new Date("2026-10-11T10:00:00Z"),
      all_day: false
    }]
  });
  assert.match(feed, /BEGIN:VCALENDAR/);
  assert.match(feed, /UID:block-1@venueloom/);
  assert.match(feed, /SUMMARY:Unavailable/);
});
