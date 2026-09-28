import assert from "node:assert/strict";
import test from "node:test";
import {
  applyProviderProfile,
  autoMapHeaders,
  detectProviderProfile,
  profileAliases
} from "../src/index";

test("detects and normalizes a Dubsado project export", () => {
  const headers = ["Project title", "Lead Or Job", "Project status", "Client first name", "Client last name", "Client email", "Start date", "Primary invoice paid", "Custom Ceremony Style"];
  const profile = detectProviderProfile(headers);
  assert.equal(profile?.id, "dubsado");

  const sheet = applyProviderProfile("dubsado", "events", {
    sheetName: "Projects",
    headers,
    rowCount: 1,
    rows: [{
      "Project title": "Santos Wedding",
      "Lead Or Job": "Job",
      "Project status": "Booked",
      "Client first name": "Ava",
      "Client last name": "Santos",
      "Client email": "ava@example.com",
      "Start date": "2027-06-10",
      "Primary invoice paid": "2500",
      "Custom Ceremony Style": "Garden"
    }]
  });

  const mapping = autoMapHeaders("events", sheet.headers, profileAliases("events", "dubsado"));
  assert.equal(mapping.name, "VenueLoom Name");
  assert.equal(mapping.event_name, "VenueLoom Event Name");
  assert.equal(mapping.starts_at, "VenueLoom Start");
  assert.equal(sheet.rows[0]?.["Custom Ceremony Style"], "Garden");
});

test("detects HoneyBook contacts and maps the core identity fields", () => {
  const headers = ["Contact Name", "Email", "Phone Number", "Notes"];
  assert.equal(detectProviderProfile(headers)?.id, "honeybook");
  const sheet = applyProviderProfile("honeybook", "clients", {
    sheetName: "Contacts",
    headers,
    rowCount: 1,
    rows: [{ "Contact Name": "Taylor Lee", Email: "taylor@example.com", "Phone Number": "8085550100", Notes: "VIP" }]
  });
  const mapping = autoMapHeaders("clients", sheet.headers, profileAliases("clients", "honeybook"));
  assert.ok(["Contact Name", "VenueLoom Name"].includes(mapping.name ?? ""));
  assert.ok(["Email", "VenueLoom Email"].includes(mapping.email ?? ""));
  assert.ok(["Notes", "VenueLoom Notes"].includes(mapping.notes ?? ""));
});
