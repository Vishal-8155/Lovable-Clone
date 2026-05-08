// UI for AI-generated documents.
// - DocumentCard:    inline card shown inside chat messages with download / preview / regenerate.
// - DocumentsPane:   workspace tab listing every generated document with previews.
// - DocumentPreview: format-aware live preview (PDF iframe, MD render, JSON/CSV/TXT view, structural summary for DOCX/PPTX/XLSX).

import React from 'react';
import { downloadDoc, FRIENDLY_FORMAT, formatBytes } from './docs.jsx';
import { IconCheck, IconDownload, IconEye, IconFileDoc, IconRefresh, IconX } from './icons.jsx';

const FORMAT_THEME = {
  pdf:      { color: '#ef4444', label: 'PDF',  bg: 'bg-red-500/15',     fg: 'text-red-300' },
  docx:     { color: '#2563eb', label: 'DOCX', bg: 'bg-blue-500/15',    fg: 'text-blue-300' },
  pptx:     { color: '#ea580c', label: 'PPTX', bg: 'bg-orange-500/15',  fg: 'text-orange-300' },
  xlsx:     { color: '#16a34a', label: 'XLSX', bg: 'bg-emerald-500/15', fg: 'text-emerald-300' },
  csv:      { color: '#16a34a', label: 'CSV',  bg: 'bg-emerald-500/15', fg: 'text-emerald-300' },
  md:       { color: '#a78bfa', label: 'MD',   bg: 'bg-violet-500/15',  fg: 'text-violet-300' },
  markdown: { color: '#a78bfa', label: 'MD',   bg: 'bg-violet-500/15',  fg: 'text-violet-300' },
  txt:      { color: '#94a3b8', label: 'TXT',  bg: 'bg-slate-500/15',   fg: 'text-slate-300' },
  json:     { color: '#facc15', label: 'JSON', bg: 'bg-amber-500/15',   fg: 'text-amber-300' },
};

function themeFor(format) {
  return FORMAT_THEME[format] || { color: '#7c3aed', label: format?.toUpperCase() || 'FILE', bg: 'bg-forge-500/15', fg: 'text-forge-300' };
}

export function DocumentCard({ doc, onPreview, onRegenerate }) {
  const theme = themeFor(doc.format);
  const ready = !!doc.url && !doc.error;
  return (
    <div className="my-2 rounded-xl bg-ink-850 border border-ink-700 overflow-hidden forge-wrap">
      <div className="flex items-start gap-3 px-3.5 py-2.5">
        <div className={`flex-none w-9 h-9 rounded-lg ${theme.bg} ${theme.fg} flex items-center justify-center`}>
          <IconFileDoc size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[13px] font-medium text-ink-100 truncate">{doc.filename}</div>
            <span className={`flex-none text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded ${theme.bg} ${theme.fg}`}>
              {theme.label}
            </span>
          </div>
          <div className="text-[11px] text-ink-400 font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{FRIENDLY_FORMAT[doc.format] || doc.format}</span>
            {ready && <span className="text-ink-600">·</span>}
            {ready && <span>{formatBytes(doc.size)}</span>}
            {doc.generatedAt && <span className="text-ink-600">·</span>}
            {doc.generatedAt && <span>{new Date(doc.generatedAt).toLocaleTimeString()}</span>}
            {doc.error && <span className="text-red-300">· generation failed</span>}
            {!doc.url && !doc.error && <span className="text-amber-300">· building…</span>}
          </div>
        </div>
      </div>
      <div className="flex items-stretch border-t border-ink-700/70">
        <button
          onClick={() => onPreview?.(doc)}
          disabled={!ready}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] text-ink-200 hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed transition border-r border-ink-700/70"
        >
          <IconEye size={12} /> Preview
        </button>
        <button
          onClick={() => downloadDoc(doc)}
          disabled={!ready}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] text-ink-200 hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed transition border-r border-ink-700/70"
        >
          <IconDownload size={12} /> Download
        </button>
        <button
          onClick={() => onRegenerate?.(doc)}
          className="px-3 py-2 text-[12px] text-ink-300 hover:text-white hover:bg-ink-800 transition flex items-center gap-1.5"
        >
          <IconRefresh size={12} /> Regenerate
        </button>
      </div>
      {doc.error && (
        <div className="px-3.5 py-2 border-t border-red-500/30 bg-red-500/10 text-[11.5px] text-red-200 forge-wrap">
          {doc.error}
        </div>
      )}
    </div>
  );
}

