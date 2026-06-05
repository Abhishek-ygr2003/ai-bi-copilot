import * as XLSX from "xlsx";
import type { Dataset } from "./types";
import { calculateColumnMetrics, normalizeCellValue } from "./lib/analytics";

export type UploadSourceType = "csv" | "xlsx" | "xls" | "tsv" | "json" | "manual";

function inferSourceType(fileName: string): UploadSourceType {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "xlsx") return "xlsx";
  if (extension === "xls") return "xls";
  if (extension === "tsv") return "tsv";
  if (extension === "json") return "json";
  return "csv";
}

function trimHeader(header: unknown, fallbackIndex: number): string {
  const text = String(header ?? "").trim();
  return text || `Column ${fallbackIndex + 1}`;
}

function ensureUniqueHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((header) => {
    const count = counts.get(header) ?? 0;
    counts.set(header, count + 1);
    return count === 0 ? header : `${header}_${count + 1}`;
  });
}

function buildDataset(name: string, headers: string[], rows: Record<string, any>[], sourceType: UploadSourceType, sheetName?: string): Dataset {
  const cleanedHeaders = ensureUniqueHeaders(headers);
  const normalizedRows = rows.map((row) => {
    const nextRow: Record<string, any> = {};
    cleanedHeaders.forEach((header, index) => {
      const originalValue = row[header] ?? row[index];
      nextRow[header] = normalizeCellValue(originalValue);
    });
    return nextRow;
  });

  return {
    name,
    sourceType,
    sheetName,
    headers: cleanedHeaders,
    rows: normalizedRows,
    metrics: calculateColumnMetrics(cleanedHeaders, normalizedRows),
  };
}

function parseDelimitedRows(rawText: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  const pushCell = () => {
    currentRow.push(currentCell);
    currentCell = "";
  };

  const pushRow = () => {
    if (currentRow.length > 0 || currentCell.length > 0) {
      pushCell();
      rows.push(currentRow);
    }
    currentRow = [];
    currentCell = "";
  };

  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index];
    const next = rawText[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      pushRow();
      continue;
    }

    if (!inQuotes && char === delimiter) {
      pushCell();
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    pushRow();
  }

  return rows.filter((row) => row.some((value) => String(value).trim().length > 0));
}

export function parseCSV(rawText: string, name = "Custom Dataset"): Dataset {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Empty file uploaded");
  }

  const rawRows = parseDelimitedRows(trimmed, ",");
  if (rawRows.length === 0) {
    throw new Error("Unable to read CSV data");
  }

  const headers = rawRows[0].map((header, index) => trimHeader(header, index));
  const bodyRows = rawRows.slice(1).map((row) => {
    const mapped: Record<string, any> = {};
    headers.forEach((header, index) => {
      mapped[header] = normalizeCellValue(row[index]);
    });
    return mapped;
  });

  return buildDataset(name, headers, bodyRows, "csv");
}

export async function parseWorkbookFile(file: File): Promise<Dataset> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    dense: false,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("The workbook does not contain any sheets.");
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: true,
  }) as unknown[][];

  if (matrix.length === 0) {
    throw new Error("The workbook sheet is empty.");
  }

  const headers = ensureUniqueHeaders(matrix[0].map((header, index) => trimHeader(header, index)));
  const bodyRows = matrix.slice(1).map((row) => {
    const mapped: Record<string, any> = {};
    headers.forEach((header, index) => {
      mapped[header] = normalizeCellValue(row[index]);
    });
    return mapped;
  });

  return buildDataset(file.name.replace(/\.[^.]+$/, ""), headers, bodyRows, inferSourceType(file.name), sheetName);
}
