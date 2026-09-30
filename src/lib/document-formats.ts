/**
 * What a stored file actually is, and therefore how the viewer may show it.
 *
 * The name and the MIME type are both claims made by whoever uploaded the
 * file. The viewer renders PHI from other people — a clinician opens what a
 * patient sent, a patient opens what a clinic sent — so the decision that
 * matters for safety is taken from the bytes wherever the bytes can say:
 * a file called "letter.pdf" that is really HTML must not be handed to a
 * frame as a PDF, and a photo mislabelled as a PDF should still be shown.
 */

export type ViewerKind =
  | 'pdf'
  | 'image'
  | 'heic'
  | 'docx'
  | 'spreadsheet'
  | 'legacy-office'
  | 'csv'
  | 'markdown'
  | 'json'
  | 'text'
  | 'html'
  | 'audio'
  | 'video'
  | 'dicom'
  | 'unsupported';

const EXTENSIONS: Record<string, ViewerKind> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  jfif: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  avif: 'image',
  svg: 'image',
  heic: 'heic',
  heif: 'heic',
  docx: 'docx',
  doc: 'legacy-office',
  xls: 'legacy-office',
  ppt: 'legacy-office',
  xlsx: 'spreadsheet',
  xlsm: 'spreadsheet',
  csv: 'csv',
  tsv: 'csv',
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  txt: 'text',
  log: 'text',
  xml: 'text',
  hl7: 'text',
  html: 'html',
  htm: 'html',
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  ogg: 'audio',
  oga: 'audio',
  aac: 'audio',
  flac: 'audio',
  weba: 'audio',
  mp4: 'video',
  m4v: 'video',
  mov: 'video',
  webm: 'video',
  ogv: 'video',
  dcm: 'dicom',
  dicom: 'dicom',
};

const MIME_EXACT: Record<string, ViewerKind> = {
  'application/pdf': 'pdf',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/heic-sequence': 'heic',
  'image/heif-sequence': 'heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'spreadsheet',
  'application/msword': 'legacy-office',
  'application/vnd.ms-excel': 'legacy-office',
  'application/vnd.ms-powerpoint': 'legacy-office',
  'text/csv': 'csv',
  'text/tab-separated-values': 'csv',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'application/json': 'json',
  'text/html': 'html',
  'application/xhtml+xml': 'html',
  'application/xml': 'text',
  'application/dicom': 'dicom',
};

export function fileExtension(name: string | null | undefined): string {
  const m = /\.([a-z0-9]+)$/i.exec((name ?? '').trim());
  return m ? m[1].toLowerCase() : '';
}

/**
 * What the name and declared type say the file is, before anything is read.
 * The extension is preferred: Windows reports a .csv as
 * application/vnd.ms-excel, and storage may hand anything back as
 * application/octet-stream.
 */
export function claimedKind(mimeType: string | null | undefined, fileName: string | null | undefined): ViewerKind {
  const byExt = EXTENSIONS[fileExtension(fileName)];
  if (byExt) return byExt;
  const mime = (mimeType ?? '').toLowerCase().split(';')[0].trim();
  if (MIME_EXACT[mime]) return MIME_EXACT[mime];
  if (mime.endsWith('+json')) return 'json';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('text/')) return 'text';
  return 'unsupported';
}

/** Audio and video play from the signed URL so they can stream and seek. */
export function isStreamedKind(kind: ViewerKind): boolean {
  return kind === 'audio' || kind === 'video';
}

