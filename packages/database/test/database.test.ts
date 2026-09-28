import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLodgingCalendarUrl } from "../src/lodging";

test("lodging calendar URL accepts approved Airbnb and Vrbo HTTPS hosts", () => {
  assert.equal(
    normalizeLodgingCalendarUrl("airbnb", "webcal://www.airbnb.com/calendar/ical/example.ics"),
    "https://www.airbnb.com/calendar/ical/example.ics"
  );
  assert.equal(
    normalizeLodgingCalendarUrl("vrbo", "https://www.vrbo.com/icalendar/example.ics"),
    "https://www.vrbo.com/icalendar/example.ics"
  );
});

test("lodging calendar URL rejects arbitrary hosts and plaintext HTTP", () => {
  assert.throws(() => normalizeLodgingCalendarUrl("airbnb", "https://evil.example/airbnb.ics"), /approved airbnb host/i);
  assert.throws(() => normalizeLodgingCalendarUrl("vrbo", "http://www.vrbo.com/calendar.ics"), /HTTPS/i);
});
