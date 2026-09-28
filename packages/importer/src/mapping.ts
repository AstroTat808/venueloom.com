import { importSchemas } from "./schemas";
import type { FieldMapping, ImportEntity } from "./types";
import type { ImportProviderProfile } from "./provider-profiles";

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function autoMapHeaders(entity: ImportEntity, headers: string[], profile?: ImportProviderProfile | null): FieldMapping {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header)
  }));

  const mapping: FieldMapping = {};
  for (const field of importSchemas[entity]) {
    const profileAliases = profile?.entityAliases[entity]?.[field.key] ?? [];
    const aliases = [field.label, field.key, ...field.aliases, ...profileAliases].map(normalizeHeader);
    const exact = normalizedHeaders.find((header) => aliases.includes(header.normalized));
    mapping[field.key] = exact?.original ?? null;
  }
  return mapping;
}

export function mappingCoverage(entity: ImportEntity, mapping: FieldMapping) {
  const schema = importSchemas[entity];
  const required = schema.filter((field) => field.required);
  const requiredMapped = required.filter((field) => Boolean(mapping[field.key]));
  return {
    totalFields: schema.length,
    mappedFields: schema.filter((field) => Boolean(mapping[field.key])).length,
    requiredFields: required.length,
    requiredMapped: requiredMapped.length,
    canPreview: requiredMapped.length === required.length
  };
}
