import * as XLSX from "xlsx";
import type { CellValue, ParsedSheet } from "./types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 25_000;

export function validateImportFile(fileName: string, byteLength: number) {
  const extension = fileName.toLowerCase().split(".").pop();
  if (!extension || !["csv", "xlsx", "xls"].includes(extension)) {
    throw new Error("Use a CSV, XLSX, or XLS file.");
  }
  if (byteLength > MAX_FILE_BYTES) {
    throw new Error("Import files must be 10 MB or smaller.");
  }
}

export function parseWorkbook(buffer: ArrayBuffer | Uint8Array): ParsedSheet[] {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    dense: false
  });

  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return { sheetName, headers: [], rows: [], rowCount: 0 };
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, CellValue>>(worksheet, {
      defval: null,
      raw: false
    });

    if (rows.length > MAX_ROWS) {
      throw new Error(`Sheet "${sheetName}" exceeds the 25,000-row import limit.`);
    }

    const headers = Array.from(
      new Set(rows.flatMap((row) => Object.keys(row)))
    );

    return { sheetName, headers, rows, rowCount: rows.length };
  });
}
