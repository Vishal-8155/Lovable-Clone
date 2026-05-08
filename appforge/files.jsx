// IDE-style file explorer + multi-tab editor.
// Renders a real hierarchical tree, file-type icons, search, and persistent UI state.
import React from 'react';

export const LANG_TO_EXT = {
  jsx: 'jsx', tsx: 'tsx', js: 'js', javascript: 'js', ts: 'ts', typescript: 'ts',
  html: 'html', css: 'css', json: 'json', md: 'md', python: 'py', py: 'py',
  bash: 'sh', sh: 'sh', yaml: 'yml', yml: 'yml', go: 'go', rust: 'rs', rs: 'rs',
  java: 'java', php: 'php', sql: 'sql', txt: 'txt',
};
export const EXT_TO_LANG = Object.fromEntries(Object.entries(LANG_TO_EXT).map(([k, v]) => [v, k]));

export function defaultFilename(lang, idx) {
  const ext = LANG_TO_EXT[lang?.toLowerCase()] || 'txt';
  if (ext === 'jsx' || ext === 'tsx' || ext === 'js') return `src/App${idx ? idx : ''}.${ext}`;
  if (ext === 'html') return `index.html`;
  if (ext === 'css') return `styles.css`;
  if (ext === 'json') return `package.json`;
  if (ext === 'md') return `README.md`;
  return `file${idx || ''}.${ext}`;
}

export function extractFiles(text) {
  if (!text) return [];
  const files = [];
  const re = /(?:^|\n)(?:\/\/\s*([^\n]+?)\s*\n)?```([a-zA-Z0-9+-]*)?(?:\s+(?:filename=)?["']?([^\n"'`]+?)["']?)?\s*\n([\s\S]*?)(```|$)/g;
  let m, idx = 0;
  while ((m = re.exec(text)) !== null) {
    const [, commentName, lang, fenceName, code, closing] = m;
    let name = (fenceName && fenceName.includes('.')) ? fenceName : (commentName && commentName.includes('.') ? commentName : null);
    if (!name) name = defaultFilename(lang, idx ? idx : '');
    files.push({ name: name.trim(), lang: (lang || name.split('.').pop() || 'txt').toLowerCase(), code: code.trimEnd(), complete: closing === '```' });
    idx++;
  }
  return files;
}

// Extract delete / rename / move operations the model can emit alongside file
// fences. The protocol is intentionally minimal so it survives prose well:
//   [forge:delete src/old/path.jsx]
//   [forge:rename src/old.jsx -> src/new.jsx]
//   [forge:move   src/foo.jsx => src/components/foo.jsx]
export function extractDeletes(text) {
  if (!text) return [];
  const out = [];
  const re = /\[forge:delete\s+([^\]\n]+?)\s*\]/gi;
  let m;
  while ((m = re.exec(text))) out.push(m[1].trim());
  return [...new Set(out)];
}

export function extractRenames(text) {
  if (!text) return [];
  const out = [];
  const re = /\[forge:(?:rename|move)\s+([^\]\n]+?)\s*(?:->|=>|→)\s*([^\]\n]+?)\s*\]/gi;
  let m;
  while ((m = re.exec(text))) out.push({ from: m[1].trim(), to: m[2].trim() });
  return out;
}

// Aggregate every operation present in the streamed text so far.
export function extractOps(text) {
  return {
    files: extractFiles(text),
    deletes: extractDeletes(text),
    renames: extractRenames(text),
  };
}

// Merge a set of operations into the existing file list. This is the heart of
// the "evolve the same project" behavior — files NOT mentioned in `ops` are
// preserved untouched. Renames are applied first (so a rename + update in the
// same turn lands at the new path), then deletes, then creates/updates.
export function applyOps(existing, ops) {
  let next = [...(existing || [])];

  for (const r of ops?.renames || []) {
    const i = next.findIndex(f => f.name === r.from);
    if (i >= 0) next[i] = { ...next[i], name: r.to };
  }

  if (ops?.deletes?.length) {
    const drop = new Set(ops.deletes);
    next = next.filter(f => !drop.has(f.name));
  }

  for (const f of ops?.files || []) {
    const i = next.findIndex(x => x.name === f.name);
    if (i >= 0) next[i] = { ...next[i], ...f };
    else next.push(f);
  }

  return next;
}

// Same as applyOps but only treats COMPLETE files as updates so we don't
// clobber the previous good version of a file with a half-streamed fence.
// Used during streaming for live preview updates.
export function applyOpsLive(existing, ops) {
  const safeFiles = (ops?.files || []).filter(f => f.complete);
  return applyOps(existing, { ...ops, files: safeFiles });
}

