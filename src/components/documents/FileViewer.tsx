import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, FileDown, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  canPrint,
  claimedKind,
  isStreamedKind,
  resolveKind,
  type ViewerKind,
} from '@/lib/document-formats';
import { docxToContent, xlsxToSheets, type DocxContent, type Sheet } from '@/lib/ooxml';
import {
  buildHtmlDocument,
  parseCsv,
  printHtmlDocument,
  printPdfBlobUrl,
  printRenderedElement,
  saveBlob,
} from '@/lib/document-render';
import { htmlToBlocks, saveBlocksAsPdf, textToBlocks } from '@/lib/document-pdf';

/**
 * The one place a stored document is shown in OneCare — the Vault, a
 * clinician's shared-documents tab, message attachments, care records and the
 * public snapshot link all open files through this.
 *
 * It exists because each of those used to do it differently, and most did it
 * by opening the storage URL in a new tab: the file left the platform's frame,
 * Word files downloaded instead of opening, and a PDF in a sandboxed frame was
 * refused outright by Chrome.
 *
 * Safety rules it keeps, whichever door the file came in by:
 *  - Content comes only from a short-lived signed URL, read once into memory.
 *  - What to render is decided from the bytes as well as the name
 *    (lib/document-formats), and blobs are created with a type we choose.
 *  - Nothing is sent to a third-party viewer. Word and Excel are parsed here.
 *  - Stored HTML is sanitised and shown in a sandboxed, no-script frame.
 *  - What the preview cannot show is said, with a download beside it.
 */

export interface ViewerSource {
  /** Short-lived signed URL. */
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
}

/** Past this, the file is offered for download rather than read into memory. */
const MAX_PREVIEW_BYTES = 100 * 1024 * 1024;
/** Text beyond this is cut from the preview, with a note; the download is whole. */
const MAX_TEXT_CHARS = 2_000_000;

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      kind: ViewerKind;
      fileName: string;
      /** The original bytes, for download. Absent for streamed media. */
      blob?: Blob;
      /** A blob URL typed by us, for pdf/image/heic/sniffed media. */
      blobUrl?: string;
      /** The signed URL, for audio/video that stream. */
      mediaUrl?: string;
      text?: string;
      textTruncated?: boolean;
      docx?: DocxContent;
      sheets?: Sheet[];
      note?: string;
    };

export async function loadDocument(source: ViewerSource, fallbackName: string, fallbackMime?: string | null): Promise<Loaded> {
  const fileName = source.fileName || fallbackName;
  const mime = source.mimeType ?? fallbackMime ?? null;
  const claim = claimedKind(mime, fileName);

  if (isStreamedKind(claim)) {
    // Media element sources cannot run script, and streaming lets a long
    // recording start at once and seek without downloading the whole file.
    return { status: 'ready', kind: claim, fileName, mediaUrl: source.url };
  }

  const res = await fetch(source.url);
  if (!res.ok) return { status: 'error', message: 'This document could not be opened just now.' };
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_PREVIEW_BYTES) {
    return {
      status: 'ready',
      kind: 'unsupported',
      fileName,
      note: 'This file is too large to preview here. Download it to open it.',
      mediaUrl: source.url,
    };
  }
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const resolved = resolveKind(bytes, mime, fileName);
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const base = { status: 'ready' as const, kind: resolved.kind, fileName, blob, note: resolved.mismatch };

  switch (resolved.kind) {
    case 'pdf':
    case 'image':
    case 'heic':
    case 'audio':
    case 'video':
      return { ...base, blobUrl: URL.createObjectURL(new Blob([buf], { type: resolved.blobType })) };
    case 'docx':
      try {
        return { ...base, docx: await docxToContent(buf) };
      } catch (e) {
        return { ...base, kind: 'unsupported', note: `${(e as Error).message}. Download it to open it.` };
      }
    case 'spreadsheet':
      try {
        return { ...base, sheets: await xlsxToSheets(buf) };
      } catch (e) {
        return { ...base, kind: 'unsupported', note: `${(e as Error).message}. Download it to open it.` };
      }
    case 'csv':
    case 'markdown':
    case 'json':
    case 'text':
    case 'html': {
      let text = new TextDecoder('utf-8').decode(bytes);
      const textTruncated = text.length > MAX_TEXT_CHARS;
      if (textTruncated) text = text.slice(0, MAX_TEXT_CHARS);
      if (resolved.kind === 'json' && !textTruncated) {
        try {
          text = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          /* shown as it is */
        }
      }
      return { ...base, text, textTruncated };
    }
    default:
      return base;
  }
}

