import assert from "node:assert/strict";
import test from "node:test";
import { autoMapHeaders, createImportPreview, mappingCoverage } from "../src/index";

test("auto maps common client headers", () => {
  const mapping = autoMapHeaders("clients", ["Full Name", "Email Address", "Phone Number"]);
  assert.equal(mapping.name, "Full Name");
  assert.equal(mapping.email, "Email Address");
  assert.equal(mapping.phone, "Phone Number");
  assert.equal(mappingCoverage("clients", mapping).canPreview, true);
});

test("preview normalizes money and skips likely duplicates", () => {
  const mapping = autoMapHeaders("payments", ["Transaction ID", "Payment Date", "Amount"]);
  const preview = createImportPreview(
    "payments",
    {
      sheetName: "Payments",
      headers: ["Transaction ID", "Payment Date", "Amount"],
      rowCount: 2,
      rows: [
        { "Transaction ID": "abc", "Payment Date": "2026-09-01", Amount: "$250.00" },
        { "Transaction ID": "abc", "Payment Date": "2026-09-01", Amount: "250" }
      ]
    },
    mapping
  );

  assert.equal(preview.rows[0]?.normalized.amount, 25000);
  assert.equal(preview.totals.create, 1);
  assert.equal(preview.totals.skip, 1);
});


test("detects Dubsado exports and maps project fields while preserving custom fields", async () => {
  const { detectImportProvider } = await import("../src/provider-profiles");
  const profile = detectImportProvider([
    "Project Title",
    "Lead Or Job",
    "Project Status",
    "Client First Name",
    "Client Last Name",
    "Client Email",
    "Start Date",
    "Favorite Venue Style"
  ]);
  assert.equal(profile?.id, "dubsado");

  const mapping = autoMapHeaders("events", [
    "Project Title",
    "Lead Or Job",
    "Project Status",
    "Client First Name",
    "Client Last Name",
    "Client Email",
    "Start Date",
    "Favorite Venue Style"
  ], profile);
  assert.equal(mapping.event_name, "Project Title");
  assert.equal(mapping.starts_at, "Start Date");

  const preview = createImportPreview("events", {
    sheetName: "Projects",
    headers: Object.values(mapping).filter((value): value is string => Boolean(value)),
    rowCount: 1,
    rows: [{
      "Project Title": "Smith Reception",
      "Lead Or Job": "Job",
      "Project Status": "Booked",
      "Client First Name": "Jordan",
      "Client Last Name": "Smith",
      "Client Email": "jordan@example.com",
      "Start Date": "2026-12-15T18:00:00-10:00",
      "Favorite Venue Style": "Garden"
    }]
  }, mapping, { preserveUnmappedFields: true, providerProfileId: "dubsado" });

  assert.equal(preview.rows[0]?.normalized.event_name, "Smith Reception");
  assert.equal(preview.rows[0]?.normalized.name, "Jordan Smith");
  assert.deepEqual(preview.rows[0]?.normalized.custom_fields, { "Favorite Venue Style": "Garden" });
});

test("detects HoneyBook contact/project-style exports", async () => {
  const { detectImportProvider } = await import("../src/provider-profiles");
  const headers = ["Contact Name", "Contact Email", "Project Name", "Project Type", "Pipeline Stage", "Lead Source"];
  const profile = detectImportProvider(headers);
  assert.equal(profile?.id, "honeybook");
  const mapping = autoMapHeaders("inquiries", headers, profile);
  assert.equal(mapping.name, "Contact Name");
  assert.equal(mapping.email, "Contact Email");
  assert.equal(mapping.event_name, "Project Name");
  assert.equal(mapping.status, "Pipeline Stage");
});