export function pickPreviewFile(files) {
  if (!files || !files.length) return null;
  // Strong preferences for the canonical entry — fall through to anything reactish.
  const ENTRY_PRIORITY = [
    /^(?:\/)?src\/App\.(jsx|tsx)$/i,
    /^(?:\/)?App\.(jsx|tsx)$/i,
    /^(?:\/)?src\/main\.(jsx|tsx)$/i,
    /^(?:\/)?src\/index\.(jsx|tsx)$/i,
    /^(?:\/)?src\/pages\/index\.(jsx|tsx)$/i,
  ];
  for (const re of ENTRY_PRIORITY) {
    const hit = files.find(f => re.test(f.name));
    if (hit) return hit;
  }
  const reactish = files.find(f => /\.(jsx|tsx)$/.test(f.name));
  if (reactish) return reactish;
  const html = files.find(f => /\.html?$/.test(f.name));
  if (html) return html;
  return files[0];
}

// Whether a file is a compilable JS/TS source. Used to filter the project down
// to the modules the live preview should ship into the iframe's virtual FS.
export function isSourceFile(file) {
  return !!file && typeof file.name === 'string' && /\.(jsx|tsx|js|ts|mjs|cjs)$/i.test(file.name);
}

export function buildTree(files) {
  const root = { name: '', children: {}, file: null, isDir: true, path: '' };
  for (const f of files) {
    const parts = f.name.split('/');
    let cur = root, accum = '';
    parts.forEach((p, i) => {
      accum = accum ? accum + '/' + p : p;
      if (i === parts.length - 1) {
        cur.children[p] = { name: p, file: f, isDir: false, children: {}, path: accum };
      } else {
        if (!cur.children[p]) cur.children[p] = { name: p, isDir: true, children: {}, file: null, path: accum };
        cur = cur.children[p];
      }
    });
  }
  return root;
}

// SVG file/folder icons — IDE-style
export function FolderIcon({ open, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.4 1.4h6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4.5Z"
        fill={open ? '#a78bfa' : '#7c3aed'} fillOpacity={open ? 0.85 : 0.6} stroke="currentColor" strokeOpacity="0.2" />
    </svg>
  );
}

export function FileTypeIcon({ name, size = 14 }) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    jsx: { color: '#61dafb', glyph: 'JSX' },
    tsx: { color: '#3178c6', glyph: 'TSX' },
    js:  { color: '#f7df1e', glyph: 'JS' },
    ts:  { color: '#3178c6', glyph: 'TS' },
    html:{ color: '#e34c26', glyph: '◇' },
    css: { color: '#2196f3', glyph: '✦' },
    json:{ color: '#cbd5e1', glyph: '{}' },
    md:  { color: '#94a3b8', glyph: 'MD' },
    py:  { color: '#3776ab', glyph: 'PY' },
    sh:  { color: '#94a3b8', glyph: '$_' },
    yml: { color: '#cb171e', glyph: 'YML' },
    yaml:{ color: '#cb171e', glyph: 'YML' },
    png: { color: '#a78bfa', glyph: '◧' },
    svg: { color: '#f59e0b', glyph: '<>' },
  };
  const meta = map[ext] || { color: '#71717a', glyph: '·' };
  return (
    <span
      className="inline-flex items-center justify-center font-mono font-semibold rounded-sm flex-none"
      style={{ width: size, height: size, fontSize: size * 0.5, color: meta.color, lineHeight: 1 }}
    >{meta.glyph}</span>
  );
}