function isDarkMode() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

export function FileViewer({
  title,
  fileName,
  mimeType,
  loadSource,
}: {
  title: string;
  fileName?: string | null;
  mimeType?: string | null;
  /** Called once per mount. Throw with a readable message to show it. */
  loadSource: () => Promise<ViewerSource | null>;
}) {
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  const [downloading, setDownloading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let created: string | undefined;
    setState({ status: 'loading' });
    (async () => {
      try {
        const source = await loadSource();
        if (!active) return;
        if (!source) {
          setState({ status: 'error', message: 'This document could not be opened just now.' });
          return;
        }
        const loaded = await loadDocument(source, fileName || title, mimeType);
        if (loaded.status === 'ready') created = loaded.blobUrl;
        if (!active) {
          if (created) URL.revokeObjectURL(created);
          return;
        }
        setState(loaded);
      } catch (e) {
        if (active) {
          setState({ status: 'error', message: (e as Error)?.message || 'This document could not be opened just now.' });
        }
      }
    })();
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
    // One load per mounted viewer: the signed URL is short-lived and each
    // request for one may be an audited access.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async () => {
    if (state.status !== 'ready') return;
    if (state.blob) {
      saveBlob(state.blob, state.fileName);
      return;
    }
    if (!state.mediaUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(state.mediaUrl);
      if (!res.ok) throw new Error();
      saveBlob(await res.blob(), state.fileName);
    } catch {
      setState({ status: 'error', message: 'The link to this file has expired. Close and open it again to download.' });
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    if (state.status !== 'ready') return;
    if (state.kind === 'pdf' && state.blobUrl) printPdfBlobUrl(state.blobUrl);
    else if (state.kind === 'html' && state.text !== undefined) printHtmlDocument(state.text);
    else if (contentRef.current) printRenderedElement(contentRef.current, title);
  };

  const handleSavePdf = () => {
    if (state.status !== 'ready' || state.text === undefined) return;
    const base = state.fileName.replace(/\.[^.]+$/, '');
    const blocks = state.kind === 'html' ? htmlToBlocks(state.text) : textToBlocks(state.text);
    saveBlocksAsPdf(title, blocks, `${base}.pdf`);
  };

  const ready = state.status === 'ready' ? state : null;
  const printable = ready && canPrint(ready.kind);
  const savableAsPdf = ready && ready.text !== undefined && ['text', 'markdown', 'html'].includes(ready.kind);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex-1 min-h-0 overflow-auto bg-muted/30 dark:bg-background"
        data-testid="file-viewer-body"
      >
        {state.status === 'loading' && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading document" />
          </div>
        )}
        {state.status === 'error' && <Notice>{state.message}</Notice>}
        {ready && (
          <div ref={contentRef} className="h-full">
            <Body loaded={ready} title={title} onDownload={handleDownload} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">
        {savableAsPdf && (
          <Button variant="outline" size="sm" onClick={handleSavePdf}>
            <FileDown className="mr-2 h-4 w-4" /> Download as PDF
          </Button>
        )}
        {printable && (
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        )}
        {ready && (ready.blob || ready.mediaUrl) && (
          <Button size="sm" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download
          </Button>
        )}
      </div>
    </div>
  );
}

function Notice({ children, onDownload }: { children: React.ReactNode; onDownload?: () => void }) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{children}</p>
      {onDownload && (
        <Button variant="outline" size="sm" onClick={onDownload}>
          <Download className="mr-2 h-4 w-4" /> Download
        </Button>
      )}
    </div>
  );
}

function Omitted({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
      {children}
    </p>
  );
}

