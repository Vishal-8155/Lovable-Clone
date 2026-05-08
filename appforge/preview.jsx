// Live preview: renders the generated React project in a sandboxed iframe with a
// real virtual filesystem.
//
// Architecture
// ------------
// 1. The parent component computes a content-hash over every source file and
//    rebuilds the iframe srcdoc whenever ANY file changes.
// 2. Inside the iframe a bootstrap script:
//      - Receives the project file list (`window.__FORGE_FILES__`)
//      - Compiles each .js/.jsx/.ts/.tsx with @babel/standalone
//      - Resolves every relative/absolute import to an absolute project path
//      - Creates a Blob URL per compiled module
//      - Builds an <importmap> mapping  /src/...  →  blob:...
//      - Maps bare npm specifiers to esm.sh
//      - Dynamically `import()`s the entry, gets its default export, and mounts it
// 3. Hot reload: setting srcdoc again throws away the previous iframe document
//    along with all its blob URLs, so each rebuild starts from a clean cache.
//
// This is what makes multi-file projects actually preview correctly — a
// component in `src/components/Header.jsx` resolves through the importmap when
// `src/App.jsx` does `import Header from './components/Header'`.
import React from 'react';
import { DocumentsPane } from './docs-ui.jsx';
import { IconBolt, IconChart, IconCloud, IconCode, IconDownload, IconEye, IconFileDoc, IconLayout, IconList, IconRefresh, IconSparkles } from './icons.jsx';
import { FileBreadcrumb, FileExplorer, FileTabs, isSourceFile, pickPreviewFile } from './files.jsx';
import { highlight } from './highlighter.jsx';

