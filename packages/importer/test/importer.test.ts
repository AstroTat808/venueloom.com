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