export function DocumentsPane({ docs, onRegenerate, onClear }) {
  const [previewing, setPreviewing] = React.useState(null);
  const list = docs || [];

  if (!list.length) {
    return (
      <div className="w-full h-full bg-[#0a0a10] rounded-md border border-ink-800/60 flex flex-col items-center justify-center text-center px-6 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-forge-500/15 text-forge-300 flex items-center justify-center">
          <IconFileDoc size={20} />
        </div>
        <div className="text-[13px] text-ink-200 font-medium">No documents yet</div>
        <div className="text-[11.5px] text-ink-500 leading-relaxed max-w-[360px]">
          Ask the AI to generate a PDF, DOCX, PPTX, XLSX, CSV, Markdown, TXT, or JSON file.
          Try: <span className="text-forge-300 font-mono">"Generate a startup pitch deck as PPTX"</span>.
        </div>
      </div>
    );
  }

  return (
    <div className="docs-pane w-full h-full flex bg-[#0a0a10] rounded-md overflow-hidden border border-ink-800/60">
      <div className="docs-pane-list w-72 flex-none border-r border-ink-800 flex flex-col min-w-0">
        <div className="px-3 py-2 border-b border-ink-800/80 text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink-500 flex items-center justify-between">
          <span>documents</span>
          <span>{list.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto scroll-fine p-2 space-y-1.5">
          {list.map(doc => {
            const theme = themeFor(doc.format);
            const isActive = previewing?.id === doc.id;
            return (
              <button
                key={doc.id}
                onClick={() => setPreviewing(doc)}
                className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-md text-left transition border ${
                  isActive ? 'bg-forge-600/15 border-forge-500/40 text-white' : 'bg-ink-900/60 border-ink-800/60 hover:bg-ink-850 text-ink-200'
                }`}
              >
                <div className={`flex-none w-8 h-8 rounded-md ${theme.bg} ${theme.fg} flex items-center justify-center`}>
                  <IconFileDoc size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium truncate">{doc.filename}</div>
                  <div className="text-[10.5px] text-ink-500 font-mono mt-0.5">
                    {theme.label} · {doc.size ? formatBytes(doc.size) : (doc.error ? 'failed' : '…')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-ink-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <IconFileDoc size={13} className="text-forge-300 flex-none" />
            <span className="text-[12.5px] text-ink-100 truncate">{previewing?.filename || 'Select a document to preview'}</span>
          </div>
          {previewing && (
            <div className="flex items-center gap-1.5 flex-none">
              <button
                onClick={() => onRegenerate?.(previewing)}
                className="px-2 py-1 rounded text-[11px] text-ink-300 hover:text-white hover:bg-ink-800 transition flex items-center gap-1"
              >
                <IconRefresh size={11} /> Regenerate
              </button>
              <button
                onClick={() => downloadDoc(previewing)}
                disabled={!previewing.url}
                className="px-2.5 py-1 rounded bg-forge-600 hover:bg-forge-500 text-white text-[11.5px] transition flex items-center gap-1 disabled:opacity-40"
              >
                <IconDownload size={11} /> Download
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 bg-ink-950">
          {previewing ? (
            <DocumentPreview doc={previewing} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-500 text-[12px]">
              Pick a document from the left.
            </div>
          )}
        </div>
        {onClear && list.length > 1 && (
          <div className="px-3 py-2 border-t border-ink-800/80 flex justify-end">
            <button onClick={onClear} className="text-[11px] text-ink-400 hover:text-red-300 flex items-center gap-1 transition">
              <IconX size={11} /> Clear all documents
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function DocumentPreview({ doc }) {
  const [text, setText] = React.useState(null);
  const fmt = doc?.format;

  React.useEffect(() => {
    let cancelled = false;
    setText(null);
    if (!doc?.blob) return;
    if (['md', 'markdown', 'txt', 'json', 'csv'].includes(fmt)) {
      doc.blob.text().then(t => { if (!cancelled) setText(t); }).catch(() => setText(null));
    }
    return () => { cancelled = true; };
  }, [doc?.id, doc?.blob, fmt]);

  if (!doc) return null;
  if (doc.error) {
    return (
      <div className="p-6 text-[12.5px] text-red-200 forge-wrap">
        Generation failed: {doc.error}
      </div>
    );
  }
  if (!doc.url) {
    return <div className="p-6 text-[12.5px] text-ink-400">Building document…</div>;
  }

  if (fmt === 'pdf') {
    return (
      <iframe
        title={doc.filename}
        src={doc.url}
        className="w-full h-full bg-white"
        style={{ border: 0 }}
      />
    );
  }

  if (fmt === 'md' || fmt === 'markdown') {
    return (
      <div className="w-full h-full overflow-auto scroll-fine p-6 bg-white text-zinc-900">
        <div className="max-w-3xl mx-auto prose-doc">
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text || '') }} />
        </div>
      </div>
    );
  }

  if (fmt === 'json') {
    return (
      <pre className="w-full h-full overflow-auto scroll-fine p-4 bg-[#0d0d14] text-ink-200 font-mono text-[12px] leading-[1.55] forge-wrap">
        {text || ''}
      </pre>
    );
  }

  if (fmt === 'txt') {
    return (
      <pre className="w-full h-full overflow-auto scroll-fine p-4 bg-white text-zinc-900 font-mono text-[12.5px] leading-[1.6] forge-wrap whitespace-pre-wrap">
        {text || ''}
      </pre>
    );
  }

  if (fmt === 'csv') {
    return <CsvPreview text={text || ''} />;
  }

  // For DOCX / PPTX / XLSX we render a structural summary built from the spec.
  return <SpecSummary doc={doc} />;
}

function CsvPreview({ text }) {
  const rows = React.useMemo(() => parseCsv(text || ''), [text]);
  if (!rows.length) return <div className="p-6 text-[12px] text-ink-500">Empty CSV.</div>;
  const [headers, ...body] = rows;
  return (
    <div className="w-full h-full overflow-auto scroll-fine bg-white">
      <table className="min-w-full text-[12.5px] text-zinc-800">
        <thead className="bg-zinc-100 sticky top-0">
          <tr>
            {(headers || []).map((h, i) => (
              <th key={i} className="text-left font-semibold px-3 py-2 border-b border-zinc-200">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className={i % 2 ? 'bg-zinc-50' : 'bg-white'}>
              {(r || []).map((c, j) => <td key={j} className="px-3 py-1.5 border-b border-zinc-100 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseCsv(s) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch === '\r') { /* skip */ }
      else cell += ch;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function SpecSummary({ doc }) {
  const spec = doc.spec || {};
  const fmt = doc.format;
  return (
    <div className="w-full h-full overflow-auto scroll-fine p-6 bg-[#0d0d14] text-ink-200">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="rounded-xl bg-ink-850 border border-ink-700 p-4">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-500 font-mono">Document outline</div>
          <div className="text-[18px] font-semibold text-white mt-1">{spec.title || doc.filename}</div>
          {spec.author && <div className="text-[12px] text-ink-400 mt-0.5">by {spec.author}</div>}
        </div>
        {fmt === 'pptx' && Array.isArray(spec.slides) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {spec.slides.map((s, i) => (
              <div key={i} className="rounded-lg bg-ink-900 border border-ink-700 p-3">
                <div className="text-[10.5px] font-mono uppercase tracking-wider text-forge-300">Slide {i + 1} · {s.layout || 'bullets'}</div>
                <div className="text-[13px] text-white font-medium mt-1">{s.title || 'Untitled slide'}</div>
                {s.subtitle && <div className="text-[11.5px] text-ink-400">{s.subtitle}</div>}
                {Array.isArray(s.items) && s.items.length > 0 && (
                  <ul className="mt-1.5 text-[11.5px] text-ink-300 list-disc list-inside space-y-0.5">
                    {s.items.slice(0, 6).map((it, j) => <li key={j} className="truncate">{typeof it === 'string' ? it : (it.label ? `${it.label}: ${it.value}` : JSON.stringify(it))}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        {fmt === 'xlsx' && Array.isArray(spec.sheets) && (
          <div className="space-y-3">
            {spec.sheets.map((s, i) => (
              <div key={i} className="rounded-lg bg-white text-zinc-800 overflow-hidden">
                <div className="px-3 py-1.5 bg-zinc-100 text-[11.5px] font-medium border-b border-zinc-200">{s.name || `Sheet${i + 1}`}</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[12px]">
                    {Array.isArray(s.headers) && s.headers.length > 0 && (
                      <thead className="bg-zinc-50">
                        <tr>{s.headers.map((h, j) => <th key={j} className="px-2.5 py-1.5 text-left font-semibold border-b border-zinc-200">{h}</th>)}</tr>
                      </thead>
                    )}
                    <tbody>
                      {(s.rows || []).slice(0, 12).map((r, j) => (
                        <tr key={j} className={j % 2 ? 'bg-zinc-50' : 'bg-white'}>
                          {(Array.isArray(r) ? r : []).map((c, k) => <td key={k} className="px-2.5 py-1 border-b border-zinc-100">{String(c ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(s.rows || []).length > 12 && (
                    <div className="px-3 py-1.5 text-[11px] text-zinc-500 bg-zinc-50">…{s.rows.length - 12} more rows</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {fmt === 'docx' && Array.isArray(spec.blocks) && (
          <div className="rounded-lg bg-white text-zinc-800 p-6 space-y-2">
            {spec.blocks.map((b, i) => <DocBlockPreview key={i} block={b} />)}
          </div>
        )}
        <div className="rounded-xl bg-ink-850/50 border border-ink-800 p-3 text-[11.5px] text-ink-400 forge-wrap">
          <IconCheck size={11} className="inline -mt-0.5 mr-1 text-emerald-300" />
          {(FRIENDLY_FORMAT[fmt] || fmt.toUpperCase())} file ready to download — {formatBytes(doc.size)}.
        </div>
      </div>
    </div>
  );
}

function DocBlockPreview({ block }) {
  if (!block) return null;
  switch (block.type) {
    case 'cover':
      return <div className="text-[22px] font-semibold">{block.title || ''}</div>;
    case 'heading':
      return React.createElement(`h${Math.max(1, Math.min(3, block.level || 1))}`, { className: 'font-semibold' }, block.text || '');
    case 'paragraph':
      return <p className="text-[13px] leading-relaxed">{block.text || ''}</p>;
    case 'list':
      return (
        <ul className={`pl-5 text-[13px] ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {(block.items || []).map((it, i) => <li key={i}>{String(it)}</li>)}
        </ul>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full text-[12.5px] border border-zinc-200">
            {Array.isArray(block.headers) && (
              <thead className="bg-zinc-100"><tr>{block.headers.map((h, i) => <th key={i} className="px-2 py-1 text-left border-b border-zinc-200">{h}</th>)}</tr></thead>
            )}
            <tbody>{(block.rows || []).map((r, i) => <tr key={i}>{(Array.isArray(r) ? r : []).map((c, j) => <td key={j} className="px-2 py-1 border-b border-zinc-100">{String(c ?? '')}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case 'kpi':
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(block.items || []).map((it, i) => (
            <div key={i} className="rounded-md bg-violet-50 px-3 py-2">
              <div className="text-[16px] font-semibold text-violet-700">{it.value}</div>
              <div className="text-[11px] text-zinc-500">{it.label}</div>
            </div>
          ))}
        </div>
      );
    case 'divider':    return <hr className="border-zinc-200" />;
    case 'page-break': return <div className="my-2 text-[10px] uppercase tracking-wider text-zinc-400">— page break —</div>;
    default:
      return block.text ? <p className="text-[13px]">{block.text}</p> : null;
  }
}

// Minimal markdown renderer for the live preview pane.
function renderMarkdown(text) {
  const escape = (s) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const lines = (text || '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^#{1,6}\s+/.test(line)) {
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      out.push(`<h${m[1].length} class="font-semibold mt-4 mb-2">${escape(m[2])}</h${m[1].length}>`);
      i++; continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${escape(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul class="list-disc pl-5 mb-2">${items.join('')}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${escape(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol class="list-decimal pl-5 mb-2">${items.join('')}</ol>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|.*\|\s*$/.test(lines[i + 1] || '')) {
      const tableLines = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { tableLines.push(lines[i]); i++; }
      const split = (l) => l.replace(/^\s*\||\|\s*$/g, '').split('|').map(c => c.trim());
      const headers = split(tableLines[0] || '');
      const rows = tableLines.slice(2).map(split);
      out.push('<table class="min-w-full text-[12.5px] border border-zinc-200 my-3">');
      out.push('<thead class="bg-zinc-100"><tr>' + headers.map(h => `<th class="px-2 py-1 text-left border-b border-zinc-200">${escape(h)}</th>`).join('') + '</tr></thead>');
      out.push('<tbody>' + rows.map(r => '<tr>' + r.map(c => `<td class="px-2 py-1 border-b border-zinc-100">${escape(c)}</td>`).join('') + '</tr>').join('') + '</tbody>');
      out.push('</table>');
      continue;
    }
    if (/^---\s*$/.test(line)) { out.push('<hr class="my-3 border-zinc-200" />'); i++; continue; }
    if (line.trim() === '') { out.push(''); i++; continue; }
    const inline = escape(line)
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-zinc-100 text-zinc-800 font-mono text-[12.5px]">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out.push(`<p class="text-[13.5px] leading-relaxed mb-2">${inline}</p>`);
    i++;
  }
  return out.join('\n');
}