function Body({
  loaded,
  title,
  onDownload,
}: {
  loaded: Extract<Loaded, { status: 'ready' }>;
  title: string;
  onDownload: () => void;
}) {
  const [mediaFailed, setMediaFailed] = useState(false);
  const html = useMemo(
    () => (loaded.kind === 'html' && loaded.text !== undefined ? buildHtmlDocument(loaded.text, isDarkMode()) : ''),
    [loaded],
  );
  const truncated = loaded.textTruncated && (
    <Omitted>This file is long; only the first part is shown here. Download it for the whole file.</Omitted>
  );

  switch (loaded.kind) {
    case 'pdf':
      // A blob we typed as application/pdf after checking its signature, in
      // an <object> rather than a sandboxed frame, which Chrome's PDF viewer
      // refuses to load into. Phones without an inline PDF viewer get the
      // fallback inside the element.
      return (
        <object data={loaded.blobUrl} type="application/pdf" className="h-full min-h-[60vh] w-full" aria-label={title}>
          <Notice onDownload={onDownload}>This browser cannot show PDFs inside the page. Download it to open it.</Notice>
        </object>
      );
    case 'image':
      return (
        <div className="flex h-full items-center justify-center p-2">
          <img src={loaded.blobUrl} alt={title} className="max-h-full max-w-full object-contain" />
        </div>
      );
    case 'heic':
      // Only Safari decodes HEIC natively. Try, and say so when it does not.
      return mediaFailed ? (
        <Notice onDownload={onDownload}>
          This is an iPhone photo (HEIC), which this browser cannot display. Download it to view, or open it
          in Safari or on an iPhone or Mac.
        </Notice>
      ) : (
        <div className="flex h-full items-center justify-center p-2">
          <img
            src={loaded.blobUrl}
            alt={title}
            className="max-h-full max-w-full object-contain"
            onError={() => setMediaFailed(true)}
          />
        </div>
      );
    case 'audio':
      return mediaFailed ? (
        <Notice onDownload={onDownload}>This browser cannot play this recording. Download it to listen.</Notice>
      ) : (
        <div className="flex h-full items-center justify-center p-6">
          <audio
            controls
            preload="metadata"
            src={loaded.blobUrl ?? loaded.mediaUrl}
            className="w-full max-w-xl"
            onError={() => setMediaFailed(true)}
          />
        </div>
      );
    case 'video':
      return mediaFailed ? (
        <Notice onDownload={onDownload}>This browser cannot play this video. Download it to watch.</Notice>
      ) : (
        <div className="flex h-full items-center justify-center bg-black">
          <video
            controls
            playsInline
            preload="metadata"
            src={loaded.blobUrl ?? loaded.mediaUrl}
            className="max-h-full max-w-full"
            onError={() => setMediaFailed(true)}
          />
        </div>
      );
    case 'docx':
      return <DocxView content={loaded.docx!} />;
    case 'spreadsheet':
      return <SheetsView sheets={loaded.sheets ?? []} />;
    case 'csv': {
      const rows = parseCsv(loaded.text ?? '', loaded.fileName.toLowerCase().endsWith('.tsv') ? '\t' : undefined);
      return (
        <div className="p-4">
          {truncated}
          <SheetTable rows={rows} />
        </div>
      );
    }
    case 'markdown':
      return (
        <div className="prose prose-sm max-w-none bg-background p-6 dark:prose-invert">
          {truncated}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // A remote image in a shared document is a read receipt for its
              // author. Say it is there instead of fetching it.
              img: ({ alt }) => <span className="text-muted-foreground">[image{alt ? `: ${alt}` : ''}]</span>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {loaded.text ?? ''}
          </ReactMarkdown>
        </div>
      );
    case 'json':
    case 'text':
      return (
        <div className="min-h-full bg-background p-5">
          {truncated}
          <pre
            className={
              loaded.kind === 'json'
                ? 'whitespace-pre-wrap break-words font-mono text-xs text-foreground'
                : 'whitespace-pre-wrap break-words font-sans text-sm text-foreground'
            }
          >
            {loaded.text}
          </pre>
        </div>
      );
    case 'html':
      return (
        <div className="flex h-full min-h-[60vh] flex-col">
          {truncated}
          {/* Sanitised, and still sandboxed with a no-script CSP. */}
          <iframe srcDoc={html} title={title} sandbox="" className="h-full w-full flex-1 bg-background" />
        </div>
      );
    case 'dicom':
      return (
        <Notice onDownload={onDownload}>
          This is a medical imaging file (DICOM). A viewer for scans is coming to OneCare; for now, download it
          and open it in the imaging software your clinic uses.
        </Notice>
      );
    case 'legacy-office':
      return (
        <Notice onDownload={onDownload}>
          This is an older Microsoft Office file (.doc, .xls or .ppt), which cannot be previewed here. Download
          it to open it. Saved again as .docx or .xlsx, it will open in OneCare.
        </Notice>
      );
    default:
      return (
        <Notice onDownload={loaded.blob || loaded.mediaUrl ? onDownload : undefined}>
          {loaded.note ?? 'This file type cannot be shown here. Download it to open it.'}
        </Notice>
      );
  }
}

