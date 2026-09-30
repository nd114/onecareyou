/**
 * Just enough of Word (.docx) and Excel (.xlsx) to read them in the platform.
 *
 * Both are zip archives of XML. The browser already carries everything needed
 * to open them — DecompressionStream for the deflate and DOMParser for the XML
 * — so no parser library, and nothing ever leaves the device. The output is
 * plain data (paragraphs, runs, cells), never an HTML string: the viewer turns
 * it into React elements, so there is no markup to sanitise and nothing in the
 * document can become a script.
 *
 * Deliberately partial. What it does not carry over — images, headers,
 * footers, charts, formulas — is counted and said, not silently dropped.
 */

const MAX_ENTRY_BYTES = 40 * 1024 * 1024;

interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

export class OoxmlError extends Error {}

function u16(v: DataView, o: number) {
  return v.getUint16(o, true);
}
function u32(v: DataView, o: number) {
  return v.getUint32(o, true);
}

/** Reads the central directory. Zip64 and encrypted archives are refused. */
export function readZipDirectory(buf: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buf);
  const min = Math.max(0, buf.byteLength - 65557);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= min; i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new OoxmlError('Not a readable Office file');
  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  if (p === 0xffffffff) throw new OoxmlError('This file is too large to preview');
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.byteLength || u32(view, p) !== 0x02014b50) throw new OoxmlError('Damaged Office file');
    const flags = u16(view, p + 8);
    const method = u16(view, p + 10);
    const compressedSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const localOffset = u32(view, p + 42);
    const name = decoder.decode(new Uint8Array(buf, p + 46, nameLen));
    if (flags & 1) throw new OoxmlError('This document is password-protected');
    entries.set(name, { method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new OoxmlError('This browser cannot open Office files for preview');
  }
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    // The declared size is the uploader's claim; a small archive that
    // inflates without end would otherwise take the tab down with it.
    if (total > MAX_ENTRY_BYTES) {
      await reader.cancel();
      throw new OoxmlError('This document is too large to preview');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

export async function readZipText(buf: ArrayBuffer, entries: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const e = entries.get(name);
  if (!e) return null;
  const view = new DataView(buf);
  if (u32(view, e.localOffset) !== 0x04034b50) throw new OoxmlError('Damaged Office file');
  const start = e.localOffset + 30 + u16(view, e.localOffset + 26) + u16(view, e.localOffset + 28);
  const raw = new Uint8Array(buf, start, Math.min(e.compressedSize, buf.byteLength - start));
  let bytes: Uint8Array;
  if (e.method === 0) bytes = raw;
  else if (e.method === 8) bytes = await inflateRaw(raw);
  else throw new OoxmlError('Unsupported compression in this document');
  return new TextDecoder().decode(bytes);
}

function parseXml(xml: string): Document {
  // XML parsing in DOMParser neither runs scripts nor fetches external entities.
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new OoxmlError('Damaged Office file');
  return doc;
}

function children(el: Element, local?: string): Element[] {
  return Array.from(el.children).filter((c) => !local || c.localName === local);
}

function child(el: Element | null | undefined, local: string): Element | undefined {
  return el ? children(el, local)[0] : undefined;
}

function attr(el: Element | undefined, local: string): string | null {
  if (!el) return null;
  for (const a of Array.from(el.attributes)) if (a.localName === local) return a.value;
  return null;
}

/* ------------------------------------------------------------------ Word */

export interface DocRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export type DocBlock =
  | { kind: 'paragraph'; level: 0 | 1 | 2 | 3; list: boolean; runs: DocRun[] }
  | { kind: 'table'; rows: string[][] };

export interface DocxContent {
  blocks: DocBlock[];
  /** Pictures and drawings present in the file but not shown in the preview. */
  omittedImages: number;
}

function onOff(el: Element | undefined): boolean {
  if (!el) return false;
  const v = attr(el, 'val');
  return v === null || !['0', 'false', 'off', 'none'].includes(v.toLowerCase());
}

function headingLevel(style: string | null): 0 | 1 | 2 | 3 {
  if (!style) return 0;
  const s = style.toLowerCase().replace(/\s/g, '');
  if (s === 'title' || s === 'heading1') return 1;
  if (s === 'subtitle' || s === 'heading2') return 2;
  if (/^heading[3-9]$/.test(s)) return 3;
  return 0;
}

export async function docxToContent(buf: ArrayBuffer): Promise<DocxContent> {
  const entries = readZipDirectory(buf);
  const xml = await readZipText(buf, entries, 'word/document.xml');
  if (xml === null) throw new OoxmlError('This is not a Word document');
  const doc = parseXml(xml);
  const body = Array.from(doc.getElementsByTagNameNS('*', 'body'))[0];
  const blocks: DocBlock[] = [];
  let omittedImages = 0;

  const collectRuns = (el: Element, into: DocRun[]) => {
    for (const c of children(el)) {
      if (c.localName === 'r') {
        const rPr = child(c, 'rPr');
        const fmt = {
          bold: onOff(child(rPr, 'b')) || undefined,
          italic: onOff(child(rPr, 'i')) || undefined,
          underline: (child(rPr, 'u') && attr(child(rPr, 'u'), 'val') !== 'none') || undefined,
        };
        let text = '';
        for (const part of children(c)) {
          if (part.localName === 't') text += part.textContent ?? '';
          else if (part.localName === 'tab') text += '\t';
          else if (part.localName === 'br' || part.localName === 'cr') text += '\n';
          else if (part.localName === 'drawing' || part.localName === 'pict' || part.localName === 'object') omittedImages++;
        }
        if (text) into.push({ text, ...fmt });
      } else if (['hyperlink', 'ins', 'smartTag', 'fldSimple', 'sdt', 'sdtContent'].includes(c.localName)) {
        collectRuns(c, into);
      }
      // w:del is text that was deleted under track changes; it is not the document.
    }
  };

  const paragraphText = (p: Element) => {
    const runs: DocRun[] = [];
    collectRuns(p, runs);
    return runs.map((r) => r.text).join('');
  };

  const walk = (container: Element) => {
    for (const el of children(container)) {
      if (el.localName === 'p') {
        const pPr = child(el, 'pPr');
        const runs: DocRun[] = [];
        collectRuns(el, runs);
        blocks.push({
          kind: 'paragraph',
          level: headingLevel(attr(child(pPr, 'pStyle'), 'val')),
          list: Boolean(child(pPr, 'numPr')),
          runs,
        });
      } else if (el.localName === 'tbl') {
        const rows = children(el, 'tr').map((tr) =>
          children(tr, 'tc').map((tc) =>
            children(tc)
              .filter((x) => x.localName === 'p')
              .map(paragraphText)
              .join('\n'),
          ),
        );
        blocks.push({ kind: 'table', rows });
      } else if (el.localName === 'sdt') {
        const content = child(el, 'sdtContent');
        if (content) walk(content);
      }
    }
  };

  if (body) walk(body);
  return { blocks, omittedImages };
}

/* ----------------------------------------------------------------- Excel */

export interface Sheet {
  name: string;
  rows: string[][];
  /** Rows beyond the preview limit — the reader is told, not left to assume. */
  omittedRows: number;
}

const MAX_ROWS = 2000;
const MAX_COLS = 100;

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function isDateFormatCode(code: string): boolean {
  // Strip quoted literals, escapes and colour/condition brackets, then look
  // for date or time tokens. "0.00" is a number; "dd/mm/yyyy" is a date.
  const bare = code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');
  return /[dmyhs]/i.test(bare) && !/^[#0.,%\s]*$/.test(bare);
}

/**
 * Excel stores a date as a day count. Shown raw, 12 March 2024 reads as
 * 45363 — a wrong-looking value in a medical spreadsheet is worse than none.
 */
export function excelSerialToText(serial: number, date1904: boolean): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = Math.round(serial * 86400000);
  const d = new Date(epoch + ms);
  const iso = d.toISOString();
  const hasTime = Math.abs(serial % 1) > 1e-9;
  return hasTime ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso.slice(0, 10);
}

export async function xlsxToSheets(buf: ArrayBuffer): Promise<Sheet[]> {
  const entries = readZipDirectory(buf);
  const workbookXml = await readZipText(buf, entries, 'xl/workbook.xml');
  if (workbookXml === null) throw new OoxmlError('This is not an Excel workbook');
  const workbook = parseXml(workbookXml);
  const relsXml = await readZipText(buf, entries, 'xl/_rels/workbook.xml.rels');
  const rels = new Map<string, string>();
  if (relsXml) {
    for (const r of Array.from(parseXml(relsXml).getElementsByTagNameNS('*', 'Relationship'))) {
      const target = r.getAttribute('Target') ?? '';
      rels.set(r.getAttribute('Id') ?? '', target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    }
  }
  const date1904 = ['1', 'true'].includes(
    attr(Array.from(workbook.getElementsByTagNameNS('*', 'workbookPr'))[0], 'date1904') ?? '',
  );

  const shared: string[] = [];
  const sstXml = await readZipText(buf, entries, 'xl/sharedStrings.xml');
  if (sstXml) {
    for (const si of Array.from(parseXml(sstXml).getElementsByTagNameNS('*', 'si'))) {
      shared.push(
        Array.from(si.getElementsByTagNameNS('*', 't'))
          .filter((t) => t.parentElement?.localName !== 'rPh') // phonetic guides are not the text
          .map((t) => t.textContent ?? '')
          .join(''),
      );
    }
  }

  const dateStyles = new Set<number>();
  const stylesXml = await readZipText(buf, entries, 'xl/styles.xml');
  if (stylesXml) {
    const styles = parseXml(stylesXml);
    const custom = new Map<number, string>();
    for (const f of Array.from(styles.getElementsByTagNameNS('*', 'numFmt'))) {
      custom.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '');
    }
    const cellXfs = Array.from(styles.getElementsByTagNameNS('*', 'cellXfs'))[0];
    if (cellXfs) {
      children(cellXfs, 'xf').forEach((xf, i) => {
        const id = Number(xf.getAttribute('numFmtId') ?? 0);
        if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormatCode(custom.get(id)!))) dateStyles.add(i);
      });
    }
  }

  const sheets: Sheet[] = [];
  for (const s of Array.from(workbook.getElementsByTagNameNS('*', 'sheet'))) {
    const name = s.getAttribute('name') ?? `Sheet ${sheets.length + 1}`;
    const path = rels.get(attr(s, 'id') ?? '') ?? `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = await readZipText(buf, entries, path);
    if (xml === null) continue;
    const rowsEls = Array.from(parseXml(xml).getElementsByTagNameNS('*', 'row'));
    const rows: string[][] = [];
    let omittedRows = 0;
    for (const row of rowsEls) {
      const rIndex = Number(row.getAttribute('r') ?? rows.length + 1) - 1;
      if (rIndex >= MAX_ROWS) {
        omittedRows++;
        continue;
      }
      while (rows.length <= rIndex) rows.push([]);
      const cells = rows[rIndex];
      children(row, 'c').forEach((c, i) => {
        const ref = c.getAttribute('r');
        const col = ref ? columnIndex(ref) : i;
        if (col >= MAX_COLS) return;
        const t = c.getAttribute('t');
        const v = child(c, 'v')?.textContent ?? '';
        let text: string;
        if (t === 's') text = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') text = Array.from(c.getElementsByTagNameNS('*', 't')).map((x) => x.textContent ?? '').join('');
        else if (t === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'str' || t === 'e') text = v;
        else if (v !== '' && dateStyles.has(Number(c.getAttribute('s') ?? -1)) && Number.isFinite(Number(v))) {
          text = excelSerialToText(Number(v), date1904);
        } else text = v;
        while (cells.length < col) cells.push('');
        cells[col] = text;
      });
    }
    sheets.push({ name, rows, omittedRows });
  }
  return sheets;
}
