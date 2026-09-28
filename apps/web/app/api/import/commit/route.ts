import { verifyRequestOrigin } from "@netlify/identity";
import { NextResponse } from "next/server";
import {
  commitImportPreview,
  sha256,
  withTenantTransaction
} from "@venueloom/database";
import {
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

const validEntities = new Set<ImportEntity>(["clients","inquiries","events","invoices","payments","vendors","staff"]);

export async function POST(request: Request) {
  try {
    verifyRequestOrigin(request);
    const tenant = await getIntegrationAdminSession();
    if (!tenant) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    const entity = form.get("entity");
    const rawMapping = form.get("mapping");
    const requestedSheet = form.get("sheet");
    const venueId = form.get("venueId");

    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a CSV or XLSX file." }, { status: 422 });
    if (typeof entity !== "string" || !validEntities.has(entity as ImportEntity)) {
      return NextResponse.json({ error: "Choose a valid import type." }, { status: 422 });
    }
    if (typeof rawMapping !== "string" || !rawMapping) {
      return NextResponse.json({ error: "Confirm the field mapping before importing." }, { status: 422 });
    }

    validateImportFile(file.name, file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sheets = await parseImportFile(file.name, bytes);
    const sheet = typeof requestedSheet === "string" && requestedSheet
      ? sheets.find((candidate) => candidate.sheetName === requestedSheet)
      : sheets[0];
    if (!sheet) return NextResponse.json({ error: "Selected worksheet was not found." }, { status: 422 });

    const mapping = JSON.parse(rawMapping) as FieldMapping;
    const providerProfile = detectImportProvider(sheet.headers);
    const coverage = mappingCoverage(entity as ImportEntity, mapping);
    if (!coverage.canPreview) return NextResponse.json({ error: "Required fields are not fully mapped." }, { status: 422 });

    const preview = createImportPreview(entity as ImportEntity, sheet, mapping, { preserveUnmappedFields: providerProfile?.preserveUnmappedFields, providerProfileId: providerProfile?.id });
    if (preview.totals.error > 0) {
      return NextResponse.json({ error: "Resolve validation errors before committing.", preview }, { status: 422 });
    }

    const result = await withTenantTransaction(
      tenant.identity,
      tenant.session.organizationId,
      (client, session) => commitImportPreview(client, session, {
        entity: entity as ImportEntity,
        sourceName: file.name,
        sourceSha256: sha256(bytes),
        mapping,
        preview,
        venueId: typeof venueId === "string" && venueId ? venueId : null
      })
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 });
  }
}
