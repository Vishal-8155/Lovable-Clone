// Tiny JSX/JS syntax highlighter — no external lib.
// Returns a string of HTML with span.tk-* classes (matches CSS in head).
import React from 'react';
import { DocumentCard } from './docs-ui.jsx';
import { IconCheck, IconCode, IconCopy, IconEye, IconSparkles } from './icons.jsx';

const KEYWORDS = new Set([
  'const','let','var','function','return','if','else','for','while','do','switch','case',
  'break','continue','default','import','from','export','class','extends','new','this',
  'typeof','instanceof','in','of','await','async','try','catch','finally','throw',
  'true','false','null','undefined','void','yield','as'
]);

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function highlight(code) {
  // Tokenize line-by-line for stability
  const out = [];
  let i = 0;
  const src = code;
  while (i < src.length) {
    const ch = src[i];
    // Block comment
    if (ch === '/' && src[i+1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const j = end === -1 ? src.length : end + 2;
      out.push(`<span class="tk-comment">${escapeHtml(src.slice(i, j))}</span>`);
      i = j; continue;
    }
    // Line comment
    if (ch === '/' && src[i+1] === '/') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = src.length;
      out.push(`<span class="tk-comment">${escapeHtml(src.slice(i, j))}</span>`);
      i = j; continue;
    }
    // String
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === quote) { j++; break; }
        j++;
      }
      out.push(`<span class="tk-string">${escapeHtml(src.slice(i, j))}</span>`);
      i = j; continue;
    }
    // JSX tag-ish: <Foo  or </Foo
    if (ch === '<' && /[A-Za-z\/]/.test(src[i+1] || '')) {
      let j = i + 1;
      // capture tag name
      while (j < src.length && /[A-Za-z0-9._\/]/.test(src[j])) j++;
      out.push(`<span class="tk-tag">${escapeHtml(src.slice(i, j))}</span>`);
      i = j; continue;
    }
    // Number
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9._a-fA-FxX]/.test(src[j])) j++;
      out.push(`<span class="tk-number">${escapeHtml(src.slice(i, j))}</span>`);
      i = j; continue;
    }
    // Identifier / keyword
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      // Function call hint
      const isFn = src[j] === '(';
      if (KEYWORDS.has(word)) {
        out.push(`<span class="tk-keyword">${escapeHtml(word)}</span>`);
      } else if (isFn) {
        out.push(`<span class="tk-fn">${escapeHtml(word)}</span>`);
      } else {
        out.push(escapeHtml(word));
      }
      i = j; continue;
    }
    // Default: pass through (escaped)
    out.push(escapeHtml(ch));
    i++;
  }
  return out.join('');
}