export interface Sniffed {
  kind: ViewerKind | 'zip' | 'html-like';
  mime?: string;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let s = '';
  for (let i = start; i < start + length && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

/** Reads the file's own signature. Null when the bytes carry none (text). */
export function sniffBytes(bytes: Uint8Array): Sniffed | null {
  // The PDF spec allows the header anywhere in the first 1024 bytes.
  if (ascii(bytes, 0, 1024).includes('%PDF-')) return { kind: 'pdf', mime: 'application/pdf' };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return { kind: 'image', mime: 'image/png' };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: 'image', mime: 'image/jpeg' };
  if (ascii(bytes, 0, 4) === 'GIF8') return { kind: 'image', mime: 'image/gif' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return { kind: 'image', mime: 'image/webp' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return { kind: 'audio', mime: 'audio/wav' };
  if (ascii(bytes, 0, 2) === 'BM' && bytes.length > 14) return { kind: 'image', mime: 'image/bmp' };
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return { kind: 'heic', mime: 'image/heic' };
    }
    if (brand === 'avif' || brand === 'avis') return { kind: 'image', mime: 'image/avif' };
    if (brand.startsWith('m4a') || brand.startsWith('m4b')) return { kind: 'audio', mime: 'audio/mp4' };
    if (brand === 'qt  ') return { kind: 'video', mime: 'video/quicktime' };
    return { kind: 'video', mime: 'video/mp4' };
  }
  if (ascii(bytes, 128, 4) === 'DICM') return { kind: 'dicom', mime: 'application/dicom' };
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return { kind: 'zip' };
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { kind: 'legacy-office' };
  if (ascii(bytes, 0, 3) === 'ID3') return { kind: 'audio', mime: 'audio/mpeg' };
  if (ascii(bytes, 0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg' };
  if (ascii(bytes, 0, 4) === 'fLaC') return { kind: 'audio', mime: 'audio/flac' };
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: 'video', mime: 'video/webm' };
  const head = ascii(bytes, 0, 512).replace(/^﻿|^\xEF\xBB\xBF/, '').trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<script')) {
    return { kind: 'html-like' };
  }
  return null;
}

/** Formats that are binary: a claim of one of these must be backed by its signature. */
const SIGNED_KINDS: ViewerKind[] = ['pdf', 'image', 'heic', 'docx', 'spreadsheet'];

export interface Resolved {
  kind: ViewerKind;
  /**
   * The type a blob is created with. Fixed by us, never taken from storage, so
   * the browser cannot be talked into treating a PDF-shaped blob as a page.
   */
  blobType: string;
  /** Set when the file is not what it claims to be — shown to the reader. */
  mismatch?: string;
}

function isSvg(bytes: Uint8Array, mimeType: string | null | undefined, fileName: string | null | undefined): boolean {
  const claimsSvg = fileExtension(fileName) === 'svg' || (mimeType ?? '').toLowerCase().startsWith('image/svg');
  return claimsSvg && ascii(bytes, 0, 2048).toLowerCase().includes('<svg');
}

/**
 * Settles what to render from the claim and the bytes together.
 *
 * - A recognised signature wins over the name, so a mislabelled photo is still
 *   a photo and a "PDF" that is really a JPEG is shown as the JPEG.
 * - A binary claim with no matching signature is refused inline: that is how an
 *   HTML page renamed to .pdf would otherwise reach a frame.
 * - Text-like claims with no signature render as text, which runs nothing.
 */
export function resolveKind(
  bytes: Uint8Array,
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
): Resolved {
  const claim = claimedKind(mimeType, fileName);
  const sniff = sniffBytes(bytes);

  if (claim === 'image' && isSvg(bytes, mimeType, fileName)) {
    // Only ever placed in an <img>, where SVG script does not run.
    return { kind: 'image', blobType: 'image/svg+xml' };
  }

  if (sniff?.kind === 'zip') {
    if (claim === 'docx' || claim === 'spreadsheet') return { kind: claim, blobType: 'application/octet-stream' };
    return { kind: 'unsupported', blobType: 'application/octet-stream' };
  }

  if (sniff?.kind === 'html-like') {
    if (claim === 'html') return { kind: 'html', blobType: 'text/plain' };
    if (SIGNED_KINDS.includes(claim)) {
      return {
        kind: 'unsupported',
        blobType: 'application/octet-stream',
        mismatch: 'This file is named as one type but contains a web page, so it is not opened here.',
      };
    }
    // A .txt that happens to be markup is still shown as its source text.
    return { kind: claim === 'unsupported' ? 'text' : claim, blobType: 'text/plain' };
  }

  if (sniff) {
    const kind = sniff.kind as ViewerKind;
    return { kind, blobType: sniff.mime ?? 'application/octet-stream' };
  }

  if (SIGNED_KINDS.includes(claim)) {
    return {
      kind: 'unsupported',
      blobType: 'application/octet-stream',
      mismatch: 'This file does not look like the type its name says, so it is not opened here.',
    };
  }

  if (claim === 'unsupported' && looksLikeText(bytes)) return { kind: 'text', blobType: 'text/plain' };
  return { kind: claim, blobType: 'text/plain' };
}

/** No NUL bytes in the first few KB is a cheap, good-enough test for text. */
export function looksLikeText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 4096);
  if (n === 0) return true;
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return false;
  return true;
}

/** Whether printing this kind from the viewer means anything. */
export function canPrint(kind: ViewerKind): boolean {
  return !['audio', 'video', 'dicom', 'unsupported', 'legacy-office', 'heic'].includes(kind);
}
