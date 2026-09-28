import { verifyRequestOrigin } from "@netlify/identity";
import { NextResponse } from "next/server";
import {
  autoMapHeaders,
  createImportPreview,
  mappingCoverage,
  parseImportFile,
  validateImportFile,
  type FieldMapping,
  type ImportEntity,
  detectImportProvider
} from "@venueloom/importer";
import { getIntegrationAdminSession } from "../../../../lib/auth";

export const runtime = "nodejs";

const validEntities = new Set<ImportEntity>([
  "clients",
  "inquiries",
  "events",
  "invoices",
  "payments",
  "vendors",
  "staff"
]);

export async function POST(request: Request) {
  try {
    verifyRequestOrigin(request);
  } catch {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const tenant = await getIntegrationAdminSession();
  if (!tenant) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  const entity = formData.get("entity");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a CSV or XLSX file." }, { status: 422 });
  }
  if (typeof entity !== "string" || !validEntities.has(entity as ImportEntity)) {
    return NextResponse.json({ error: "Choose a valid VenueLoom record type." }, { status: 422 });
  }

  try {
    validateImportFile(file.name, file.size);
    const sheets = await parseImportFile(file.name, await file.arrayBuffer());
    const requestedSheet = formData.get("sheet");
    const sheet =
      typeof requestedSheet === "string" && requestedSheet
        ? sheets.find((candidate) => candidate.sheetName === requestedSheet)
        : sheets[0];

    if (!sheet || sheet.rowCount === 0) {
      return NextResponse.json({ error: "The selected sheet does not contain importable rows.", sheets }, { status: 422 });
    }

    const rawMapping = formData.get("mapping");
    const mapping: FieldMapping =
      typeof rawMapping === "string" && rawMapping
        ? JSON.parse(rawMapping)
        : autoMapHeaders(entity as ImportEntity, sheet.headers, detectImportProvider(sheet.headers));

    const providerProfile = detectImportProvider(sheet.headers);
    const coverage = mappingCoverage(entity as ImportEntity, mapping);
    const preview = coverage.canPreview
      ? createImportPreview(entity as ImportEntity, sheet, mapping, { preserveUnmappedFields: providerProfile?.preserveUnmappedFields, providerProfileId: providerProfile?.id })
      : null;

    return NextResponse.json({
      file: { name: file.name, size: file.size },
      sheets: sheets.map(({ sheetName, rowCount, headers }) => ({ sheetName, rowCount, headers })),
      selectedSheet: sheet.sheetName,
      entity,
      mapping,
      detectedProvider: providerProfile ? { id: providerProfile.id, name: providerProfile.name } : null,
      coverage,
      preview
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The import could not be parsed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
