/**
 * Turns uploaded or pasted tables into rows of strings without external libraries.
 * CSV and tab-separated text (spreadsheet paste) are parsed directly; .xlsx files are read
 * with the browser's built-in DecompressionStream and DOMParser.
 */

/** Parses comma- or tab-separated text, honoring quoted fields with embedded separators and line breaks. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

async function inflate(data: Uint8Array) {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Minimal ZIP reader: returns the named entries' bytes (stored or deflated). */
async function unzip(buffer: ArrayBuffer, wanted: (name: string) => boolean) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This file is not a valid .xlsx spreadsheet.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (wanted(name)) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + size);
      out.set(name, method === 0 ? raw : await inflate(raw));
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const columnIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Reads the first worksheet of an .xlsx file into rows of strings. */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buffer, (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sheetName = [...files.keys()].filter((n) => n.startsWith("xl/worksheets/")).sort()[0];
  if (!sheetName) throw new Error("The spreadsheet has no worksheet.");
  const decoder = new TextDecoder();
  const parse = (xml: Uint8Array) => new DOMParser().parseFromString(decoder.decode(xml), "application/xml");

  const shared = files.has("xl/sharedStrings.xml")
    ? [...parse(files.get("xl/sharedStrings.xml")!).getElementsByTagName("si")].map((si) => [...si.getElementsByTagName("t")].map((t) => t.textContent ?? "").join(""))
    : [];

  const rows: string[][] = [];
  for (const r of parse(files.get(sheetName)!).getElementsByTagName("row")) {
    const row: string[] = [];
    for (const c of r.getElementsByTagName("c")) {
      const type = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? c.getElementsByTagName("t")[0]?.textContent ?? "" : v;
      row[columnIndex(c.getAttribute("r") ?? "A")] = value;
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Maps the header row onto known column keys (case, spacing, and punctuation insensitive). */
export function rowsToRecords(rows: string[][], columns: { key: string; header: string }[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const [header = [], ...body] = rows;
  const index = columns.map((c) => header.findIndex((h) => [norm(c.header), norm(c.key)].includes(norm(h))));
  const missing = columns.filter((_, i) => index[i] < 0).map((c) => c.header);
  const records = body.map((r) => Object.fromEntries(columns.map((c, i) => [c.key, (index[i] >= 0 ? r[index[i]] ?? "" : "").trim()])));
  return { records, missing };
}
