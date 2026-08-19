import jsPDF from 'jspdf';

type Block = { text: string; kind: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'row' };

/**
 * Turns a stored HTML (or plain text) document into readable blocks, so the
 * exported PDF reads like a document instead of showing markup and tags.
 */
export function htmlToBlocks(html: string): Block[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, style, head noscript').forEach((n) => n.remove());
  const blocks: Block[] = [];

  const clean = (value: string) => value.replace(/\s+/g, ' ').trim();

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
        const text = clean(child.textContent || '');
        if (text) blocks.push({ text, kind: tag === 'h1' ? 'h1' : tag === 'h2' ? 'h2' : 'h3' });
        continue;
      }
      if (tag === 'li') {
        const text = clean(child.textContent || '');
        if (text) blocks.push({ text: `• ${text}`, kind: 'li' });
        continue;
      }
      if (tag === 'tr') {
        const cells = Array.from(child.children).map((c) => clean(c.textContent || ''));
        const text = cells.filter(Boolean).join('  |  ');
        if (text) blocks.push({ text, kind: 'row' });
        continue;
      }
      if (['p', 'blockquote', 'figcaption', 'dd', 'dt'].includes(tag)) {
        const text = clean(child.textContent || '');
        if (text) blocks.push({ text, kind: 'p' });
        continue;
      }
      if (child.children.length === 0) {
        const text = clean(child.textContent || '');
        if (text) blocks.push({ text, kind: 'p' });
        continue;
      }
      walk(child);
    }
  };

  walk(parsed.body);

  if (blocks.length === 0) {
    const text = clean(parsed.body.textContent || '');
    if (text) blocks.push({ text, kind: 'p' });
  }
  return blocks;
}

export function textToBlocks(value: string): Block[] {
  return value
    .split(/\n{2,}/)
    .map((chunk) => chunk.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((text) => ({ text, kind: 'p' as const }));
}

/** Renders blocks into a paginated, typographically sane A4 PDF and saves it. */
export function saveBlocksAsPdf(title: string, blocks: Block[], fileName: string) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 56;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const write = (text: string, size: number, style: 'normal' | 'bold', gapBefore: number, gapAfter: number, indent = 0) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, maxWidth - indent) as string[];
    const lineHeight = size * 1.45;
    y += gapBefore;
    for (const line of lines) {
      newPageIfNeeded(lineHeight);
      pdf.text(line, margin + indent, y + size);
      y += lineHeight;
    }
    y += gapAfter;
  };

  write(title, 20, 'bold', 0, 10);
  pdf.setDrawColor(200);
  newPageIfNeeded(12);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 14;

  for (const block of blocks) {
    switch (block.kind) {
      case 'h1':
        write(block.text, 17, 'bold', 12, 6);
        break;
      case 'h2':
        write(block.text, 14, 'bold', 10, 5);
        break;
      case 'h3':
        write(block.text, 12, 'bold', 8, 4);
        break;
      case 'li':
        write(block.text, 11, 'normal', 0, 4, 14);
        break;
      case 'row':
        write(block.text, 10.5, 'normal', 0, 4, 6);
        break;
      default:
        write(block.text, 11, 'normal', 0, 8);
    }
  }

  pdf.save(fileName);
}