// Bootstrap that runs INSIDE the preview iframe. Defined as a function so it
// keeps proper syntax highlighting / type checking and we don't have to manage
// double-escaped strings. We serialize it via `.toString()` and call it. It
// MUST be self-contained (no closures over outer scope; it only reads from
// `window.__FORGE_FILES__`, `__FORGE_ENTRY__`, `__FORGE_NPM__`).
function forgePreviewBootstrap() {
  function postToParent(payload) {
    try {
      window.parent && window.parent.postMessage(payload, '*');
    } catch (_) {}
  }

  function reportForgeError(message, stack) {
    postToParent({
      type: 'forge:preview-error',
      message: message || 'Preview runtime error',
      stack: stack || '',
    });
    var el = document.getElementById('__err');
    var body = document.getElementById('__err-body');
    if (el && body) {
      body.textContent = stack || message || 'Error';
      el.classList.add('show');
    }
  }

  function previewLog(level, msg, data) {
    postToParent({
      type: 'forge:preview-log',
      level: level || 'info',
      msg: String(msg || ''),
      data: data || null,
    });
  }

  // Mirror the iframe's console into the parent Console pane so runtime/import
  // issues show up where the auto-heal loop can see them.
  (function () {
    if (window.__FORGE_CONSOLE_PATCHED__) return;
    window.__FORGE_CONSOLE_PATCHED__ = true;
    var orig = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };
    function format(args) {
      try {
        return Array.prototype.slice.call(args).map(function (a) {
          if (typeof a === 'string') return a;
          if (a && a.message && a.stack) return a.message;
          try { return JSON.stringify(a); } catch (_) { return String(a); }
        }).join(' ');
      } catch (_) {
        return '';
      }
    }
    console.log = function () { orig.log.apply(console, arguments); previewLog('info', format(arguments)); };
    console.info = function () { orig.info.apply(console, arguments); previewLog('info', format(arguments)); };
    console.warn = function () { orig.warn.apply(console, arguments); previewLog('warn', format(arguments)); };
    console.error = function () { orig.error.apply(console, arguments); previewLog('error', format(arguments)); };
  })();

  window.addEventListener('error', function (ev) {
    var stack = (ev.error && ev.error.stack) || '';
    var message = ev.message || (ev.error && ev.error.message) || 'Error';
    reportForgeError(message, stack);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var message = (ev.reason && ev.reason.message) || String(ev.reason || 'Unhandled promise rejection');
    var stack = (ev.reason && ev.reason.stack) || '';
    reportForgeError(message, stack);
  });

  try {
    var files = window.__FORGE_FILES__ || [];
    var entry = window.__FORGE_ENTRY__;
    var npmImports = window.__FORGE_NPM__ || {};

    if (!files.length || !entry) {
      reportForgeError('No source files to render', '');
      return;
    }

    var fileMap = Object.create(null);
    files.forEach(function (f) { fileMap[f.name] = f.code; });

    function joinPath(base, rel) {
      var baseParts = base.split('/').slice(0, -1);
      var relParts = rel.split('/');
      var out = baseParts.slice();
      for (var i = 0; i < relParts.length; i++) {
        var p = relParts[i];
        if (p === '..') out.pop();
        else if (p && p !== '.') out.push(p);
      }
      var joined = out.join('/');
      return joined.charAt(0) === '/' ? joined : '/' + joined;
    }

    function resolveSpec(spec, fromPath) {
      var abs = spec.charAt(0) === '/' ? spec : joinPath(fromPath, spec);
      if (fileMap[abs] != null) return abs;
      var exts = ['.jsx', '.tsx', '.js', '.ts', '.mjs'];
      for (var i = 0; i < exts.length; i++) {
        if (fileMap[abs + exts[i]] != null) return abs + exts[i];
      }
      for (var j = 0; j < exts.length; j++) {
        if (fileMap[abs + '/index' + exts[j]] != null) return abs + '/index' + exts[j];
      }
      return null;
    }

    // Rewrite every relative / absolute import in the source so it points to
    // the canonical project path. Bare specifiers (npm packages) are left
    // alone — the importmap routes those to esm.sh.
    function rewriteImports(code, fromPath) {
      // import / export ... from '...'
      code = code.replace(
        /(\b(?:import|export)\b[^'";`\n]*?\bfrom\s*)(['"`])([^'"`\n]+)\2/g,
        function (full, prefix, quote, spec) {
          if (spec.charAt(0) !== '.' && spec.charAt(0) !== '/') return full;
          var resolved = resolveSpec(spec, fromPath);
          return resolved ? prefix + quote + resolved + quote : full;
        }
      );
      // bare side-effect imports: import '...';
      code = code.replace(
        /(\bimport\s*)(['"`])([^'"`\n]+)\2/g,
        function (full, prefix, quote, spec) {
          if (spec.charAt(0) !== '.' && spec.charAt(0) !== '/') return full;
          var resolved = resolveSpec(spec, fromPath);
          return resolved ? prefix + quote + resolved + quote : full;
        }
      );
      // dynamic imports: import('...')
      code = code.replace(
        /(\bimport\s*\(\s*)(['"`])([^'"`\n]+)\2/g,
        function (full, prefix, quote, spec) {
          if (spec.charAt(0) !== '.' && spec.charAt(0) !== '/') return full;
          var resolved = resolveSpec(spec, fromPath);
          return resolved ? prefix + quote + resolved + quote : full;
        }
      );
      return code;
    }

    // Strip every `.css` / `.scss` / `.less` import — the iframe loads
    // Tailwind via CDN; user-authored stylesheets aren't shipped in.
    function stripStyleImports(code) {
      return code
        .replace(/^[\t ]*import\s+['"][^'"]*\.(?:css|scss|sass|less)['"];?[\t ]*$/gm, '')
        .replace(/^[\t ]*import\s+[^'"\n]*\s+from\s+['"][^'"]*\.(?:css|scss|sass|less)['"];?[\t ]*$/gm, '');
    }

    // Remove the user's React imports and prepend a comprehensive prelude so
    // `React`, all common hooks, `Fragment`, etc. are always in scope inside
    // every JSX file — matching the behaviour the AI has been told to expect.
    function injectReactPrelude(code) {
      var stripped = code
        .replace(/^[\t ]*import\s+[^'";\n]*\s+from\s+['"]react['"];?[\t ]*$/gm, '')
        .replace(/^[\t ]*import\s+['"]react['"];?[\t ]*$/gm, '');
      var prelude =
        "import React, { useState, useEffect, useRef, useMemo, useCallback, " +
        "useReducer, useContext, useLayoutEffect, useImperativeHandle, " +
        "useTransition, useDeferredValue, useId, useSyncExternalStore, " +
        "createContext, Fragment, memo, forwardRef, lazy, Suspense, " +
        "StrictMode, cloneElement, isValidElement, Children } from 'react';\n";
      return prelude + stripped;
    }

    function ensureEntryExport(code) {
      if (/(^|\n)\s*export\s+default\s/.test(code)) return code;
      if (/(?:function|const|let|class)\s+App\b/.test(code)) {
        return code + '\nexport default App;\n';
      }
      var matches = code.match(/(?:function|const|let|class)\s+([A-Z]\w*)/g);
      if (matches && matches.length) {
        var last = matches[matches.length - 1].split(/\s+/).pop();
        return code + '\nexport default ' + last + ';\n';
      }
      return code;
    }

    var compiled = Object.create(null);
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var src = stripStyleImports(f.code);
      src = injectReactPrelude(src);
      src = rewriteImports(src, f.name);
      if (f.name === entry) src = ensureEntryExport(src);
      try {
        var out = window.Babel.transform(src, {
          presets: [['react', { runtime: 'classic' }]],
          sourceType: 'module',
          filename: f.name,
        }).code;
        compiled[f.name] = out;
      } catch (compileErr) {
        var msg = (compileErr && compileErr.message) || String(compileErr);
        reportForgeError('Compile error in ' + f.name + ': ' + msg, (compileErr && compileErr.stack) || '');
        return;
      }
    }

    var blobs = Object.create(null);
    for (var name in compiled) {
      blobs[name] = URL.createObjectURL(new Blob([compiled[name]], { type: 'text/javascript' }));
    }

    var importMap = { imports: {} };
    for (var k in npmImports) importMap.imports[k] = npmImports[k];
    for (var k2 in blobs) importMap.imports[k2] = blobs[k2];

    var imScript = document.createElement('script');
    imScript.type = 'importmap';
    imScript.textContent = JSON.stringify(importMap);
    document.head.appendChild(imScript);

    Promise.all([
      import(entry),
      import('react'),
      import('react-dom/client'),
    ]).then(function (results) {
      var mod = results[0];
      var React = results[1].default || results[1];
      var ReactDOM = results[2];
      var createRoot = ReactDOM.createRoot || (ReactDOM.default && ReactDOM.default.createRoot);
      var App = mod.default || mod.App || mod;
      if (typeof App !== 'function' && typeof App !== 'object') {
        reportForgeError('Entry file did not export a component (default or App)', '');
        return;
      }
      var Component = (typeof App === 'object' && App.default) ? App.default : App;
      try {
        createRoot(document.getElementById('root')).render(React.createElement(Component));
        postToParent({ type: 'forge:preview-ready' });
      } catch (mountErr) {
        reportForgeError((mountErr && mountErr.message) || 'Mount failed', (mountErr && mountErr.stack) || '');
      }
    }).catch(function (e) {
      reportForgeError((e && e.message) || String(e), (e && e.stack) || '');
    });
  } catch (e) {
    reportForgeError((e && e.message) || String(e), (e && e.stack) || '');
  }
}

// Build the iframe srcdoc. Accepts the FULL project so the iframe can compile
// every file as part of one virtual filesystem (multi-file imports work).
//
// `entryName` defaults to whatever pickPreviewFile returns, but callers can
// override (e.g. when we know the user is editing a different mountable file).
export function buildSrcDoc(files, packages = [], entryName = null) {
  // --- Static HTML projects -------------------------------------------------
  // If the project contains an index.html (or any html) and no JS/TS sources,
  // render it directly instead of forcing the React/Babel pipeline.
  const allFiles = files || [];
  const fileMapAll = Object.create(null);
  for (const f of allFiles) fileMapAll[f.name] = f.code || '';

  function joinPath(base, rel) {
    const baseParts = String(base || '').split('/').slice(0, -1);
    const relParts = String(rel || '').split('/');
    const out = baseParts.slice();
    for (let i = 0; i < relParts.length; i++) {
      const p = relParts[i];
      if (p === '..') out.pop();
      else if (p && p !== '.') out.push(p);
    }
    return out.join('/');
  }

  function buildStaticSrcDoc(htmlName) {
    const html = fileMapAll[htmlName] || '';
    const resolveAsset = (spec) => {
      if (!spec || /^(https?:)?\/\//i.test(spec) || spec.startsWith('data:')) return null;
      const abs = joinPath(htmlName, spec);
      return fileMapAll[abs] != null ? abs : (fileMapAll[spec] != null ? spec : null);
    };

    let out = String(html);
    // Inline CSS links
    out = out.replace(/<link\b([^>]*?)rel=["']stylesheet["']([^>]*?)>/gi, (full) => {
      const href = /href=["']([^"']+)["']/i.exec(full)?.[1];
      const resolved = resolveAsset(href);
      if (!resolved) return full;
      return `<style>\n${fileMapAll[resolved] || ''}\n</style>`;
    });
    // Inline JS scripts
    out = out.replace(/<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (full, pre, src, post) => {
      const resolved = resolveAsset(src);
      if (!resolved) return full;
      const isModule = /\btype=["']module["']/.test(pre + ' ' + post);
      return `<script${isModule ? ' type="module"' : ''}>\n${fileMapAll[resolved] || ''}\n</script>`;
    });

    const bridge = `
<script>
  (function () {
    function post(payload) { try { window.parent && window.parent.postMessage(payload, '*'); } catch (_) {} }
    function log(level, msg) { post({ type: 'forge:preview-log', level: level || 'info', msg: String(msg || ''), data: null }); }
    var orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    function fmt(args) {
      try { return Array.prototype.slice.call(args).map(function (a) { return typeof a === 'string' ? a : (a && a.message) ? a.message : String(a); }).join(' '); }
      catch (_) { return ''; }
    }
    console.log = function () { orig.log.apply(console, arguments); log('info', fmt(arguments)); };
    console.info = function () { orig.info.apply(console, arguments); log('info', fmt(arguments)); };
    console.warn = function () { orig.warn.apply(console, arguments); log('warn', fmt(arguments)); };
    console.error = function () { orig.error.apply(console, arguments); log('error', fmt(arguments)); };
    window.addEventListener('error', function (ev) {
      post({ type: 'forge:preview-error', message: ev.message || 'Runtime error', stack: (ev.error && ev.error.stack) || '' });
    });
    window.addEventListener('unhandledrejection', function (ev) {
      var r = ev.reason;
      post({ type: 'forge:preview-error', message: (r && r.message) || String(r || 'Unhandled rejection'), stack: (r && r.stack) || '' });
    });
    window.addEventListener('load', function () { post({ type: 'forge:preview-ready' }); });
  })();
</script>`;

    if (/<\/body>/i.test(out)) return out.replace(/<\/body>/i, bridge + '\n</body>');
    return out + bridge;
  }

  const hasSource = allFiles.some(isSourceFile);
  const htmlEntry = allFiles.find(f => /^index\.html?$/i.test(f.name)) || allFiles.find(f => /\.html?$/i.test(f.name));
  if (!hasSource && htmlEntry) {
    return buildStaticSrcDoc(htmlEntry.name);
  }

  const sourceFiles = (files || [])
    .filter(isSourceFile)
    .map(f => ({
      name: (f.name.startsWith('/') ? f.name : '/' + f.name).replace(/\/+/g, '/'),
      code: f.code || '',
    }));

  if (!sourceFiles.length) {
    return '<!doctype html><html><body style="margin:0"><div id="root"></div></body></html>';
  }

  // Resolve the entry file. We try caller-provided name first, then the canonical
  // pickPreviewFile result, then any reactish file as a last resort.
  let entryAbs = null;
  if (entryName) {
    const want = entryName.startsWith('/') ? entryName : '/' + entryName;
    entryAbs = sourceFiles.find(f => f.name === want)?.name || null;
  }
  if (!entryAbs) {
    const picked = pickPreviewFile(files);
    if (picked && isSourceFile(picked)) {
      const want = picked.name.startsWith('/') ? picked.name : '/' + picked.name;
      entryAbs = sourceFiles.find(f => f.name === want)?.name || null;
    }
  }
  if (!entryAbs) {
    entryAbs = sourceFiles.find(f => /\.(jsx|tsx)$/i.test(f.name))?.name || sourceFiles[0].name;
  }

  const npmImports = {
    'react': 'https://esm.sh/react@18.3.1',
    'react/jsx-runtime': 'https://esm.sh/react@18.3.1/jsx-runtime',
    'react/jsx-dev-runtime': 'https://esm.sh/react@18.3.1/jsx-dev-runtime',
    'react/': 'https://esm.sh/react@18.3.1/',
    'react-dom': 'https://esm.sh/react-dom@18.3.1',
    'react-dom/client': 'https://esm.sh/react-dom@18.3.1/client',
    'react-dom/': 'https://esm.sh/react-dom@18.3.1/',
  };
  for (const p of (packages || [])) {
    if (!p || npmImports[p] || p === 'react' || p === 'react-dom') continue;
    npmImports[p] = `https://esm.sh/${p}?external=react,react-dom`;
    npmImports[`${p}/`] = `https://esm.sh/${p}/`;
  }

  // Stringify the bootstrap once; embed alongside the file map.
  const bootstrapSrc = `(${forgePreviewBootstrap.toString()})();`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<script src="https://cdn.tailwindcss.com"><\/script>
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
  <script>
    // Some third-party/dev-server transformed modules (e.g. Vite HMR wrappers) expect
    // this helper to exist. The srcdoc iframe doesn't load Vite's client runtime,
    // so we provide a minimal compatible implementation to avoid hard crashes.
    (function () {
      if (typeof globalThis.__vite__injectQuery === 'function') return;
      globalThis.__vite__injectQuery = function (url, query) {
        try {
          var s = String(url);
          var q = String(query || '');
          if (!q) return s;
          var hash = '';
          var h = s.indexOf('#');
          if (h >= 0) { hash = s.slice(h); s = s.slice(0, h); }
          return s + (s.indexOf('?') >= 0 ? '&' : '?') + q + hash;
        } catch (_) {
          return url;
        }
      };
    })();
  <\/script>
  <script>
    window.__FORGE_FILES__ = ${JSON.stringify(sourceFiles)};
    window.__FORGE_ENTRY__ = ${JSON.stringify(entryAbs)};
    window.__FORGE_NPM__ = ${JSON.stringify(npmImports)};
  <\/script>
  <script>
    ${bootstrapSrc}
  <\/script>
</body>
</html>`;
}

// Build a stable content signature over every source file so the preview
// rebuilds the moment ANY file in the project changes — not just the entry
// file. Cheap rolling hash; stable across renders for unchanged content.
function fileSignature(files) {
  let h = 5381;
  if (!files) return '0';
  for (const f of files) {
    if (!isSourceFile(f)) continue;
    const name = f.name;
    for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) | 0;
    const code = f.code || '';
    h = ((h << 5) + h + code.length) | 0;
    // Hash every char so edits to long files still flip the signature.
    for (let i = 0; i < code.length; i++) h = ((h << 5) + h + code.charCodeAt(i)) | 0;
  }
  return String(h);
}

export const PreviewPane = ({ files, isLoading, packages = [], onRuntimeError, onReady, onLog }) => {
  const iframeRef = React.useRef(null);
  const [key, setKey] = React.useState(0);

  // Re-render trigger: any change to any source file flips the signature, which
  // re-runs the rebuild effect. This is what guarantees the preview always
  // matches the editor — even when the user edits a non-entry file.
  const signature = React.useMemo(() => fileSignature(files), [files]);
  const hasSource = React.useMemo(
    () => Array.isArray(files) && files.some(isSourceFile),
    [files]
  );

  React.useEffect(() => {
    const onMessage = (ev) => {
      const data = ev.data || {};
      if (!data || typeof data !== 'object') return;
      if (data.type === 'forge:preview-error') {
        onRuntimeError?.({
          message: data.message || 'Preview runtime error',
          stack: data.stack || '',
        });
      }
      if (data.type === 'forge:preview-log') {
        onLog?.({
          level: data.level || 'info',
          msg: data.msg || '',
          data: data.data || null,
          source: 'preview',
        });
      }
      if (data.type === 'forge:preview-ready') onReady?.();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onRuntimeError, onReady, onLog]);

  React.useEffect(() => {
    if (isLoading || !iframeRef.current || !hasSource) return;
    // Setting srcdoc throws away the previous iframe document — and with it
    // every blob URL the prior compile created. That's our cache-bust: each
    // rebuild starts from a clean slate, no stale modules survive.
    const doc = buildSrcDoc(files, packages);
    iframeRef.current.srcdoc = doc;
  }, [signature, key, isLoading, packages?.join('|'), hasSource]);

  // Allow the parent to request a hard reload (clears iframe module cache).
  React.useEffect(() => {
    const onReload = () => setKey(k => k + 1);
    window.addEventListener('forge:preview-reload', onReload);
    return () => window.removeEventListener('forge:preview-reload', onReload);
  }, []);

  if (isLoading) {
    return <PreviewSkeleton />;
  }

  if (!hasSource) {
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
        title="Hard reload preview (clears all cached modules)"
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

export const PreviewPanel = ({
  files, previewPackages, isLoading, onFileChange, console: consoleEntries,
  ide, onIdeChange, isEmpty, onPickSuggestion, onRuntimeError, onPreviewReady,
  docs, onRegenerateDoc, onPreviewLog,
}) => {
  const [tab, setTab] = React.useState('preview');

  // Cross-component focus events. When the user clicks "Preview" on a chat
  // DocumentCard, app.jsx fires a `forge:tab` (with detail "documents") to
  // bring the workspace to the Documents tab.
  React.useEffect(() => {
    const handler = (ev) => {
      const next = ev?.detail;
      if (typeof next === 'string') setTab(next);
    };
    window.addEventListener('forge:tab', handler);
    return () => window.removeEventListener('forge:tab', handler);
  }, []);

  // When new documents arrive (and the user hasn't manually picked a tab yet
  // this turn) auto-switch into the Documents tab so the generated file is
  // immediately visible — matches Lovable.dev "result-first" UX.
  const prevDocCount = React.useRef(0);
  React.useEffect(() => {
    const count = (docs || []).length;
    if (count > prevDocCount.current) {
      setTab('documents');
    }
    prevDocCount.current = count;
  }, [docs?.length]);

  // IDE state lives on the parent (per-conversation). We read from `ide` and propagate
  // changes up via `onIdeChange` so each chat has its own isolated editor state and
  // switching chats restores the right tabs/active file without leakage.
  const openTabs = ide?.openTabs || [];
  const activeFile = ide?.activeFile || null;
  const expanded = ide?.expanded || {};

  const setOpenTabs = React.useCallback((next) => {
    onIdeChange?.((prev) => ({
      openTabs: typeof next === 'function' ? next(prev.openTabs || []) : next,
    }));
  }, [onIdeChange]);
  const setActiveFile = React.useCallback((next) => {
    onIdeChange?.((prev) => ({
      activeFile: typeof next === 'function' ? next(prev.activeFile || null) : next,
    }));
  }, [onIdeChange]);
  const setExpanded = React.useCallback((next) => {
    onIdeChange?.((prev) => ({
      expanded: typeof next === 'function' ? next(prev.expanded || {}) : next,
    }));
  }, [onIdeChange]);

  const list = files || [];

  // When the chat resets (empty workspace), force the visible tab back to preview so
  // we don't land the user on an empty Code/Console tab from a previous conversation.
  React.useEffect(() => {
    if (isEmpty) setTab('preview');
  }, [isEmpty]);

  // Keep open tabs in sync with available files (auto-open primary). Skipped while the
  // workspace is empty — there's nothing to open and we don't want to mutate ide state.
  React.useEffect(() => {
    if (isEmpty) return;
    if (!list.length) {
      if (openTabs.length || activeFile) onIdeChange?.({ openTabs: [], activeFile: null });
      return;
    }
    const valid = openTabs.filter(n => list.find(f => f.name === n));
    let nextActive = activeFile;
    if (!valid.length) {
      const main = pickPreviewFile(list);
      if (main) { valid.push(main.name); nextActive = main.name; }
    } else if (!valid.includes(activeFile)) {
      nextActive = valid[0];
    }
    const tabsChanged = valid.length !== openTabs.length || valid.some((v, i) => v !== openTabs[i]);
    const activeChanged = nextActive !== activeFile;
    if (tabsChanged || activeChanged) {
      onIdeChange?.({
        ...(tabsChanged ? { openTabs: valid } : {}),
        ...(activeChanged ? { activeFile: nextActive } : {}),
      });
    }
  }, [list, isEmpty]);

  const cur = list.find(f => f.name === activeFile) || pickPreviewFile(list);

  const openFile = (name) => {
    setOpenTabs(t => t.includes(name) ? t : [...t, name]);
    setActiveFile(name);
    setTab('code');
  };
  const closeTab = (name) => {
    const next = openTabs.filter(x => x !== name);
    onIdeChange?.({
      openTabs: next,
      ...(name === activeFile ? { activeFile: next[next.length - 1] || null } : {}),
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
    <div className="ide-shell w-full h-full flex bg-[#0d0d14] rounded-md overflow-hidden border border-ink-800/60">
      <div className="ide-explorer w-60 flex-none border-r border-ink-800 bg-ink-900/40">
        <FileExplorer
          files={list}
          active={activeFile}
          onSelect={openFile}
          expanded={expanded}
          onExpandedChange={setExpanded}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <FileTabs tabs={openTabs} active={activeFile} onPick={(n) => { setActiveFile(n); }} onClose={closeTab} />
        <FileBreadcrumb name={cur?.name} />
        <div className="flex-1 min-h-0">
          {cur ? (
            <CodeEditor code={cur.code || ''} onChange={(v) => onFileChange(cur.name, v)} />
          ) : (
            <EmptyEditor />
          )}
        </div>
      </div>
    </div>
  );

  // Brand-new chat with no messages and no files — render a clean welcome screen
  // instead of empty editor chrome / stale placeholders. Mirrors Lovable.dev behavior.
  if (isEmpty) {
    return (
      <div className="flex-1 min-w-0 flex flex-col h-full p-3 gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="workspace-tabs flex items-center bg-ink-850 border border-ink-700 rounded-lg p-0.5 opacity-60">
            <TabBtn id="preview" icon={IconEye}>Preview</TabBtn>
            <TabBtn id="code" icon={IconCode}>Code</TabBtn>
            <TabBtn id="files" icon={IconLayout}>Files</TabBtn>
            <TabBtn id="console" icon={IconList}>Console</TabBtn>
          </div>
        </div>
        <div className="flex-1 min-h-0 relative">
          <EmptyWorkspace onPick={onPickSuggestion} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full p-3 gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="workspace-tabs flex items-center bg-ink-850 border border-ink-700 rounded-lg p-0.5">
          <TabBtn id="preview" icon={IconEye}>Preview</TabBtn>
          <TabBtn id="code" icon={IconCode}>Code</TabBtn>
          <TabBtn id="files" icon={IconLayout}>Files {list.length > 0 && <span className="ml-1 text-[10px] opacity-70">{list.length}</span>}</TabBtn>
          <TabBtn id="documents" icon={IconFileDoc}>Docs {docs?.length > 0 && <span className="ml-1 text-[10px] opacity-70">{docs.length}</span>}</TabBtn>
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
        {tab === 'preview' && (
          <PreviewPane
            files={list}
            isLoading={isLoading}
            packages={previewPackages}
            onRuntimeError={onRuntimeError}
            onReady={onPreviewReady}
            onLog={onPreviewLog}
          />
        )}
        {tab === 'code' && ideView}
        {tab === 'files' && ideView}
        {tab === 'documents' && <DocumentsPane docs={docs || []} onRegenerate={onRegenerateDoc} />}
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

const EmptyEditor = () => (
  <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
    <div className="w-10 h-10 rounded-xl bg-ink-850 border border-ink-800 flex items-center justify-center text-ink-500">
      <IconCode size={16} />
    </div>
    <div className="text-[12.5px] text-ink-300 font-medium">No file open</div>
    <div className="text-[11.5px] text-ink-500 leading-relaxed max-w-[260px]">
      Generated files appear here. Pick one from the explorer or send a prompt in chat to start building.
    </div>
  </div>
);

// Suggestion cards mirror the chat panel's prompt suggestions so the workspace
// feels like a single welcome canvas while the chat is empty.
const WORKSPACE_SUGGESTIONS = [
  { icon: IconList,  title: 'Todo app',           sub: 'drag-and-drop reordering',     prompt: 'Build a beautiful todo app with drag-and-drop reordering, priority colors, and a count of remaining tasks.' },
  { icon: IconChart, title: 'Analytics dashboard', sub: 'KPI cards + charts',          prompt: 'Create a sleek analytics dashboard with KPI cards, a line chart of weekly visitors, and a recent-activity feed.' },
  { icon: IconBolt,  title: 'SaaS landing page',  sub: 'hero, features, pricing',     prompt: 'Make a modern landing page for a SaaS product called Forge — hero, three feature cards, three pricing tiers, footer.' },
  { icon: IconCloud, title: 'Weather app',        sub: 'today + 5-day forecast',      prompt: 'Build a weather app UI showing today\'s conditions and a 5-day forecast with mock data and pretty icons.' },
];

export const EmptyWorkspace = ({ onPick }) => (
  <div className="relative w-full h-full grid-bg rounded-md overflow-hidden flex items-center justify-center aurora">
    <div className="relative z-10 w-full max-w-xl px-8 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-forge-500 to-pink-400 mb-5 shadow-2xl shadow-forge-600/30">
        <IconSparkles size={26} className="text-white" />
      </div>
      <h2 className="font-display text-[44px] leading-[1.05] text-ink-100 mb-3">
        What should we<br/><em className="text-forge-300">forge today?</em>
      </h2>
      <p className="text-[13.5px] text-ink-400 mb-7 leading-relaxed max-w-md mx-auto">
        Describe a component, screen, or full app in chat. I'll write the React + Tailwind for it and render it here, instantly.
      </p>
      {onPick && (
        <>
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-ink-500 font-mono mb-3">Try one</div>
          <div className="grid grid-cols-2 gap-2 text-left">
            {WORKSPACE_SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => onPick(s.prompt)}
                className="group p-3 rounded-lg bg-ink-850/80 hover:bg-ink-800 border border-ink-700 hover:border-forge-600/40 backdrop-blur-md transition"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <s.icon size={13} className="text-forge-300 group-hover:text-forge-200 transition" />
                  <div className="text-[12.5px] font-medium text-ink-100">{s.title}</div>
                </div>
                <div className="text-[11px] text-ink-400 leading-snug">{s.sub}</div>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mt-8 flex items-center justify-center gap-2 text-[10.5px] text-ink-500 font-mono uppercase tracking-[0.18em]">
        <span className="w-6 h-px bg-ink-600" />
        Awaiting prompt
        <span className="w-6 h-px bg-ink-600" />
      </div>
    </div>
  </div>
);

const LEVEL_STYLES = {
  cmd:   { label: 'cmd',   color: 'text-cyan-300' },
  pkg:   { label: 'pkg',   color: 'text-violet-300' },
  gen:   { label: 'gen',   color: 'text-forge-300' },
  info:  { label: 'info',  color: 'text-emerald-300' },
  warn:  { label: 'warn',  color: 'text-amber-300' },
  error: { label: 'error', color: 'text-red-400' },
};

const ConsolePane = ({ entries }) => {
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries.length]);

  return (
    <div className="w-full h-full bg-[#08080d] rounded-md overflow-hidden flex flex-col border border-ink-800/60">
      <div className="px-3 py-2 border-b border-ink-800 text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500/70" />
            <span className="w-2 h-2 rounded-full bg-amber-400/70" />
            <span className="w-2 h-2 rounded-full bg-emerald-400/70" />
          </div>
          <span className="ml-1">terminal</span>
        </div>
        <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-fine font-mono text-[12px] p-2 space-y-0.5">
        {entries.length === 0 && (
          <div className="text-ink-500 px-2 py-4">No logs yet. Generation events, package installs, and runtime errors appear here.</div>
        )}
        {entries.map((e, i) => {
          const style = LEVEL_STYLES[e.level] || LEVEL_STYLES.info;
          const isCmd = e.level === 'cmd';
          return (
            <div
              key={i}
              className={`flex gap-2 px-2 py-1 rounded transition ${isCmd ? 'bg-cyan-500/5' : 'hover:bg-ink-850/50'}`}
            >
              <span className="text-ink-600 flex-none w-16 text-[10.5px] tabular-nums">
                {new Date(e.t).toLocaleTimeString()}
              </span>
              <span className={`flex-none w-12 text-[10.5px] uppercase tracking-wider ${style.color}`}>
                {style.label}
              </span>
              <span className={`break-all whitespace-pre-wrap ${isCmd ? 'text-cyan-100 font-medium' : 'text-ink-200'}`}>
                {e.msg}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

