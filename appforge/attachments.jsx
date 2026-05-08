// File attachment system
// -----------------------
// Centralised classification, content extraction, and AI message-block
// generation for arbitrary user-uploaded files. Supports:
//
//   • Images          → image blocks (base64) sent verbatim to multimodal models
//   • Text-decodable  → UTF-8 read, inlined as text (code, JSON, CSV, MD, …)
//   • PDFs            → text extracted with pdfjs-dist (lazy)
//   • XLSX/XLS/ODS    → SheetJS, formatted as Markdown tables
//   • CSV/TSV         → parsed as table text
//   • Other binaries  → metadata only (filename, size, type) — the AI is told
//                       it exists but content is unreadable client-side
//
// All heavy parsers (pdfjs, xlsx) are dynamic-imported the first time they're
// needed so the main bundle stays slim.

import React from 'react';
import {
  IconFileDoc,
} from './icons.jsx';

// ----- File classification ------------------------------------------------

const CODE_EXT = new Set([
  'js','jsx','ts','tsx','mjs','cjs',
  'py','rb','go','rs','java','kt','swift','scala','ex','exs','elm','clj','cljs',
  'cs','cpp','cc','c','h','hpp','hxx','m','mm',
  'php','sh','bash','zsh','fish','ps1','bat','cmd',
  'sql','graphql','gql',
  'html','htm','xhtml','vue','svelte','astro',
  'css','scss','sass','less','styl',
  'r','jl','dart','lua','pl','pm','tcl','vim',
]);

const DATA_EXT = new Set(['json','jsonc','json5','yaml','yml','xml','toml','ini','env','cfg','conf','plist','proto']);
const TEXT_EXT = new Set(['txt','md','markdown','mdx','log','rst','adoc','tex']);
const SHEET_EXT = new Set(['xls','xlsx','ods']);
const SHEET_TEXT_EXT = new Set(['csv','tsv']);
const DOC_EXT = new Set(['doc','docx','odt','rtf','pages']);
const SLIDE_EXT = new Set(['ppt','pptx','odp','key']);
const ARCHIVE_EXT = new Set(['zip','rar','7z','tar','gz','bz2','xz','tgz']);
const FONT_EXT = new Set(['ttf','otf','woff','woff2','eot']);

