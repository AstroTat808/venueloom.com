import assert from "node:assert/strict";
import test from "node:test";
import { buildLodgingCalendar, createOAuthState, parseLodgingCalendar } from "../src/index";

test("PKCE state and verifier are high entropy and hashable", () => {
  const oauth = createOAuthState();
  assert.ok(oauth.state.length >= 40);
  assert.ok(oauth.codeVerifier.length >= 50);
  assert.ok(oauth.codeChallenge.length >= 40);
  assert.notEqual(oauth.state, oauth.codeVerifier);
});

test("VenueLoom lodging calendar round-trips availability without guest PII", () => {
  const ics = buildLodgingCalendar({
    name: "Guest House",
    events: [{
      uid: "stay-123",
      startsOn: "2026-10-05",
      endsOn: "2026-10-08",
      summary: "Unavailable"
    }]
  });
  assert.match(ics, /SUMMARY:Unavailable/);
  const parsed = parseLodgingCalendar(ics);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.startsOn, "2026-10-05");
  assert.equal(parsed[0]?.endsOn, "2026-10-08");
  assert.equal(parsed[0]?.status, "confirmed");
});
