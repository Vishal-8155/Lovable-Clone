// Live preview: renders generated React component in a sandboxed iframe.
// Uses srcDoc with Babel + React loaded from CDN — substituting for Sandpack so the
// whole thing works fully client-side without bundling.
//
// Code tab uses a textarea with line numbers and live syntax highlight overlay
// (a "poor-man's Monaco" — full Monaco needs heavy CDN setup; this is fast and edits live).
import React from 'react';
import { IconCode, IconDownload, IconEye, IconLayout, IconList, IconRefresh, IconSparkles } from './icons.jsx';
import { FileBreadcrumb, FileExplorer, FileTabs, loadIde, pickPreviewFile, saveIde } from './files.jsx';
import { highlight } from './highlighter.jsx';

export function buildSrcDoc(code) {
  // Normalize: strip imports/exports so the code can run in isolation
  let body = code || '';
  // Strip all import statements (single-line and multi-line)
  body = body.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  body = body.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
  body = body.replace(/^\s*import\s*\{[\s\S]*?\}\s*from\s+['"][^'"]+['"];?\s*$/gm, '');
  body = body.replace(/^\s*export\s+default\s+/gm, '');
  body = body.replace(/^\s*export\s+/gm, '');

  // Find the component name to mount. Prefer "App", else the last PascalCase function/const.
  let mountName = null;
  if (/(?:function|const|let)\s+App\b/.test(body)) {
    mountName = 'App';
  } else {
    const m1 = [...body.matchAll(/(?:function|const|let)\s+([A-Z][A-Za-z0-9_]*)/g)];
    if (m1.length) mountName = m1[m1.length - 1][1];
  }
  if (!mountName) mountName = 'App';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<script src="https://cdn.tailwindcss.com"><\/script>
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"><\/script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"><\/script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"><\/script>
<style>
  html, body { margin:0; padding:0; min-height:100%; background: #fff; font-family: ui-sans-serif, system-ui, sans-serif; }
  #__err {
    position: fixed; inset: 0; background: #fef2f2; color: #991b1b;
    padding: 24px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12.5px;
    white-space: pre-wrap; overflow: auto; line-height: 1.55;
    display: none;
  }
  #__err.show { display: block; }
  #__err h3 { margin: 0 0 12px; font-family: ui-sans-serif, system-ui; font-size: 14px; color: #7f1d1d; }
</style>
</head>
<body>
  <div id="root"></div>
  <div id="__err"><h3>Runtime error</h3><div id="__err-body"></div></div>
  <script type="text/babel" data-presets="react">
    const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, useLayoutEffect, createContext, Fragment, memo, forwardRef } = React;
    try {
      ${body}

      const __mount = typeof ${mountName} !== 'undefined' ? ${mountName} : null;
      if (!__mount) {
        document.getElementById('__err-body').textContent = 'No component named ${mountName} found.';
        document.getElementById('__err').classList.add('show');
      } else {
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(__mount));
      }
    } catch (e) {
      document.getElementById('__err-body').textContent = (e && e.message) ? e.message + '\\n\\n' + (e.stack || '') : String(e);
      document.getElementById('__err').classList.add('show');
    }
  <\/script>
  <script>
    window.addEventListener('error', function(ev){
      const el = document.getElementById('__err');
      const body = document.getElementById('__err-body');
      if (el && body) { body.textContent = (ev.error && ev.error.stack) ? ev.error.stack : (ev.message || 'Error'); el.classList.add('show'); }
    });
  <\/script>