function extOf(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

const MAX_INLINE_TEXT = 200_000; // 200 KB of extracted text per attachment

export function fileMeta(file) {
  const ext = extOf(file.name);
  const mime = file.type || '';

  let category, palette, label;

  if (mime.startsWith('image/') || ['png','jpg','jpeg','gif','webp','bmp','avif','heic'].includes(ext)) {
    category = 'image';
    palette = { bg: 'bg-pink-500/15',    fg: 'text-pink-300' };
    label = (ext || 'IMG').toUpperCase();
  } else if (ext === 'svg' || mime === 'image/svg+xml') {
    category = 'svg';
    palette = { bg: 'bg-pink-500/15',    fg: 'text-pink-300' };
    label = 'SVG';
  } else if (mime.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac','opus','aac'].includes(ext)) {
    category = 'audio';
    palette = { bg: 'bg-violet-500/15',  fg: 'text-violet-300' };
    label = (ext || 'AUDIO').toUpperCase();
  } else if (mime.startsWith('video/') || ['mp4','mov','webm','avi','mkv','m4v'].includes(ext)) {
    category = 'video';
    palette = { bg: 'bg-rose-500/15',    fg: 'text-rose-300' };
    label = (ext || 'VIDEO').toUpperCase();
  } else if (ext === 'pdf' || mime === 'application/pdf') {
    category = 'pdf';
    palette = { bg: 'bg-red-500/15',     fg: 'text-red-300' };
    label = 'PDF';
  } else if (DOC_EXT.has(ext) || mime.includes('wordprocessingml')) {
    category = 'doc';
    palette = { bg: 'bg-blue-500/15',    fg: 'text-blue-300' };
    label = (ext || 'DOC').toUpperCase();
  } else if (SHEET_EXT.has(ext) || mime.includes('spreadsheet')) {
    category = 'sheet';
    palette = { bg: 'bg-emerald-500/15', fg: 'text-emerald-300' };
    label = (ext || 'XLSX').toUpperCase();
  } else if (SHEET_TEXT_EXT.has(ext) || mime === 'text/csv' || mime === 'text/tab-separated-values') {
    category = 'sheet-text';
    palette = { bg: 'bg-emerald-500/15', fg: 'text-emerald-300' };
    label = (ext || 'CSV').toUpperCase();
  } else if (SLIDE_EXT.has(ext) || mime.includes('presentationml')) {
    category = 'slide';
    palette = { bg: 'bg-orange-500/15',  fg: 'text-orange-300' };
    label = (ext || 'PPT').toUpperCase();
  } else if (ARCHIVE_EXT.has(ext) || mime.includes('zip') || mime.includes('compressed')) {
    category = 'archive';
    palette = { bg: 'bg-amber-500/15',   fg: 'text-amber-300' };
    label = (ext || 'ZIP').toUpperCase();
  } else if (FONT_EXT.has(ext) || mime.startsWith('font/')) {
    category = 'font';
    palette = { bg: 'bg-indigo-500/15',  fg: 'text-indigo-300' };
    label = (ext || 'FONT').toUpperCase();
  } else if (DATA_EXT.has(ext) || mime === 'application/json') {
    category = 'data';
    palette = { bg: 'bg-amber-500/15',   fg: 'text-amber-300' };
    label = (ext || 'JSON').toUpperCase();
  } else if (CODE_EXT.has(ext)) {
    category = 'code';
    palette = { bg: 'bg-violet-500/15',  fg: 'text-violet-300' };
    label = ext.toUpperCase();
  } else if (TEXT_EXT.has(ext) || mime.startsWith('text/')) {
    category = 'text';
    palette = { bg: 'bg-slate-500/15',   fg: 'text-slate-300' };
    label = (ext || 'TXT').toUpperCase();
  } else {
    category = 'file';
    palette = { bg: 'bg-slate-500/15',   fg: 'text-slate-300' };
    label = ext ? ext.toUpperCase() : 'FILE';
  }

  return { category, palette, label, ext, mime };
}

// ----- Icons --------------------------------------------------------------

const Icon = ({ d, size = 14, viewBox = '0 0 24 24' }) => (
  <svg width={size} height={size} viewBox={viewBox} fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const FILE_ICONS = {
  image: <Icon d={<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>} />,
  svg:   <Icon d={<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 13l2 4 3-7 2 7 3-4" /></>} />,
  audio: <Icon d={<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>} />,
  video: <Icon d={<><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m22 8-6 4 6 4z" /></>} />,
  pdf:   <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13.5h2a1.5 1.5 0 0 1 0 3H9zM14 13.5h3M14 17v-3.5M14 15.25h2" /></>} />,
  doc:   <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6M9 9h2" /></>} />,
  sheet: <Icon d={<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>} />,
  'sheet-text': <Icon d={<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></>} />,
  slide: <Icon d={<><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /><path d="M8 9l4 4 4-4" /></>} />,
  archive: <Icon d={<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v6M9 6h6M10 12h4M10 15h4M10 18h4" /></>} />,
  font:  <Icon d={<><path d="M5 21V3h14M5 12h12" /></>} />,
  data:  <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13l-1.5 2.5L9 18M15 13l1.5 2.5L15 18" /></>} />,
  code:  <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m10 13-2 2 2 2M14 13l2 2-2 2" /></>} />,
  text:  <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6M9 9h1" /></>} />,
  file:  <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>} />,
};

export function fileIcon(category) {
  return FILE_ICONS[category] || FILE_ICONS.file || <IconFileDoc />;
}

// ----- Helpers ------------------------------------------------------------

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

const readDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error || new Error('Could not read file'));
  r.readAsDataURL(file);
});

const readArrayBuffer = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error || new Error('Could not read file'));
  r.readAsArrayBuffer(file);
});

const readText = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error || new Error('Could not read file'));
  r.readAsText(file, 'utf-8');
});

function truncateText(text, max = MAX_INLINE_TEXT) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n…[truncated — showing first ${max.toLocaleString()} of ${text.length.toLocaleString()} chars]`;
}

// ----- Format-specific extractors -----------------------------------------

async function extractPdfText(file) {
  const [pdfjsMod, workerUrlMod] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  const pdfjs = pdfjsMod.default || pdfjsMod;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrlMod.default;

  const data = await readArrayBuffer(file);
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map((t) => ('str' in t ? t.str : '')).join(' ').replace(/\s+/g, ' ').trim();
    if (text) pages.push(`### Page ${i}\n${text}`);
  }
  return pages.join('\n\n');
}

