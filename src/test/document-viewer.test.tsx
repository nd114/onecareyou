import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { deflateRawSync } from 'node:zlib';

import { claimedKind, resolveKind, sniffBytes } from '@/lib/document-formats';
import { docxToContent, excelSerialToText, xlsxToSheets } from '@/lib/ooxml';
import { buildHtmlDocument, parseCsv, sanitizeHtml } from '@/lib/document-render';
import { FileViewer } from '@/components/documents/FileViewer';

/**
 * The shared document viewer: what it decides a file is, what it then renders,
 * and that nothing in a stored document gets to run.
 */

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);
const withHeader = (head: number[], rest = 64) => new Uint8Array([...head, ...new Array(rest).fill(0x20)]);

const PDF = bytes('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF');
const PNG = withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = withHeader([0xff, 0xd8, 0xff, 0xe0]);
const HEIC = new Uint8Array([0, 0, 0, 0x18, ...bytes('ftypheic'), ...new Array(40).fill(0)]);
const DICOM = (() => {
  const b = new Uint8Array(200);
  b.set(bytes('DICM'), 128);
  return b;
})();
const HTML_PAGE = bytes('<!doctype html><html><body><script>alert(1)</script></body></html>');

function makeZip(files: Record<string, string>, deflate = true): ArrayBuffer {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameB = enc.encode(name);
    const raw = enc.encode(content);
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = deflate ? 8 : 0;
    const local = new Uint8Array(30 + nameB.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameB.length, true);
    local.set(nameB, 30);
    local.set(data, 30 + nameB.length);
    const central = new Uint8Array(46 + nameB.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameB, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, p);
    p += part.length;
  }
  return out.buffer;
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const DOCX = makeZip({
  'word/document.xml': `<?xml version="1.0"?><w:document ${W}><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Discharge letter</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Metformin</w:t></w:r><w:r><w:t xml:space="preserve"> 500mg twice daily</w:t></w:r></w:p>
    <w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(2)&gt;</w:t></w:r></w:p>
    <w:p><w:r><w:drawing/></w:r></w:p>
    <w:p><w:del><w:r><w:t>deleted words</w:t></w:r></w:del></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>HbA1c</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>48</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body></w:document>`,
});