</body>
</html>`;
}

export const PreviewPane = ({ code, isLoading }) => {
  const iframeRef = React.useRef(null);
  const [key, setKey] = React.useState(0);

  React.useEffect(() => {
    if (isLoading || !iframeRef.current || !code) return;
    const doc = buildSrcDoc(code);
    iframeRef.current.srcdoc = doc;
  }, [code, key, isLoading]);

  if (isLoading) {
    return <PreviewSkeleton />;
  }

  if (!code) {
    return <WelcomePreview />;
  }

  return (
    <div className="relative w-full h-full bg-white rounded-md overflow-hidden">
      <iframe
        key={key}
        ref={iframeRef}
        className="preview-frame"
        sandbox="allow-scripts"
        title="Live Preview"
      />
      <button
        onClick={() => setKey(k => k + 1)}
        className="absolute top-3 right-3 p-1.5 rounded-md glass text-ink-300 hover:text-white transition"
        title="Reload preview"
      >
        <IconRefresh size={13} />
      </button>
    </div>
  );
};

export const PreviewSkeleton = () => (
  <div className="w-full h-full flex flex-col gap-3 p-6 bg-ink-900 rounded-md">
    <div className="flex items-center gap-2 mb-2">
      <div className="flex gap-1.5">
        <span className="w-2 h-2 rounded-full bg-forge-500 animate-pulse-soft" />
        <span className="w-2 h-2 rounded-full bg-forge-500 animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
        <span className="w-2 h-2 rounded-full bg-forge-500 animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
      </div>
      <span className="text-[11px] uppercase tracking-[0.16em] text-forge-300 font-mono">forging</span>
    </div>
    <div className="h-9 w-2/5 rounded skeleton" />
    <div className="h-4 w-3/5 rounded skeleton" />
    <div className="grid grid-cols-3 gap-3 mt-3">
      <div className="h-28 rounded skeleton" />
      <div className="h-28 rounded skeleton" />
      <div className="h-28 rounded skeleton" />
    </div>
    <div className="h-4 w-1/2 rounded skeleton mt-3" />
    <div className="h-4 w-2/3 rounded skeleton" />
    <div className="h-12 w-32 rounded skeleton mt-2" />
  </div>
);

export const WelcomePreview = () => (
  <div className="relative w-full h-full grid-bg rounded-md overflow-hidden flex items-center justify-center aurora">
    <div className="relative z-10 text-center px-8 max-w-md">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-forge-500 to-pink-400 mb-5 shadow-2xl shadow-forge-600/30">
        <IconSparkles size={26} className="text-white" />
      </div>
      <h2 className="font-display text-[44px] leading-[1.05] text-ink-100 mb-3">
        Describe it.<br/><em className="text-forge-300">Watch it appear.</em>
      </h2>
      <p className="text-[14px] text-ink-400 mb-6 leading-relaxed">
        Your component renders here, live, the moment generation starts. Edit the code on the right tab — the preview reflows instantly.
      </p>
      <div className="flex items-center justify-center gap-2 text-[11px] text-ink-500 font-mono uppercase tracking-[0.18em]">
        <span className="w-6 h-px bg-ink-600" />
        Awaiting prompt
        <span className="w-6 h-px bg-ink-600" />
      </div>
    </div>
  </div>
);

// Code editor — textarea + highlight overlay + line numbers
export const CodeEditor = ({ code, onChange }) => {
  const taRef = React.useRef(null);
  const overlayRef = React.useRef(null);
  const gutterRef = React.useRef(null);

  const handleScroll = () => {
    if (!taRef.current || !overlayRef.current || !gutterRef.current) return;
    overlayRef.current.scrollTop = taRef.current.scrollTop;
    overlayRef.current.scrollLeft = taRef.current.scrollLeft;
    gutterRef.current.scrollTop = taRef.current.scrollTop;
  };

  const handleKey = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = taRef.current;
      const start = ta.selectionStart, end = ta.selectionEnd;
      const next = code.slice(0, start) + '  ' + code.slice(end);
      onChange(next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  };

  const lines = (code || '').split('\n');
  const html = highlight(code || '');

  return (
    <div className="relative w-full h-full bg-[#0d0d14] rounded-md overflow-hidden flex font-mono text-[12.5px] leading-[1.6]">
      <div
        ref={gutterRef}
        className="select-none text-right py-3 pl-3 pr-3 text-ink-500 bg-[#0a0a10] border-r border-ink-800 overflow-hidden flex-none"
        style={{ minWidth: 44 }}
      >
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="relative flex-1 overflow-hidden">
        <pre
          ref={overlayRef}
          aria-hidden
          className="absolute inset-0 m-0 p-3 pointer-events-none whitespace-pre overflow-auto text-ink-200"
          dangerouslySetInnerHTML={{ __html: html + '\n' }}
        />
        <textarea
          ref={taRef}
          value={code || ''}
          spellCheck={false}
          onChange={e => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKey}
          className="absolute inset-0 m-0 p-3 w-full h-full bg-transparent text-transparent caret-forge-300 selection:bg-forge-600/40 outline-none resize-none whitespace-pre overflow-auto scroll-fine"
          style={{ WebkitTextFillColor: 'transparent' }}
        />
      </div>
    </div>
  );
};

export const PreviewPanel = ({ files, previewCode, isLoading, onFileChange, console: consoleEntries }) => {
  const initial = loadIde();
  const [tab, setTab] = React.useState('preview');
  const [openTabs, setOpenTabs] = React.useState(initial.openTabs || []);
  const [activeFile, setActiveFile] = React.useState(initial.activeFile || null);
  const scrollPosRef = React.useRef({});

  const list = files || [];

  // Keep open tabs in sync with available files (auto-open primary)
  React.useEffect(() => {
    if (!list.length) { setOpenTabs([]); setActiveFile(null); return; }
    const valid = openTabs.filter(n => list.find(f => f.name === n));
    let nextActive = activeFile;
    if (!valid.length) {
      const main = pickPreviewFile(list);
      valid.push(main.name);
      nextActive = main.name;
    } else if (!valid.includes(activeFile)) {
      nextActive = valid[0];
    }
    if (valid.length !== openTabs.length || valid.some((v, i) => v !== openTabs[i])) setOpenTabs(valid);
    if (nextActive !== activeFile) setActiveFile(nextActive);
  }, [list]);

  React.useEffect(() => { saveIde({ ...loadIde(), openTabs, activeFile }); }, [openTabs, activeFile]);

  const cur = list.find(f => f.name === activeFile) || pickPreviewFile(list);

  const openFile = (name) => {
    setOpenTabs(t => t.includes(name) ? t : [...t, name]);
    setActiveFile(name);
    setTab('code');
  };
  const closeTab = (name) => {
    setOpenTabs(t => {
      const next = t.filter(x => x !== name);
      if (name === activeFile) setActiveFile(next[next.length - 1] || null);
      return next;
    });
  };

  const lineCount = (cur?.code || '').split('\n').length;
  const charCount = (cur?.code || '').length;

  const downloadAll = () => {
    if (!list.length) return;
    if (list.length === 1) {
      const f = list[0];
      const blob = new Blob([f.code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.name.split('/').pop(); a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const bundle = list.map(f => `// ===== ${f.name} =====\n${f.code}\n`).join('\n');
    const blob = new Blob([bundle], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'AppForge-bundle.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  const TabBtn = ({ id, icon: Ic, children }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition ${
        tab === id ? 'bg-forge-600 text-white shadow-lg shadow-forge-900/40' : 'text-ink-300 hover:text-white'
      }`}
    >
      <Ic size={13} /> {children}
    </button>
  );

  const ideView = (
    <div className="w-full h-full flex bg-[#0d0d14] rounded-md overflow-hidden border border-ink-800/60">
      <div className="w-60 flex-none border-r border-ink-800 bg-ink-900/40">
        <FileExplorer files={list} active={activeFile} onSelect={openFile} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <FileTabs tabs={openTabs} active={activeFile} onPick={(n) => { setActiveFile(n); }} onClose={closeTab} />
        <FileBreadcrumb name={cur?.name} />
        <div className="flex-1 min-h-0">
          {cur ? (
            <CodeEditor code={cur.code || ''} onChange={(v) => onFileChange(cur.name, v)} />
          ) : (
            <div className="p-6 text-[12px] text-ink-500 font-mono">Open a file from the explorer to view it.</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full p-3 gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center bg-ink-850 border border-ink-700 rounded-lg p-0.5">
          <TabBtn id="preview" icon={IconEye}>Preview</TabBtn>
          <TabBtn id="code" icon={IconCode}>Code</TabBtn>
          <TabBtn id="files" icon={IconLayout}>Files {list.length > 0 && <span className="ml-1 text-[10px] opacity-70">{list.length}</span>}</TabBtn>
          <TabBtn id="console" icon={IconList}>Console {consoleEntries?.length > 0 && <span className="ml-1 text-[10px] opacity-70">{consoleEntries.length}</span>}</TabBtn>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-400 font-mono">
          {cur && (tab === 'code' || tab === 'files') && (
            <>
              <span><span className="text-ink-500">lines</span> {lineCount}</span>
              <span><span className="text-ink-500">chars</span> {charCount.toLocaleString()}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        {tab === 'preview' && <PreviewPane code={previewCode} isLoading={isLoading} />}
        {tab === 'code' && ideView}
        {tab === 'files' && ideView}
        {tab === 'console' && <ConsolePane entries={consoleEntries || []} />}
      </div>
      {list.length > 0 && (
        <button onClick={downloadAll} className="flex-none flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-ink-850 hover:bg-ink-800 border border-ink-700 hover:border-forge-500/40 text-[12.5px] text-ink-100 transition shadow-lg shadow-black/30 hover:shadow-forge-900/30">
          <IconDownload size={13} className="text-forge-300" />
          <span className="font-medium">Download codebase</span>
          <span className="text-ink-500 font-mono text-[10.5px]">{list.length} file{list.length === 1 ? '' : 's'}</span>
        </button>
      )}
    </div>
  );
};

const ConsolePane = ({ entries }) => (
  <div className="w-full h-full bg-[#0a0a10] rounded-md overflow-hidden flex flex-col">
    <div className="px-3 py-2 border-b border-ink-800 text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink-500 flex items-center justify-between">
      <span>console</span>
      <span>{entries.length} entries</span>
    </div>
    <div className="flex-1 overflow-y-auto scroll-fine font-mono text-[12px] p-2 space-y-0.5">
      {entries.length === 0 && (
        <div className="text-ink-500 px-2 py-4">No logs yet. Generation events and runtime errors appear here.</div>
      )}
      {entries.map((e, i) => (
        <div key={i} className="flex gap-2 px-2 py-1 rounded hover:bg-ink-850/50">
          <span className="text-ink-600 flex-none w-16 text-[10.5px]">{new Date(e.t).toLocaleTimeString()}</span>
          <span className={`flex-none w-12 text-[10.5px] uppercase ${
            e.level === 'error' ? 'text-red-400' :
            e.level === 'warn' ? 'text-amber-300' :
            e.level === 'gen' ? 'text-forge-300' : 'text-emerald-300'
          }`}>{e.level}</span>
          <span className="text-ink-200 break-all whitespace-pre-wrap">{e.msg}</span>
        </div>
      ))}
    </div>
  </div>
);