async function extractSpreadsheet(file) {
  const XLSX = await import('xlsx');
  const buf = await readArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  const out = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    if (!aoa.length) continue;
    out.push(`### Sheet: ${sheetName}`);
    const [head, ...body] = aoa;
    if (Array.isArray(head) && head.length) {
      out.push('| ' + head.map(c => String(c ?? '')).join(' | ') + ' |');
      out.push('| ' + head.map(() => '---').join(' | ') + ' |');
    }
    body.slice(0, 500).forEach(r => {
      out.push('| ' + (Array.isArray(r) ? r : [r]).map(c => String(c ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |');
    });
    if (body.length > 500) out.push(`…${body.length - 500} more rows omitted`);
    out.push('');
  }
  return out.join('\n');
}

function looksLikeText(file, maxBytes = 50_000_000) {
  if (file.size > maxBytes) return false;
  const meta = fileMeta(file);
  return ['text', 'code', 'data', 'svg', 'sheet-text'].includes(meta.category);
}

// ----- Public extraction entry point --------------------------------------

export async function extractAttachment(file) {
  const meta = fileMeta(file);

  // Images — always read as base64 dataUrl (multimodal models accept inline)
  if (meta.category === 'image') {
    const dataUrl = await readDataUrl(file);
    return { extractedKind: 'image', dataUrl };
  }

  // Text-decodable: read UTF-8 directly
  if (looksLikeText(file)) {
    const content = await readText(file);
    return { extractedKind: 'text', content: truncateText(content) };
  }

  // PDF — text extraction
  if (meta.category === 'pdf') {
    try {
      const content = await extractPdfText(file);
      return { extractedKind: 'text', content: truncateText(content) || '(no extractable text — likely an image-only PDF)' };
    } catch (err) {
      return { extractedKind: 'binary', extractError: err?.message || String(err) };
    }
  }

  // Spreadsheets — XLSX / XLS / ODS
  if (meta.category === 'sheet') {
    try {
      const content = await extractSpreadsheet(file);
      return { extractedKind: 'text', content: truncateText(content) };
    } catch (err) {
      return { extractedKind: 'binary', extractError: err?.message || String(err) };
    }
  }

  // CSV / TSV — already decodable as text but route through truncation
  if (meta.category === 'sheet-text') {
    const content = await readText(file);
    return { extractedKind: 'text', content: truncateText(content) };
  }

  // Everything else (DOCX, PPTX, ZIP, audio, video, fonts…): metadata only
  return { extractedKind: 'binary' };
}

// ----- AI message-block conversion ----------------------------------------

// Convert this message's attachments into the content blocks the LLM API
// expects. Images become `image` blocks (base64), extracted text is wrapped in
// fenced text, and binary-only files are mentioned in metadata so the model
// knows they're attached even if it can't read the bytes.
export function attachmentsToBlocks(attachments) {
  const blocks = [];
  for (const a of (attachments || [])) {
    if (a.extractedKind === 'image' && a.dataUrl) {
      const m = (a.dataUrl || '').match(/^data:([^;]+);(base64),(.*)$/);
      if (m) {
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: m[1] || a.mime || 'image/png', data: m[3] || '' },
        });
        continue;
      }
    }
    if (a.extractedKind === 'text' && a.content) {
      blocks.push({
        type: 'text',
        text: `\n[Attached file: ${a.name} (${a.mime || a.label}, ${formatBytes(a.size)})]\n\n\`\`\`\n${a.content}\n\`\`\`\n`,
      });
      continue;
    }
    // Binary or extraction failed
    const note = a.extractError
      ? `[Attached file: ${a.name} — ${a.mime || a.label}, ${formatBytes(a.size)}. Content extraction failed: ${a.extractError}]`
      : `[Attached file: ${a.name} — ${a.mime || a.label}, ${formatBytes(a.size)}. Binary file; content not directly readable. Ask the user for any specific information needed.]`;
    blocks.push({ type: 'text', text: note });
  }
  return blocks;
}
