// Project intelligence — analyze the current generated codebase to give the LLM
// real context about what already exists so it can refactor/extend instead of
// regenerating from scratch every turn. The output of `projectContextBlock` is
// injected into the system prompt before each generation.

const RELATIVE_RE = /^[./]/;
const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util', 'stream',
  'events', 'buffer', 'process', 'child_process', 'net', 'tls', 'zlib',
]);
// React + react-dom come from the runtime — they don't count as "user packages"
// the simulated installer needs to add to package.json.
const RUNTIME_PROVIDED = new Set(['react', 'react-dom']);

export function detectImports(code) {
  if (!code) return [];
  const out = new Set();
  const reFrom = /\bimport\s+(?:[\w*\s{},]+\s+from\s+)?["']([^"']+)["']/g;
  const reReq  = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = reFrom.exec(code))) out.add(m[1]);
  while ((m = reReq.exec(code))) out.add(m[1]);
  return [...out];
}

// Pull the package name from a specifier:
//   "framer-motion"            -> "framer-motion"
//   "framer-motion/dist/foo"   -> "framer-motion"
//   "@radix-ui/react-dialog"   -> "@radix-ui/react-dialog"
//   "@radix-ui/react-dialog/x" -> "@radix-ui/react-dialog"
export function packageNameFromSpec(spec) {
  if (!spec || RELATIVE_RE.test(spec)) return null;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

export function detectPackages(files, { includeRuntime = false } = {}) {
  const all = new Set();
  for (const f of files || []) {
    if (!/\.(jsx?|tsx?|mjs|cjs)$/.test(f.name)) continue;
    for (const spec of detectImports(f.code || '')) {
      const name = packageNameFromSpec(spec);
      if (!name) continue;
      if (NODE_BUILTINS.has(name)) continue;
      if (!includeRuntime && RUNTIME_PROVIDED.has(name)) continue;
      all.add(name);
    }
  }
  return [...all].sort();
}

export function parsePackageJson(files) {
  const pkg = (files || []).find(f => f.name === 'package.json');
  if (!pkg) return null;
  try { return JSON.parse(pkg.code); } catch { return null; }
}

// Return a minimal ASCII tree of the file paths.
export function buildTreeAscii(files) {
  if (!files || !files.length) return '(empty project)';
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const root = {};
  for (const f of sorted) {
    const parts = f.name.split('/');
    let cur = root;
    parts.forEach((p, i) => {
      const isFile = i === parts.length - 1;
      if (isFile) cur[p] = null;
      else { cur[p] = cur[p] || {}; cur = cur[p]; }
    });
  }
  const lines = [];
  const walk = (node, prefix) => {
    if (!node) return;
    const entries = Object.entries(node).sort(([a, av], [b, bv]) => {
      const ad = av && typeof av === 'object', bd = bv && typeof bv === 'object';
      if (ad !== bd) return ad ? -1 : 1;
      return a.localeCompare(b);
    });
    entries.forEach(([name, child], i) => {
      const last = i === entries.length - 1;
      lines.push(prefix + (last ? '└─ ' : '├─ ') + name + (child ? '/' : ''));
      if (child) walk(child, prefix + (last ? '   ' : '│  '));
    });
  };
  walk(root, '');
  return lines.join('\n');
}

// Identify React components (PascalCase exported function/const/class) per file.
export function listComponents(files) {
  const out = [];
  const seen = new Set();
  const re = /(?:^|\n)\s*(?:export\s+(?:default\s+)?)?(?:function|const|let|class)\s+([A-Z][A-Za-z0-9_]*)/g;
  for (const f of files || []) {
    if (!/\.(jsx|tsx)$/.test(f.name)) continue;
    let m;
    while ((m = re.exec(f.code || ''))) {
      const name = m[1];
      const key = `${f.name}::${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ file: f.name, name });
    }
    re.lastIndex = 0;
  }
  return out;
}

// Custom hooks — anything starting with `use[A-Z]`.
export function listHooks(files) {
  const out = [];
  const seen = new Set();
  const re = /(?:^|\n)\s*(?:export\s+)?(?:function|const|let)\s+(use[A-Z][A-Za-z0-9_]*)/g;
  for (const f of files || []) {
    if (!/\.(jsx?|tsx?)$/.test(f.name)) continue;
    let m;
    while ((m = re.exec(f.code || ''))) {
      const key = `${f.name}::${m[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ file: f.name, name: m[1] });
    }
    re.lastIndex = 0;
  }
  return out;
}

export function classifyFiles(files) {
  const buckets = { components: [], hooks: [], pages: [], lib: [], styles: [], config: [], assets: [], other: [] };
  for (const f of files || []) {
    const n = f.name.toLowerCase();
    if (/\.(css|scss|sass|less)$/.test(n)) buckets.styles.push(f.name);
    else if (/\/(components?)\//.test(n)) buckets.components.push(f.name);
    else if (/\/(hooks?)\//.test(n) || /\/use[A-Z]/.test(f.name)) buckets.hooks.push(f.name);
    else if (/\/(pages?|routes?|views?|screens?)\//.test(n)) buckets.pages.push(f.name);
    else if (/\/(lib|utils?|helpers?|services?)\//.test(n)) buckets.lib.push(f.name);
    else if (/(package\.json|tsconfig|vite\.config|tailwind\.config|postcss\.config|\.env|\.gitignore)/.test(n)) buckets.config.push(f.name);
    else if (/\/(assets|public|static)\//.test(n)) buckets.assets.push(f.name);
    else buckets.other.push(f.name);
  }
  return buckets;
}

export function analyzeProject(files) {
  const list = files || [];
  return {
    count: list.length,
    lines: list.reduce((n, f) => n + (f.code || '').split('\n').length, 0),
    tree: buildTreeAscii(list),
    components: listComponents(list),
    hooks: listHooks(list),
    packages: detectPackages(list),
    deps: (() => {
      const pkg = parsePackageJson(list);
      return pkg?.dependencies ? Object.keys(pkg.dependencies) : [];
    })(),
    buckets: classifyFiles(list),
  };
}

// Build the structured project context block that goes into the system prompt.
// We deliberately include FULL file source — this is the single most important
// signal that gets the model to refactor existing code instead of inventing new.
export function projectContextBlock(files) {
  const list = files || [];
  if (!list.length) {
    return '# CURRENT PROJECT STATE\n\n(empty — no files generated yet. This is the first turn; create a fresh well-structured project.)';
  }
  const a = analyzeProject(list);
  const out = [];
  out.push('# CURRENT PROJECT STATE');
  out.push(`Total: ${a.count} file${a.count === 1 ? '' : 's'}, ${a.lines} lines.`);
  out.push('');
  out.push('## File tree');
  out.push('```');
  out.push(a.tree);
  out.push('```');

  if (a.components.length) {
    out.push('');
    out.push('## Components already defined');
    out.push(a.components.map(c => `- \`${c.name}\` in \`${c.file}\``).join('\n'));
  }
  if (a.hooks.length) {
    out.push('');
    out.push('## Hooks already defined');
    out.push(a.hooks.map(h => `- \`${h.name}\` in \`${h.file}\``).join('\n'));
  }
  if (a.packages.length) {
    out.push('');
    out.push('## npm packages currently imported');
    out.push(a.packages.map(p => `- ${p}`).join('\n'));
  }
  if (a.deps.length) {
    out.push('');
    out.push('## Declared dependencies (package.json)');
    out.push(a.deps.map(d => `- ${d}`).join('\n'));
  }

  out.push('');
  out.push('## Existing files (full source — DO NOT regenerate from scratch; modify these in place)');
  for (const f of list) {
    out.push('');
    out.push(`### ${f.name}`);
    out.push('```' + (f.lang || ''));
    out.push((f.code || '').trimEnd());
    out.push('```');
  }
  return out.join('\n');
}

// Heuristic: classify the user's request so we can bias the prompt and the
// streaming UI. Refactor-style requests get extra "preserve UI/behavior" guidance.
const REFACTOR_TERMS = [
  'refactor', 'restructure', 'reorganize', 'reorganise', 'modular', 'modularize', 'modularise',
  'split', 'separate', 'extract', 'break down', 'break into', 'move into',
  'convert to typescript', 'use hooks', 'use context', 'use zustand', 'use redux',
  'rename', 'cleanup', 'clean up', 'fix structure', 'proper architecture',
  'proper structure', 'proper react', 'better structure',
];
export function isRefactorRequest(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return REFACTOR_TERMS.some(k => t.includes(k));
}