// Extract first ```jsx / ```js / ```javascript / ```tsx code block.
export function extractCode(text) {
  if (!text) return null;
  const re = /```(?:jsx|js|javascript|tsx|ts|react)?\s*\n([\s\S]*?)```/i;
  const m = text.match(re);
  if (m) return m[1].trim();
  // Try unclosed (still streaming)
  const reOpen = /```(?:jsx|js|javascript|tsx|ts|react)?\s*\n([\s\S]*)$/i;
  const m2 = text.match(reOpen);
  if (m2) return m2[1].trim();
  return null;
}

// Render markdown-ish content with code blocks and document blocks.
// We split on ``` fences. Code blocks become summary cards (no inline code shown);
// the actual code lives in the workspace pane on the right. `forge-doc` blocks
// become DocumentCard cards showing download/preview buttons for AI-generated
// documents — the materialized blob lives on `opts.docs[i]` (parsed and built
// once streaming finishes; see app.jsx).
export function renderMessageBody(text, opts = {}) {
  if (!text) return null;
  const parts = [];
  let rest = text;
  let key = 0;
  let codeIdx = 0;
  let docIdx = 0;
  // Permissive fence: lang token may include hyphen (e.g. `forge-doc`); the
  // rest of the opening line is treated as freeform headers (filename=…,
  // format=…, etc) and parsed below.
  const fenceRe = /```([\w-]+)?([^\n]*)\n([\s\S]*?)(```|$)/;
  while (rest.length) {
    const m = rest.match(fenceRe);
    if (!m) {
      parts.push(<MdProse key={key++} text={rest} />);
      break;
    }
    const before = rest.slice(0, m.index);
    if (before) parts.push(<MdProse key={key++} text={before} />);
    const lang = m[1] || 'jsx';
    const headers = m[2] || '';
    const body = m[3];
    const closed = m[4] === '```';

    if (lang === 'forge-doc') {
      const myIdx = docIdx++;
      const filenameMatch = headers.match(/filename\s*=\s*["']([^"']+)["']/i);
      const formatMatch = headers.match(/format\s*=\s*["']([^"']+)["']/i);
      const realized = (opts.docs || [])[myIdx];
      const fallbackName = filenameMatch?.[1] || `document-${myIdx + 1}`;
      const fallbackFormat = (formatMatch?.[1] || fallbackName.split('.').pop() || 'pdf').toLowerCase();
      const placeholder = realized || {
        id: `pending_${myIdx}`,
        filename: fallbackName,
        format: fallbackFormat,
        spec: null,
        url: null,
        size: 0,
        generatedAt: Date.now(),
        error: null,
      };
      parts.push(
        <DocumentCard
          key={key++}
          doc={placeholder}
          onPreview={opts.onPreviewDoc}
          onRegenerate={opts.onRegenerateDoc}
        />
      );
    } else {
      const fnameMatch = headers.match(/(?:filename=)?["']?([\w./\-]+\.[\w]+)["']?/);
      const fname = fnameMatch ? fnameMatch[1] : null;
      parts.push(
        <CodeSummaryCard
          key={key++}
          index={codeIdx++}
          lang={lang}
          filename={fname}
          code={body}
          streaming={!closed}
          onPreview={opts.onPreview}
          onCopy={opts.onCopy}
        />
      );
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return parts;
}

export function MdProse({ text }) {
  const html = text
    .split('\n\n')
    .map(p => escapeHtml(p)
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-forge-900/40 text-forge-200 font-mono text-[12.5px] break-all">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white">$1</strong>')
      .replace(/\n/g, '<br/>')
    )
    .filter(p => p.trim())
    .map(p => `<p class="mb-2 last:mb-0">${p}</p>`)
    .join('');
  if (!html) return null;
  return (
    <div
      className="text-[14px] leading-relaxed text-ink-200 forge-wrap max-w-full"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Compact card shown in chat instead of inline code. Mirrors Lovable's "what changed" summary.
export function CodeSummaryCard({ index, lang, filename, code, streaming, onPreview, onCopy }) {
  const [showDetails, setShowDetails] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const lines = (code || '').split('\n').length;
  const title = filename
    ? `Updated ${filename}`
    : index === 0 ? 'Generated component' : `Generated file ${index + 1}`;
  const subtitle = streaming
    ? 'Writing code…'
    : `${lines} line${lines === 1 ? '' : 's'} · ${lang.toUpperCase()}`;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopy?.(code);
  };

  return (
    <div className="my-2 rounded-xl bg-ink-850 border border-ink-700 overflow-hidden">
      <div className="flex items-start gap-3 px-3.5 py-2.5">
        <div className={`flex-none w-7 h-7 rounded-md flex items-center justify-center ${streaming ? 'bg-forge-600/20 text-forge-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
          {streaming ? <IconSparkles size={13} className="animate-pulse-soft" /> : <IconCheck size={13} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-ink-100 truncate">{title}</div>
          <div className="text-[11px] text-ink-400 font-mono mt-0.5 flex items-center gap-1.5">
            {streaming && <span className="typing-dot" style={{ width: 4, height: 4 }} />}
            {subtitle}
          </div>
        </div>
      </div>
      {!streaming && (
        <div className="flex items-stretch border-t border-ink-700/70">
          <button
            onClick={() => setShowDetails(s => !s)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] text-ink-200 hover:bg-ink-800 transition border-r border-ink-700/70"
          >
            <IconCode size={12} /> {showDetails ? 'Hide' : 'Details'}
          </button>
          <button
            onClick={() => onPreview?.()}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] text-ink-200 hover:bg-ink-800 transition border-r border-ink-700/70"
          >
            <IconEye size={12} /> Preview
          </button>
          <button
            onClick={handleCopy}
            className="px-3 py-2 text-[12px] text-ink-300 hover:text-white hover:bg-ink-800 transition flex items-center gap-1.5"
          >
            {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {showDetails && !streaming && (
        <pre className="code-block !rounded-none !border-0 !border-t border-ink-700/70 max-h-64 overflow-auto">
          <code dangerouslySetInnerHTML={{ __html: highlight(code) }} />
        </pre>
      )}
    </div>
  );
}

export function CodeBlock({ lang, code, closed, onCopy }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopy?.(code);
  };
  return (
    <div className="my-2 group relative">
      <div className="flex items-center justify-between px-3 py-1.5 bg-forge-900/30 rounded-t-[10px] border border-forge-600/20 border-b-0 text-[11px] text-ink-400">
        <span className="font-mono uppercase tracking-wider">{lang || 'jsx'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-forge-600/20 transition text-ink-300 hover:text-white"
        >
          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="code-block !rounded-t-none !border-t-0">
        <code dangerouslySetInnerHTML={{ __html: highlight(code) }} />
        {!closed && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-forge-400 animate-pulse-soft align-middle" />}
      </pre>
    </div>
  );
}

