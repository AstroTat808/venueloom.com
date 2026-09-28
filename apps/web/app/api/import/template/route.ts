import { NextResponse } from "next/server";
import { importSchemas, type ImportEntity } from "@venueloom/importer";

const validEntities = new Set<ImportEntity>([
  "clients",
  "inquiries",
  "events",
  "invoices",
  "payments",
  "vendors",
  "staff"
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");

  if (!entity || !validEntities.has(entity as ImportEntity)) {
    return NextResponse.json({ error: "Choose a valid import entity." }, { status: 422 });
  }

  const fields = importSchemas[entity as ImportEntity];
  const headers = fields.map((field) => field.label.replaceAll('"', '""'));
  const sample = fields.map((field) => {
    if (field.type === "email") return "client@example.com";
    if (field.type === "phone") return "8085550100";
    if (field.type === "date") return "2026-12-31";
    if (field.type === "datetime") return "2026-12-31T18:00:00-10:00";
    if (field.type === "integer") return "100";
    if (field.type === "money") return "2500.00";
    if (field.type === "boolean") return "Yes";
    return field.required ? `Example ${field.label}` : "";
  });

  const csv = [
    headers.map((value) => `"${value}"`).join(","),
    sample.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")
  ].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="venueloom-${entity}-template.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
