import { createHash } from "node:crypto";
import {
  applyProviderProfile,
  autoMapHeaders,
  createImportPreview,
  detectProviderProfile,
  mappingCoverage,
  parseImportFile,
  profileAliases,
  validateImportFile,
  type FieldMapping,
  type ImportEntity
} from "@venueloom/importer";
import { commitImport } from "@venueloom/database";
import { errorResponse, requireWorkspace, verifyMutationOrigin } from "../../../../lib/auth";

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
    verifyMutationOrigin(request);
    const { principal } = await requireWorkspace(request);
    const formData = await request.formData();
    const file = formData.get("file");
    const entity = formData.get("entity");
    const venueId = formData.get("venueId");

    if (!(file instanceof File)) {
      return Response.json({ error: "Choose a CSV or XLSX file." }, { status: 422 });
    }
    if (typeof entity !== "string" || !validEntities.has(entity as ImportEntity)) {
      return Response.json({ error: "Choose a valid VenueLoom record type." }, { status: 422 });
    }

    validateImportFile(file.name, file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sourceHash = createHash("sha256").update(bytes).digest("hex");
    const sheets = await parseImportFile(file.name, bytes);
    const requestedSheet = formData.get("sheet");
    const rawSheet =
      typeof requestedSheet === "string" && requestedSheet
        ? sheets.find((candidate) => candidate.sheetName === requestedSheet)
        : sheets[0];

    if (!rawSheet || rawSheet.rowCount === 0) {
      return Response.json({ error: "The selected sheet does not contain importable rows." }, { status: 422 });
    }

    const detected = detectProviderProfile(rawSheet.headers);
    const sheet = applyProviderProfile(detected?.id ?? null, entity as ImportEntity, rawSheet);
    const rawMapping = formData.get("mapping");
    const mapping: FieldMapping =
      typeof rawMapping === "string" && rawMapping
        ? JSON.parse(rawMapping)
        : autoMapHeaders(entity as ImportEntity, sheet.headers, profileAliases(entity as ImportEntity, detected?.id ?? null));

    const coverage = mappingCoverage(entity as ImportEntity, mapping);
    if (!coverage.canPreview) {
      return Response.json({ error: "Map all required fields before committing." }, { status: 422 });
    }

    const preview = createImportPreview(entity as ImportEntity, sheet, mapping);
    const requestedVenueId = typeof venueId === "string" && venueId ? venueId : null;

    if ((entity === "events" || entity === "inquiries") && !requestedVenueId) {
      return Response.json({ error: "Select a venue for event and inquiry imports." }, { status: 422 });
    }

    const result = await commitImport(principal, {
      entity: entity as ImportEntity,
      sourceName: file.name,
      sourceHash,
      mapping,
      rows: preview.rows,
      venueId: requestedVenueId
    });

    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
