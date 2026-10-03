import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader2 } from 'lucide-react';

const MAX_PAGES = 200;

function PdfCanvas({ pdf, pageNumber, width }: { pdf: PDFDocumentProxy; pageNumber: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | undefined;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !ref.current) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const canvas = ref.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const render = page.render({ canvasContext: ctx, viewport });
      task = render;
      await render.promise.catch(() => undefined);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, width]);

  return <canvas ref={ref} className="mx-auto mb-3 block bg-white shadow" aria-label={`Page ${pageNumber}`} />;
}

export default function PdfPages({ url, onFail }: { url: string; onFail: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | undefined;
    (async () => {
      const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
      doc = await pdfjs.getDocument({ data, isEvalSupported: false, enableXfa: false }).promise;
      if (cancelled) {
        void doc.destroy();
        return;
      }
      setPdf(doc);
    })().catch(() => {
      if (!cancelled) onFail();
    });
    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [url, onFail]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(200, Math.floor(el.clientWidth - 16)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} className="h-full min-h-[60vh] w-full overflow-auto bg-muted/40 p-2">
      {!pdf && (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading PDF" />
        </div>
      )}
      {pdf &&
        width > 0 &&
        Array.from({ length: Math.min(pdf.numPages, MAX_PAGES) }, (_, i) => (
          <PdfCanvas key={i + 1} pdf={pdf} pageNumber={i + 1} width={width} />
        ))}
    </div>
  );
}
