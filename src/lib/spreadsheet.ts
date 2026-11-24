/**
 * Excel helpers (browser). `exceljs` is loaded on demand so it never weighs on page bundles.
 */

export type SheetColumn<Row> = {
  header: string;
  /** Column width in characters. */
  width?: number;
  value: (row: Row) => string | number | null | undefined;
};

/** Builds a real .xlsx workbook (bold, frozen header row) and starts the download. */
export async function downloadWorkbook<Row>({
  filename,
  sheetName,
  columns,
  rows,
}: {
  filename: string;
  sheetName: string;
  columns: SheetColumn<Row>[];
  rows: Row[];
}): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BCMS";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({
    header: column.header,
    width: column.width ?? Math.max(12, column.header.length + 4),
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(columns.map((column) => column.value(row) ?? ""));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export type WorkbookSheet = {
  sheetName: string;
  columns: SheetColumn<Record<string, string | number | null>>[];
  rows: Record<string, string | number | null>[];
};

/** Builds one .xlsx with several sheets (bold, frozen header rows) and starts the download. */
export async function downloadWorkbookSheets(filename: string, sheets: WorkbookSheet[]): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BCMS";
  workbook.created = new Date();
  for (const s of sheets) {
    const sheet = workbook.addWorksheet(s.sheetName.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = s.columns.map((column) => ({
      header: column.header,
      width: column.width ?? Math.max(12, column.header.length + 4),
    }));
    sheet.getRow(1).font = { bold: true };
    for (const row of s.rows) sheet.addRow(s.columns.map((column) => column.value(row) ?? ""));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Reads the first sheet of an .xlsx or a .csv file into header-keyed rows (headers trimmed, lower-cased). */
export async function readSpreadsheetRows(file: File): Promise<Record<string, string>[]> {
  let table: string[][];
  if (file.name.toLowerCase().endsWith(".csv")) {
    table = parseCsv(await file.text());
  } else {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    table = [];
    sheet?.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as unknown[];
      table.push(values.slice(1).map((v) => (v == null ? "" : String(v instanceof Date ? v.toISOString().slice(0, 10) : v))));
    });
  }
  const [header, ...body] = table;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body
    .filter((cells) => cells.some((c) => c.trim()))
    .map((cells) => Object.fromEntries(keys.map((key, i) => [key, (cells[i] ?? "").trim()])));
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
