export type ImportEntity =
  | "clients"
  | "inquiries"
  | "events"
  | "invoices"
  | "payments"
  | "vendors"
  | "staff";

export type CellValue = string | number | boolean | null;

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: Record<string, CellValue>[];
  rowCount: number;
}

export interface FieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
  type: "string" | "email" | "phone" | "date" | "datetime" | "integer" | "money" | "boolean";
}

export type FieldMapping = Record<string, string | null>;

export interface RowIssue {
  field?: string;
  code:
    | "required"
    | "invalid_email"
    | "invalid_date"
    | "invalid_number"
    | "invalid_boolean"
    | "duplicate_in_file";
  message: string;
}

export interface PreviewRow {
  rowNumber: number;
  source: Record<string, CellValue>;
  normalized: Record<string, unknown>;
  issues: RowIssue[];
  outcome: "create" | "skip" | "error";
  duplicateOfRow?: number;
}

export interface ImportPreview {
  entity: ImportEntity;
  rows: PreviewRow[];
  totals: {
    discovered: number;
    create: number;
    skip: number;
    error: number;
  };
}