function DocxView({ content }: { content: DocxContent }) {
  return (
    <div className="mx-auto min-h-full max-w-3xl bg-background px-8 py-6 text-sm leading-relaxed text-foreground">
      {content.omittedImages > 0 && (
        <Omitted>
          {content.omittedImages === 1 ? 'An image' : `${content.omittedImages} images`} in this document{' '}
          {content.omittedImages === 1 ? 'is' : 'are'} not shown in the preview. Download it to see everything.
        </Omitted>
      )}
      {content.blocks.length === 0 && <p className="text-muted-foreground">This document has no text.</p>}
      {content.blocks.map((b, i) => {
        if (b.kind === 'table') {
          return (
            <div key={i} className="my-3 overflow-x-auto">
              <SheetTable rows={b.rows} header={false} />
            </div>
          );
        }
        const runs = b.runs.map((r, j) => {
          let node: React.ReactNode = r.text;
          if (r.underline) node = <u>{node}</u>;
          if (r.italic) node = <em>{node}</em>;
          if (r.bold) node = <strong>{node}</strong>;
          return <span key={j} className="whitespace-pre-wrap">{node}</span>;
        });
        if (b.level === 1) return <h2 key={i} className="mb-2 mt-5 text-xl font-semibold">{runs}</h2>;
        if (b.level === 2) return <h3 key={i} className="mb-2 mt-4 text-lg font-semibold">{runs}</h3>;
        if (b.level === 3) return <h4 key={i} className="mb-1 mt-3 font-semibold">{runs}</h4>;
        if (b.list) return <p key={i} className="my-1 pl-5 before:-ml-4 before:mr-2 before:content-['•']">{runs}</p>;
        return <p key={i} className="my-2 min-h-[1em]">{runs}</p>;
      })}
    </div>
  );
}

function SheetsView({ sheets }: { sheets: Sheet[] }) {
  if (sheets.length === 0) return <Notice>This workbook has no sheets to show.</Notice>;
  if (sheets.length === 1) return <SheetPanel sheet={sheets[0]} />;
  return (
    <Tabs defaultValue="0" className="p-3">
      <TabsList className="flex-wrap h-auto">
        {sheets.map((s, i) => (
          <TabsTrigger key={i} value={String(i)}>
            {s.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {sheets.map((s, i) => (
        <TabsContent key={i} value={String(i)}>
          <SheetPanel sheet={s} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function SheetPanel({ sheet }: { sheet: Sheet }) {
  return (
    <div className="p-3">
      {sheet.omittedRows > 0 && (
        <Omitted>
          {sheet.omittedRows.toLocaleString()} more rows are not shown in the preview. Download the file for all of
          them.
        </Omitted>
      )}
      <SheetTable rows={sheet.rows} />
    </div>
  );
}

function SheetTable({ rows, header = true }: { rows: string[][]; header?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  const width = Math.max(...rows.map((r) => r.length));
  const [head, ...rest] = header ? rows : [null, ...rows];
  const cells = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  return (
    <div className="overflow-auto">
      <table className="min-w-full border-collapse bg-background text-xs">
        {head && (
          <thead>
            <tr>
              {cells(head).map((c, i) => (
                <th key={i} className="border bg-muted px-2 py-1 text-left font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {(rest as string[][]).map((r, i) => (
            <tr key={i}>
              {cells(r).map((c, j) => (
                <td key={j} className="whitespace-pre-wrap border px-2 py-1 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The viewer in a modal — how every entry point opens it. */
export function FileViewerDialog({
  open,
  onOpenChange,
  title,
  fileName,
  mimeType,
  loadSource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fileName?: string | null;
  mimeType?: string | null;
  loadSource: () => Promise<ViewerSource | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[95vw] max-w-4xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle className="truncate text-base">{title}</DialogTitle>
          <DialogDescription className="sr-only">Document viewer</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening asks for a fresh signed URL. */}
        {open && (
          <div className="min-h-0 flex-1">
            <FileViewer title={title} fileName={fileName} mimeType={mimeType} loadSource={loadSource} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
