/**
 * A very small allowlist sanitizer for the notes editor.
 *
 * Notes are written by the person reading them, but they are stored and
 * re-rendered, and a pasted fragment can carry anything. Rather than trusting
 * the clipboard, the saved HTML is rebuilt from an allowlist of the tags the
 * editor can actually produce, with every attribute dropped.
 */
const ALLOWED = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'H3',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'DIV', 'SPAN',
]);

export function sanitizeNoteHtml(html: string): string {
  if (typeof window === 'undefined' || !html) return '';
  const host = window.document.createElement('div');
  host.innerHTML = html;

  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      if (!ALLOWED.has(child.tagName)) {
        // Keep the words, lose the element.
        const text = window.document.createTextNode(child.textContent ?? '');
        child.replaceWith(text);
        return;
      }
      Array.from(child.attributes).forEach((a) => child.removeAttribute(a.name));
      walk(child);
    });
  };
  walk(host);
  return host.innerHTML;
}

/** Plain text, for search and for previews. */
export function noteHtmlToText(html: string): string {
  if (typeof window === 'undefined' || !html) return '';
  const host = window.document.createElement('div');
  host.innerHTML = html;
  return (host.textContent ?? '').replace(/\s+/g, ' ').trim();
}