const FileTreeRow = ({ node, depth, expanded, toggleDir, onSelect, onContext, active, query }) => {
  const isDir = node.isDir;
  const isOpen = expanded[node.path] !== false; // default open
  const matches = !query || node.name.toLowerCase().includes(query.toLowerCase()) || (!isDir && node.path.toLowerCase().includes(query.toLowerCase()));
  if (query && !isDir && !matches) return null;

  if (isDir) {
    const children = Object.values(node.children).sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    // when filtering, only render dir if any descendant matches
    if (query) {
      const hasMatch = (n) => Object.values(n.children).some(c => c.isDir ? hasMatch(c) : (c.name.toLowerCase().includes(query.toLowerCase()) || c.path.toLowerCase().includes(query.toLowerCase())));
      if (!hasMatch(node)) return null;
    }
    return (
      <div>
        <button
          onClick={() => toggleDir(node.path)}
          onDoubleClick={() => toggleDir(node.path)}
          onContextMenu={e => onContext?.(e, node)}
          className="group w-full flex items-center gap-1.5 px-2 py-[3px] rounded-md hover:bg-ink-800/70 text-ink-200 text-left transition"
          style={{ paddingLeft: 6 + depth * 12 }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className={`text-ink-500 transition-transform ${isOpen ? 'rotate-90' : ''} flex-none`}>
            <path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <FolderIcon open={isOpen} />
          <span className="text-[12.5px] truncate">{node.name}</span>
        </button>
        {isOpen && children.map(c => (
          <FileTreeRow key={c.path} node={c} depth={depth + 1} expanded={expanded} toggleDir={toggleDir} onSelect={onSelect} onContext={onContext} active={active} query={query} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.file.name)}
      onContextMenu={e => onContext?.(e, node)}
      className={`group w-full flex items-center gap-1.5 px-2 py-[3px] rounded-md text-left transition ${
        active === node.file.name ? 'bg-forge-600/25 text-white' : 'text-ink-300 hover:bg-ink-800/70 hover:text-white'
      }`}
      style={{ paddingLeft: 6 + depth * 12 + 14 }}
    >
      <FileTypeIcon name={node.name} />
      <span className="text-[12.5px] truncate">{node.name}</span>
    </button>
  );
};

// FileExplorer is fully controlled — `expanded` (folder open/closed map) is owned by
// the parent so it can be stored per-conversation. This prevents one chat's expansion
// state from leaking into another and ensures a fresh chat starts clean.
export function FileExplorer({ files, active, onSelect, onContext, expanded: expandedProp, onExpandedChange }) {
  const [query, setQuery] = React.useState('');
  const [internalExpanded, setInternalExpanded] = React.useState({});
  const isControlled = expandedProp !== undefined;
  const expanded = isControlled ? expandedProp : internalExpanded;

  const toggleDir = (path) => {
    const next = { ...expanded, [path]: expanded[path] === false ? true : false };
    if (isControlled) onExpandedChange?.(next);
    else setInternalExpanded(next);
  };

  const tree = React.useMemo(() => buildTree(files || []), [files]);
  const rootEntries = Object.values(tree.children).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (!files || files.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <ExplorerHeader query={query} setQuery={setQuery} />
        <div className="p-4 text-[11.5px] text-ink-500 leading-relaxed">
          No files yet.<br/>Generated files will appear here as a project tree.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <ExplorerHeader query={query} setQuery={setQuery} count={files.length} />
      <div className="flex-1 overflow-y-auto scroll-fine py-1.5">
        {rootEntries.map(c => (
          <FileTreeRow key={c.path} node={c} depth={0} expanded={expanded} toggleDir={toggleDir} onSelect={onSelect} onContext={onContext} active={active} query={query} />
        ))}
      </div>
    </div>
  );
}

function ExplorerHeader({ query, setQuery, count }) {
  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink-800/80">
        <div className="text-[10.5px] uppercase tracking-[0.16em] text-ink-400 font-mono">explorer</div>
        {count != null && <span className="text-[10.5px] text-ink-500 font-mono">{count}</span>}
      </div>
      <div className="px-2 py-2 border-b border-ink-800/60">
        <div className="relative">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search files…"
            className="w-full pl-7 pr-2 py-1.5 rounded-md bg-ink-850 border border-ink-700 focus:border-forge-500/60 text-[12px] text-ink-200 placeholder-ink-500 outline-none"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-500 text-[11px]">⌕</span>
        </div>
      </div>
    </>
  );
}

// Tab bar for opened files
export function FileTabs({ tabs, active, onPick, onClose }) {
  if (!tabs.length) return null;
  return (
    <div className="flex items-stretch overflow-x-auto scroll-fine border-b border-ink-800/80 bg-ink-900/40 flex-none">
      {tabs.map(name => {
        const isActive = name === active;
        const short = name.split('/').pop();
        return (
          <div
            key={name}
            className={`group flex items-center gap-1.5 px-3 py-1.5 border-r border-ink-800/80 cursor-pointer text-[12px] transition flex-none ${
              isActive ? 'bg-ink-850 text-white' : 'text-ink-400 hover:text-ink-200 hover:bg-ink-850/50'
            }`}
            onClick={() => onPick(name)}
          >
            <FileTypeIcon name={short} size={12} />
            <span className="truncate max-w-[180px]">{short}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(name); }}
              className="ml-1 w-4 h-4 rounded flex items-center justify-center text-ink-500 hover:text-white hover:bg-ink-700 transition"
            >
              ×
            </button>
            {isActive && <span className="absolute bottom-0 left-0 right-0 h-px bg-forge-400" />}
          </div>
        );
      })}
    </div>
  );
}

export function FileBreadcrumb({ name }) {
  if (!name) return null;
  const parts = name.split('/');
  return (
    <div className="px-3 py-1.5 border-b border-ink-800/80 text-[11px] font-mono text-ink-500 flex items-center gap-1 flex-none">
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-ink-600">/</span>}
          <span className={i === parts.length - 1 ? 'text-ink-200' : ''}>{p}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

