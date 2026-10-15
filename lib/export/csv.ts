/** Spreadsheet export helpers (comma-separated values that Excel, Sheets, and LibreOffice open directly). */

export interface Column<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

export function cell(v: string | number | null | undefined) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: Column<T>[]) {
  return [columns.map((c) => cell(c.header)).join(","), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(","))].join("\r\n");
}

/** Triggers a browser download; the byte order mark makes Excel read UTF-8 correctly. */
export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿", text], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
