import type { CellValue, FieldDefinition, RowIssue } from "./types";

function blank(value: CellValue | undefined) {
  return value === null || value === undefined || String(value).trim() === "";
}

function moneyToMinorUnits(value: CellValue): number | null {
  if (typeof value === "number") return Math.round(value * 100);
  const cleaned = String(value).replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function parseBoolean(value: CellValue): boolean | null {
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true","yes","y","1","active","enabled"].includes(normalized)) return true;
  if (["false","no","n","0","inactive","disabled"].includes(normalized)) return false;
  return null;
}

export function normalizeField(field: FieldDefinition, value: CellValue | undefined): {
  value: unknown;
  issue?: RowIssue;
} {
  if (blank(value)) {
    return field.required
      ? { value: null, issue: { field: field.key, code: "required", message: `${field.label} is required` } }
      : { value: null };
  }

  const raw = value as CellValue;
  switch (field.type) {
    case "email": {
      const email = String(raw).trim().toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? { value: email }
        : { value: email, issue: { field: field.key, code: "invalid_email", message: `${field.label} is not a valid email` } };
    }
    case "phone":
      return { value: String(raw).replace(/[^0-9+]/g, "") || null };
    case "integer": {
      const number = Number(String(raw).replace(/,/g, ""));
      return Number.isInteger(number)
        ? { value: number }
        : { value: raw, issue: { field: field.key, code: "invalid_number", message: `${field.label} must be a whole number` } };
    }
    case "money": {
      const minor = moneyToMinorUnits(raw);
      return minor !== null
        ? { value: minor }
        : { value: raw, issue: { field: field.key, code: "invalid_number", message: `${field.label} is not a valid amount` } };
    }
    case "date":
    case "datetime": {
      const parsed = new Date(String(raw));
      if (Number.isNaN(parsed.getTime())) {
        return { value: raw, issue: { field: field.key, code: "invalid_date", message: `${field.label} is not a valid date` } };
      }
      return {
        value: field.type === "date"
          ? parsed.toISOString().slice(0, 10)
          : parsed.toISOString()
      };
    }
    case "boolean": {
      const parsed = parseBoolean(raw);
      return parsed !== null
        ? { value: parsed }
        : { value: raw, issue: { field: field.key, code: "invalid_boolean", message: `${field.label} is not a valid yes/no value` } };
    }
    default:
      return { value: String(raw).trim() };
  }
}
