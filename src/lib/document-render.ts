/**
 * Helpers the document viewer uses to show text-shaped files safely: CSV
 * parsing, HTML sanitising, and printing.
 */

import DOMPurify from 'dompurify';

type DOMPurifyInstance = ReturnType<typeof DOMPurify>;

/* ------------------------------------------------------------------- CSV */

/** RFC 4180, with quoted fields that may hold commas, quotes and newlines. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^ï»¿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim =
    delimiter ?? ((firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ HTML */

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'li', 'mark',
  'ol', 'p', 'pre', 'q', 's', 'section', 'article', 'header', 'footer', 'main', 'aside', 'small', 'span',
  'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'style',
];

/** Removed along with everything inside them. */
const DROP_WITH_CONTENT = [
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select',
  'textarea', 'link', 'meta', 'base', 'svg', 'math', 'template', 'noscript', 'audio', 'video', 'source',
  'track', 'portal', 'title', 'head', 'noembed', 'noframes', 'plaintext', 'xmp', 'foreignobject',
  'annotation-xml', 'desc',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'style', 'class', 'align', 'width', 'height', 'dir', 'lang',
];

function safeUrl(value: string, forImage: boolean): boolean {
  const v = value.trim().toLowerCase().replace(/[\u0000-\u001f\s]/g, '');
  if (forImage) return v.startsWith('data:image/') && !v.startsWith('data:image/svg');
  return v.startsWith('https:') || v.startsWith('http:') || v.startsWith('mailto:') || v.startsWith('#');
}

let purifier: DOMPurifyInstance | null = null;

/** One DOMPurify instance with our hooks, built on first use (needs a window). */
function getPurifier(): DOMPurifyInstance {
  if (purifier) return purifier;
  const p = DOMPurify(window);
  // Style text can still call home through url() and @import.
  p.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'style') node.textContent = cleanCss(node.textContent ?? '');
  });
  p.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return;
    const tag = node.localName;
    for (const name of ['href', 'src']) {
      const v = node.getAttribute(name);
      if (v !== null && !safeUrl(v, tag === 'img' && name === 'src')) node.removeAttribute(name);
    }
    const style = node.getAttribute('style');
    if (style !== null) node.setAttribute('style', cleanCss(style));
    if (tag === 'a') node.setAttribute('rel', 'noopener noreferrer');
  });
  purifier = p;
  return p;
}

/**
 * Strips a stored HTML document down to text, structure and inline styling.
 *
 * Scripts, event handlers, frames, forms and javascript: links go; so do
 * remote images, which in a patient's document are a read receipt for
 * whoever planted them. DOMPurify does the cleaning with our allowlist; the
 * output is still only ever shown inside a sandboxed frame with a no-script
 * CSP — this is the second lock, not the only one.
 */
export function sanitizeHtml(html: string): { head: string; body: string } {
  // An inert parse, used only to lift <style> blocks out of <head>.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const styles = Array.from(doc.head?.querySelectorAll('style') ?? [])
    .map((s) => `<style>${cleanCss(s.textContent ?? '')}</style>`)
    .join('');

  const body = getPurifier().sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|#|data:image\/)/i,
    FORBID_CONTENTS: DROP_WITH_CONTENT,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'svg', 'math'],
    FORBID_ATTR: ['srcset', 'xlink:href', 'formaction', 'action', 'background', 'poster'],
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  }) as string;
  return { head: styles, body };
}

/** CSS cannot run script in a modern browser, but url() and @import can call home. */
function cleanCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\s*\([^)]*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '(')
    .replace(/<\/?style/gi, '');
}

/** Blocks every script and every network fetch from the document's own markup. */
export const DOCUMENT_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'";

/** Printing our own rendered output, which may include blob: images. */
const PRINT_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src blob: data:; font-src data:";

function wrapDocument(head: string, body: string, csp: string, extraCss = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  html, body { margin: 0; padding: 24px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.55; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; }
  th, td { padding: 4px 8px; border: 1px solid #ccc; text-align: left; vertical-align: top; }
  pre { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 12px; }
  ${extraCss}
</style>${head}</head><body>${body}</body></html>`;
}

/** The srcdoc for a stored HTML document, themed for the viewer. */
export function buildHtmlDocument(html: string, dark: boolean): string {
  const { head, body } = sanitizeHtml(html);
  const theme = dark
    ? `:root { color-scheme: dark; } html, body { background: #0f1512 !important; color: #e8ece9 !important; }
       * { border-color: #2c3a33 !important; } a { color: #8fd3ac !important; }
       h1, h2, h3, h4, h5, h6, strong, th { color: #f4f7f5 !important; }
       p, li, td, span, div, dt, dd, small { color: #d5dbd7 !important; }
       table, th, td, header, footer, section, article, aside, main, div { background: transparent !important; }`
    : 'html, body { background: #fff; color: #1a1a1a; }';
  return wrapDocument(head, body, DOCUMENT_CSP, theme);
}

function printSrcdoc(srcdoc: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(() => frame.remove(), 60_000);
    }
  };
  frame.srcdoc = srcdoc;
  document.body.appendChild(frame);
}

/**
 * Prints what the viewer rendered, not the whole app page around it. The
 * markup is our own React output; the frame still carries a no-script CSP.
 */
export function printRenderedElement(el: HTMLElement, title: string) {
  const heading = `<h1 style="font-size:16px;margin:0 0 16px">${escapeHtml(title)}</h1>`;
  printSrcdoc(wrapDocument('', heading + el.innerHTML, PRINT_CSP));
}

export function printHtmlDocument(html: string) {
  const { head, body } = sanitizeHtml(html);
  printSrcdoc(wrapDocument(head, body, DOCUMENT_CSP));
}

/**
 * Prints a PDF through the browser's own viewer. Only ever called with a blob
 * we created as application/pdf after checking its signature. Where the
 * browser will not print a framed PDF, it opens in a tab for printing there.
 */
export function printPdfBlobUrl(blobUrl: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(blobUrl, '_blank', 'noopener');
    } finally {
      window.setTimeout(() => frame.remove(), 60_000);
    }
  };
  frame.src = blobUrl;
  document.body.appendChild(frame);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
