import { importSchemas } from "./schemas";
import { normalizeField } from "./normalize";
import type { FieldMapping, ImportEntity, ImportPreview, ParsedSheet, PreviewRow } from "./types";

function duplicateKey(entity: ImportEntity, row: Record<string, unknown>): string | null {
  switch (entity) {
    case "clients":
      return row.email ? `email:${row.email}` : row.name ? `name:${String(row.name).toLowerCase()}` : null;
    case "inquiries":
      return row.email && row.proposed_date ? `${row.email}|${row.proposed_date}` : null;
    case "events":
      return row.email && row.starts_at ? `${row.email}|${row.starts_at}` : row.event_name && row.starts_at ? `${row.event_name}|${row.starts_at}` : null;
    case "invoices":
      return row.invoice_number ? `invoice:${row.invoice_number}` : null;
    case "payments":
      return row.reference ? `payment:${row.reference}` : null;
    case "vendors":
      return row.email ? `email:${row.email}` : row.name ? `name:${String(row.name).toLowerCase()}` : null;
    case "staff":
      return row.email ? `email:${row.email}` : row.name ? `name:${String(row.name).toLowerCase()}` : null;
  }
}

export function createImportPreview(
  entity: ImportEntity,
  sheet: ParsedSheet,
  mapping: FieldMapping,
  options?: { preserveUnmappedFields?: boolean; providerProfileId?: string }
): ImportPreview {
  const schema = importSchemas[entity];
  const firstSeen = new Map<string, number>();

  const rows: PreviewRow[] = sheet.rows.map((source, index) => {
    const normalized: Record<string, unknown> = {};
    const issues = [];

    for (const field of schema) {
      const sourceHeader = mapping[field.key];
      let sourceValue = sourceHeader ? source[sourceHeader] : undefined;
      if (
        options?.providerProfileId === "dubsado" &&
        (field.key === "name" || field.key === "client_name")
      ) {
        const firstHeader = Object.keys(source).find((header) => header.toLowerCase().replace(/[^a-z0-9]/g, "") === "clientfirstname");
        const lastHeader = Object.keys(source).find((header) => header.toLowerCase().replace(/[^a-z0-9]/g, "") === "clientlastname");
        const fullName = [firstHeader ? source[firstHeader] : null, lastHeader ? source[lastHeader] : null]
          .filter((value) => value !== null && value !== undefined && String(value).trim())
          .map((value) => String(value).trim())
          .join(" ");
        if (fullName) sourceValue = fullName;
      }
      const result = normalizeField(field, sourceValue);
      normalized[field.key] = result.value;
      if (result.issue) issues.push(result.issue);
    }

    if (options?.preserveUnmappedFields) {
      const mappedHeaders = new Set(Object.values(mapping).filter((value): value is string => Boolean(value)));
      if (options.providerProfileId === "dubsado" && (mapping.name || mapping.client_name)) {
        for (const header of Object.keys(source)) {
          const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (normalized === "clientfirstname" || normalized === "clientlastname") mappedHeaders.add(header);
        }
      }
      const customFields = Object.fromEntries(Object.entries(source).filter(([header, value]) => !mappedHeaders.has(header) && value !== null && value !== ""));
      if (Object.keys(customFields).length) normalized.custom_fields = customFields;
    }

    const rowNumber = index + 2;
    const key = duplicateKey(entity, normalized);
    let duplicateOfRow: number | undefined;
    if (key && firstSeen.has(key)) {
      duplicateOfRow = firstSeen.get(key);
      issues.push({
        code: "duplicate_in_file" as const,
        message: `Likely duplicate of source row ${duplicateOfRow}`
      });
    } else if (key) {
      firstSeen.set(key, rowNumber);
    }

    const fatalIssues = issues.filter((issue) => issue.code !== "duplicate_in_file");
    return {
      rowNumber,
      source,
      normalized,
      issues,
      outcome: fatalIssues.length ? "error" : duplicateOfRow ? "skip" : "create",
      duplicateOfRow
    };
  });

  return {
    entity,
    rows,
    totals: {
      discovered: rows.length,
      create: rows.filter((row) => row.outcome === "create").length,
      skip: rows.filter((row) => row.outcome === "skip").length,
      error: rows.filter((row) => row.outcome === "error").length
    }
  };
}