const S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const XLSX = makeZip(
  {
    'xl/workbook.xml': `<workbook ${S} ${R}><sheets><sheet name="Readings" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/sharedStrings.xml': `<sst ${S}><si><t>Date</t></si><si><t>Glucose</t></si></sst>`,
    'xl/styles.xml': `<styleSheet ${S}><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet ${S}><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
      <row r="2"><c r="A2" s="1"><v>45363</v></c><c r="C2"><v>6.2</v></c></row>
    </sheetData></worksheet>`,
  },
  false,
);

vi.mock('@/components/documents/PdfPages', () => ({
  default: ({ url, onFail }: { url: string; onFail: () => void }) => (
    <div data-testid="pdfjs" data-url={url}>
      <button onClick={onFail}>fail-pdfjs</button>
    </div>
  ),
}));

const heic2any = vi.hoisted(() => vi.fn());
vi.mock('heic2any', () => ({ default: heic2any }));

describe('format detection', () => {
  it.each([
    ['letter.pdf', null, 'pdf'],
    ['scan.JPG', null, 'image'],
    ['IMG_0001.HEIC', null, 'heic'],
    ['referral.docx', null, 'docx'],
    ['old.doc', null, 'legacy-office'],
    ['results.xlsx', null, 'spreadsheet'],
    // Windows reports .csv as an Excel type; the extension must win.
    ['readings.csv', 'application/vnd.ms-excel', 'csv'],
    ['notes.md', null, 'markdown'],
    ['bundle.json', null, 'json'],
    ['care-record.html', null, 'html'],
    ['voice-note.m4a', null, 'audio'],
    ['clip.mov', null, 'video'],
    ['ct.dcm', null, 'dicom'],
    ['noext', 'application/pdf', 'pdf'],
    ['noext', 'audio/webm', 'audio'],
    ['noext', 'application/fhir+json', 'json'],
    ['noext', 'application/x-thing', 'unsupported'],
  ])('%s (%s) is claimed as %s', (name, mime, kind) => {
    expect(claimedKind(mime, name)).toBe(kind);
  });

  it('reads signatures', () => {
    expect(sniffBytes(PDF)?.kind).toBe('pdf');
    expect(sniffBytes(PNG)?.mime).toBe('image/png');
    expect(sniffBytes(HEIC)?.kind).toBe('heic');
    expect(sniffBytes(DICOM)?.kind).toBe('dicom');
    expect(sniffBytes(bytes('just words'))).toBeNull();
  });

  it('shows a real PDF as a PDF, typed by us', () => {
    expect(resolveKind(PDF, 'application/octet-stream', 'x.pdf')).toMatchObject({ kind: 'pdf', blobType: 'application/pdf' });
  });

  it('refuses a web page renamed to .pdf', () => {
    const r = resolveKind(HTML_PAGE, 'application/pdf', 'invoice.pdf');
    expect(r.kind).toBe('unsupported');
    expect(r.mismatch).toMatch(/web page/);
  });

  it('refuses a claimed PDF with no PDF signature', () => {
    expect(resolveKind(bytes('hello'), 'application/pdf', 'a.pdf').kind).toBe('unsupported');
  });

  it('shows a photo mislabelled as a PDF as the photo', () => {
    expect(resolveKind(JPEG, 'application/pdf', 'scan.pdf')).toMatchObject({ kind: 'image', blobType: 'image/jpeg' });
  });

  it('accepts Office zips only when they claim to be Office files', () => {
    const zip = new Uint8Array(DOCX);
    expect(resolveKind(zip, null, 'a.docx').kind).toBe('docx');
    expect(resolveKind(zip, null, 'a.xlsx').kind).toBe('spreadsheet');
    expect(resolveKind(zip, null, 'a.pdf').kind).toBe('unsupported');
  });

  it('keeps markup in a .txt as text', () => {
    expect(resolveKind(HTML_PAGE, 'text/plain', 'notes.txt').kind).toBe('text');
  });

  it('lets an SVG through only as an image', () => {
    expect(resolveKind(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml', 'a.svg')).toMatchObject({
      kind: 'image',
      blobType: 'image/svg+xml',
    });
  });

  it('recognises DICOM whatever it is called', () => {
    expect(resolveKind(DICOM, null, 'IM0001').kind).toBe('dicom');
  });
});

describe('Word and Excel parsing', () => {
  it('reads paragraphs, headings, formatting and tables, and counts what it leaves out', async () => {
    const doc = await docxToContent(DOCX);
    expect(doc.blocks[0]).toMatchObject({ kind: 'paragraph', level: 1 });
    const second = doc.blocks[1];
    expect(second.kind === 'paragraph' && second.runs[0]).toMatchObject({ text: 'Metformin', bold: true });
    expect(doc.blocks.some((b) => b.kind === 'table' && b.rows[0][0] === 'HbA1c')).toBe(true);
    expect(doc.omittedImages).toBe(1);
    // Track-changes deletions are not part of the document.
    expect(JSON.stringify(doc.blocks)).not.toContain('deleted words');
  });

  it('reads cells, shared strings and dates', async () => {
    const [sheet] = await xlsxToSheets(XLSX);
    expect(sheet.name).toBe('Readings');
    expect(sheet.rows[0]).toEqual(['Date', 'Glucose']);
    expect(sheet.rows[1]).toEqual(['2024-03-12', '', '6.2']);
  });

  it('converts Excel serial dates', () => {
    expect(excelSerialToText(45363, false)).toBe('2024-03-12');
    expect(excelSerialToText(45363.5, false)).toBe('2024-03-12 12:00');
  });
});

describe('CSV', () => {
  it('handles quotes, embedded commas and newlines', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi""\nthere"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
    ]);
  });
  it('detects tabs', () => {
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('HTML sanitising', () => {
  const hostile = `<html><head><style>@import url(https://evil.test/x.css); body{background:url(https://evil.test/p.png)}</style>
    <meta http-equiv="refresh" content="0;url=https://evil.test"></head><body>
    <h1 onclick="alert(1)">Care record</h1>
    <script>alert(2)</script>
    <img src="https://evil.test/track.gif" onerror="alert(3)">
    <img src="data:image/png;base64,AAAA">
    <a href="javascript:alert(4)">bad</a><a href="https://example.org">good</a>
    <iframe src="https://evil.test"></iframe><form action="https://evil.test"><input name="p"></form>
    <svg><script>alert(5)</script></svg>
    <custom-el>kept text</custom-el>
    </body></html>`;

  it('removes every way for the document to run script or call out', () => {
    const { head, body } = sanitizeHtml(hostile);
    const all = head + body;
    expect(all).not.toMatch(/<script/i);
    expect(all).not.toMatch(/onclick|onerror/i);
    expect(all).not.toMatch(/javascript:/i);
    expect(all).not.toMatch(/<iframe|<form|<input|<svg|<meta/i);
    expect(all).not.toContain('evil.test');
    expect(all).not.toMatch(/@import/i);
  });

  it('keeps the content', () => {
    const { body } = sanitizeHtml(hostile);
    expect(body).toContain('Care record');
    expect(body).toContain('href="https://example.org"');
    expect(body).toContain('data:image/png');
    expect(body).toContain('kept text');
  });

  it('survives hostile input', () => {
    const cases = [
      '<img src=x onerror=alert(1)>',
      '<a href="  JaVa	ScRiPt:alert(1)">x</a>',
      '<a href="jav&#x61;script:alert(1)">x</a>',
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
      '<svg onload=alert(1)><circle/></svg>',
      '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
      '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
      '<div style="background:url(https://evil.test/a.png)">x</div>',
      '<p style="width:expression(alert(1))">x</p>',
      '<style>@import "https://evil.test/x.css"; p{background:url( https://evil.test/y )}</style><p>x</p>',
      '<img src="data:image/svg+xml;base64,PHN2Zy8+">',
      '<img srcset="https://evil.test/a.png 1x" src="x">',
      '<object data="x"></object><embed src="x"><base href="https://evil.test/">',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    ];
    for (const c of cases) {
      const { head, body } = sanitizeHtml(c);
      const all = head + body;
      expect(all, c).not.toMatch(/<script|<svg|<iframe|<object|<embed|<base|<form|<math/i);
      expect(all, c).not.toMatch(/\son\w+\s*=/i);
      expect(all, c).not.toMatch(/javascript:/i);
      expect(all, c).not.toMatch(/evil\.test|srcset/i);
      expect(all, c).not.toMatch(/data:text|data:image\/svg/i);
      expect(all, c).not.toMatch(/url\s*\(\s*['"]?https?:/i);
      expect(all, c).not.toMatch(/expression\s*\(|@import/i);
    }
  });

  it('wraps the result in a no-script CSP', () => {
    const doc = buildHtmlDocument(hostile, false);
    expect(doc).toMatch(/Content-Security-Policy/);
    expect(doc).toContain("script-src 'none'");
    expect(doc).not.toMatch(/<script/i);
  });
});

describe('the viewer chooses a renderer per type', () => {
  let served: { body: ArrayBuffer | Uint8Array } = { body: new Uint8Array() };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: new Headers(),
        arrayBuffer: async () => {
          const b = served.body;
          return b instanceof Uint8Array ? b.slice().buffer : b;
        },
      })),
    );
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const show = (fileName: string, body: ArrayBuffer | Uint8Array, mimeType?: string) => {
    served = { body };
    return render(
      <FileViewer
        title={fileName}
        fileName={fileName}
        mimeType={mimeType}
        loadSource={async () => ({ url: 'https://storage.test/signed?token=t', fileName })}
      />,
    );
  };

  it('PDF: drawn by pdf.js from the typed blob, never a frame', async () => {
    const { container } = show('letter.pdf', PDF);
    const pages = await screen.findByTestId('pdfjs');
    expect(pages.getAttribute('data-url')).toBe('blob:mock');
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('HEIC: converts to JPEG with heic2any when the browser cannot decode it', async () => {
    heic2any.mockResolvedValueOnce(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const { container } = show('IMG_0001.HEIC', HEIC);
    const img = await waitFor(() => {
      const el = container.querySelector('img');
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.error(img);
    await waitFor(() => expect(heic2any).toHaveBeenCalled());
    expect(heic2any.mock.calls[0][0].toType).toBe('image/jpeg');
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(screen.queryByText(/iPhone photo/)).toBeNull();
  });

  it('HEIC: falls back to the notice when conversion fails', async () => {
    heic2any.mockRejectedValueOnce(new Error('bad'));
    const { container } = show('IMG_0001.HEIC', HEIC);
    const img = await waitFor(() => {
      const el = container.querySelector('img');
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.error(img);
    await screen.findByText(/iPhone photo/);
  });

  it('PDF: falls back to an <object> when pdf.js cannot read it', async () => {
    const { container } = show('letter.pdf', PDF);
    (await screen.findByRole('button', { name: 'fail-pdfjs' })).click();
    await waitFor(() => expect(container.querySelector('object')).not.toBeNull());
    const obj = container.querySelector('object')!;
    expect(obj.getAttribute('type')).toBe('application/pdf');
    expect(obj.getAttribute('data')).toBe('blob:mock');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('a web page renamed .pdf is refused, with a download', async () => {
    const { container } = show('invoice.pdf', HTML_PAGE);
    await screen.findByText(/contains a web page/);
    expect(container.querySelector('object, iframe')).toBeNull();
    expect(screen.getAllByRole('button', { name: /download/i }).length).toBeGreaterThan(0);
  });

  it('image: an <img>', async () => {
    const { container } = show('scan.png', PNG);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
  });

  it('Word: rendered as elements, the script-looking text inert', async () => {
    const { container } = show('referral.docx', DOCX);
    await screen.findByText('Discharge letter');
    expect(screen.getByText('Metformin').closest('strong')).not.toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('script, img, iframe')).toBeNull();
    expect(screen.getByText(/An image in this document is not shown/)).toBeInTheDocument();
  });

  it('spreadsheet: a table', async () => {
    const { container } = show('results.xlsx', XLSX);
    await screen.findByText('Glucose');
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('CSV: a table', async () => {
    show('readings.csv', bytes('when,value\n2024-01-01,5.5'), 'application/vnd.ms-excel');
    await screen.findByText('5.5');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('JSON: pretty-printed text', async () => {
    const { container } = show('bundle.json', bytes('{"a":1}'));
    await waitFor(() => expect(container.querySelector('pre')?.textContent).toBe('{\n  "a": 1\n}'));
  });

  it('Markdown: rendered, raw HTML not executed, remote images not fetched', async () => {
    const { container } = show('notes.md', bytes('# Plan\n\n<script>alert(1)</script>\n\n![x](https://evil.test/t.png)'));
    await screen.findByRole('heading', { name: 'Plan' });
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('HTML: sanitised into a sandboxed frame', async () => {
    const { container } = show('record.html', bytes('<p onclick="x()">Hi</p><script>alert(1)</script>'));
    await waitFor(() => expect(container.querySelector('iframe')).not.toBeNull());
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    const srcdoc = frame.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('Hi');
    expect(srcdoc).not.toMatch(/<script|onclick/i);
  });

  it('audio and video: native players on the signed URL, nothing fetched up front', async () => {
    const a = show('voice.m4a', new Uint8Array());
    await waitFor(() => expect(a.container.querySelector('audio')).not.toBeNull());
    expect(a.container.querySelector('audio')!.getAttribute('src')).toContain('storage.test');
    cleanup();
    const v = show('clip.mp4', new Uint8Array());
    await waitFor(() => expect(v.container.querySelector('video')).not.toBeNull());
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /print/i })).toBeNull();
  });

  it('DICOM: an honest fallback with a download', async () => {
    show('IM0001', DICOM);
    await screen.findByText(/medical imaging file \(DICOM\)/);
    expect(screen.getAllByRole('button', { name: /download/i }).length).toBeGreaterThan(0);
  });

  it('legacy .doc: says why, offers the download', async () => {
    show('old.doc', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]));
    await screen.findByText(/older Microsoft Office file/);
  });

  it('a source that cannot be had says so', async () => {
    render(<FileViewer title="x" loadSource={async () => { throw new Error('That share has ended'); }} />);
    await screen.findByText('That share has ended');
  });
});
