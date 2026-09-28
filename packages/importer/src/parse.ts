import { parse as parseCsv } from "csv-parse/sync";
import readExcelFile from "read-excel-file/node";
import type { CellValue, ParsedSheet } from "./types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 25_000;

export function validateImportFile(fileName: string, byteLength: number) {
  const extension = fileName.toLowerCase().split(".").pop();
  if (!extension || !["csv", "xlsx"].includes(extension)) {
    throw new Error("Use a CSV or XLSX file.");
  }
  if (byteLength > MAX_FILE_BYTES) {
    throw new Error("Import files must be 10 MB or smaller.");
  }
}

function normalizeCell(value: unknown): CellValue {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function normalizeObjectRows(rows: Record<string, unknown>[]): ParsedSheet {
  if (rows.length > MAX_ROWS) throw new Error("The import exceeds the 25,000-row limit.");
  const normalized = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim(), normalizeCell(value)]))
  );
  const headers = Array.from(new Set(normalized.flatMap((row) => Object.keys(row))));
  return { sheetName: "CSV", headers, rows: normalized, rowCount: normalized.length };
}

function matrixToSheet(sheetName: string, data: unknown[][]): ParsedSheet {
  const nonEmpty = data.filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""));
  if (!nonEmpty.length) return { sheetName, headers: [], rows: [], rowCount: 0 };

  const headers = nonEmpty[0]!.map((cell, index) => String(cell ?? `Column ${index + 1}`).trim());
  const dataRows = nonEmpty.slice(1);
  if (dataRows.length > MAX_ROWS) throw new Error(`Sheet "${sheetName}" exceeds the 25,000-row import limit.`);

  const rows = dataRows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row[index])]))
  );
  return { sheetName, headers, rows, rowCount: rows.length };
}

export async function parseImportFile(fileName: string, bytes: ArrayBuffer | Uint8Array): Promise<ParsedSheet[]> {
  const extension = fileName.toLowerCase().split(".").pop();

  if (extension === "csv") {
    const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    const records = parseCsv(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: false,
      max_record_size: 1024 * 1024
    }) as Record<string, unknown>[];
    return [normalizeObjectRows(records)];
  }

  if (extension === "xlsx") {
    const buffer = Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const sheets = await readExcelFile(buffer);
    return sheets.map((sheet) => matrixToSheet(sheet.sheet, sheet.data));
  }

  throw new Error("Use a CSV or XLSX file.");
}
