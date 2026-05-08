// AppForge — main app: orchestrates state, conversations, streaming, layout
import React from 'react';
import { ChatPanel, MODELS } from './chat.jsx';
import { buildBlob, extractDocs, FRIENDLY_FORMAT, formatBytes, materializeDocs } from './docs.jsx';
import { attachmentsToBlocks } from './attachments.jsx';
import { IconChevronLeft, IconHistory, IconMoon, IconSettings, IconSun } from './icons.jsx';
import { applyOps, applyOpsLive, extractOps } from './files.jsx';
import { diffPackages, patchPackageJson, runInstall } from './installer.jsx';
import { PreviewPanel } from './preview.jsx';
import { detectPackages, isRefactorRequest, projectContextBlock } from './project.jsx';
import { getStreamer, PROVIDER_FOR_MODEL, streamWithFailover } from './providers.jsx';
import { SettingsModal } from './settings.jsx';
import { HistorySidebar } from './sidebar.jsx';

// Track viewport breakpoint as state so the JSX layout (drawer vs in-flow
// sidebar, single-panel mobile mode) reacts to resize / orientation changes.
function useViewport() {
  const get = () => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    return { isMobile: w < 768, isTablet: w >= 768 && w < 1024, width: w };
  };
  const [vp, setVp] = React.useState(get);
  React.useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVp(get()));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return vp;
}

const STORAGE_KEY = 'appforge.v2';

const SYSTEM_PROMPT = `You are AppForge — an expert full-stack engineer behaving as an iterative coding agent (Lovable / Cursor-style).

You evolve a SINGLE project across many turns. Every turn you receive the COMPLETE current project state (file tree + every file's source). Your job is to MODIFY that codebase to satisfy the user's next request.

# CORE RULES
1. PRESERVE THE PROJECT. Never regenerate from scratch. Never replace unrelated code. Only change what the user asked for.
2. REUSE EXISTING FILES. If a file already does the job, edit it. Don't create a duplicate (e.g. don't add Calculator2.jsx next to Calculator.jsx).
3. RESPECT ARCHITECTURE. Keep the existing folder layout (src/components/, src/hooks/, src/lib/, src/pages/, etc). When extracting, place files in the conventional location.
4. PRESERVE UI/UX & BEHAVIOR. When refactoring or restructuring, keep the visuals, layout, copy, state model, and user-facing behavior identical unless the user explicitly asked to change them.
5. INCREMENTAL OUTPUT. Emit ONLY the files you are creating or updating this turn. Do NOT re-emit unchanged files. The runtime preserves files you don't mention.
6. WHEN REPLACING A FILE, OUTPUT IT IN FULL. The file content you emit is the new file's complete content (no diffs, no "...rest unchanged" placeholders).

# WHEN THE PROJECT IS EMPTY (first turn)
Create a clean, well-structured starter. Always include:
- \`src/App.jsx\` — the live-preview entry component (React 18 + Tailwind), exports a top-level \`App\`.
- Supporting files in \`src/components/\`, \`src/hooks/\`, \`src/lib/\` as the feature warrants.
- \`package.json\` listing every npm package you import.
- A short \`README.md\`.

# WHEN THE PROJECT EXISTS (refactor / extend)
- Read the file tree and existing source carefully before writing anything.
- "split into components" / "modular structure" → extract pieces from App.jsx into \`src/components/\` files, update App.jsx to import them.
- "use hooks" / "move logic into hooks" → create \`src/hooks/useXxx.js\`, move stateful logic, update consumers.
- "add dark mode" / "use zustand" / "use context" → add the minimal new files + edit only the touch-points.
- "convert to TypeScript" → use the rename op to change .jsx→.tsx and .js→.ts, then re-emit with proper types and update package.json.
- New features → add new files in the right folder, modify only what needs to change.

# OUTPUT FORMAT (strict)
Start with a 1–4 sentence prose explanation of WHAT you changed and WHY (no headings, plain text). Then emit operations:

1) Create or update files — fenced code block tagged with language and filename:
\`\`\`jsx filename="src/components/Button.jsx"
// the full final content of the file
\`\`\`

2) Delete a file — its own line:
[forge:delete src/old/path.jsx]

3) Rename / move a file — its own line:
[forge:rename src/old/path.jsx -> src/new/path.jsx]
(use this for .jsx→.tsx conversions, folder reorganizations, etc.)

You may emit any number of file blocks, deletes, and renames in any order. The order of execution is: renames → deletes → file writes.

# PROJECT TYPE + DEFAULT STACK SELECTION
Do NOT force React for every request.

- If the user explicitly requests a framework/language (React, Next.js, Vue, Angular, Flask, Django, Express, Laravel, etc.), follow that stack.
- If the user does NOT specify a framework/language, default to a simple static web project: **HTML + CSS + Vanilla JavaScript**.

# PREVIEW ENTRY RULES
The preview chooses the entry automatically:

## Static web projects (default)
- Create \`index.html\` as the entry.
- Use \`styles.css\` and \`script.js\` (or \`main.js\`) as needed.
- Keep it lightweight, runnable, and dependency-free unless the user asked otherwise.

## React projects (only when explicitly requested)
- Use \`src/App.jsx\` (or \`src/App.tsx\`) as the entry component.
- Multi-file imports work: \`src/App.jsx\` can \`import Header from './components/Header'\` and that import is resolved in preview.
- npm packages load via esm.sh importmaps (and must be listed in \`package.json\`).

# AVOID UNNECESSARY REWRITES
When fixing errors or iterating, patch only the smallest set of files required. Do NOT repeatedly rewrite the entry file (especially \`src/App.jsx\`) unless it is the actual root cause.

# DEPENDENCIES
Whenever you import an npm package anywhere in the project, add it to \`package.json\` under \`dependencies\`. The simulated installer detects new imports and "installs" them automatically (preview loads them from esm.sh).

# RESPONSIVE REQUIREMENTS
Every generated app must be responsive by default across sm/md/lg/xl/2xl. Use mobile-first Tailwind classes, prevent horizontal overflow, keep buttons touch-friendly, ensure preview/editor content can scroll safely, and avoid fixed widths that break phones.

# SELF-HEALING / REPAIR TURNS
If the user prompt says this is an auto-fix or includes a runtime/build error, act like a debugger: identify the affected files from the current project state, patch only the minimal files, fix missing imports/packages/syntax/runtime issues, preserve the existing UI, and do not introduce unrelated features.

# DOCUMENT GENERATION (PDF / DOCX / PPTX / XLSX / CSV / MD / TXT / JSON)
When the user asks for a downloadable document — a PDF report, DOCX proposal, PPTX pitch deck, XLSX sheet, CSV, Markdown notes, resume, invoice, contract, SOP, research paper, etc. — DO NOT write a React component for it. Instead, emit a structured \`forge-doc\` block. The runtime renders it as a downloadable file card and produces a real, professionally-formatted document via client-side libraries (jsPDF, docx, pptxgenjs, SheetJS).

A forge-doc block looks like:

\`\`\`forge-doc filename="q3-report.pdf" format="pdf"
{ "title": "...", "blocks": [...] }
\`\`\`

\`format\` MUST be one of: pdf, docx, pptx, xlsx, csv, md, txt, json.

## Universal spec (PDF / DOCX / Markdown / TXT)
\`\`\`json
{
  "title": "string",
  "author": "optional string",
  "theme": { "primary": "#7c3aed", "accent": "#f472b6" },
  "blocks": [
    { "type": "cover",      "title": "...", "subtitle": "..." },
    { "type": "heading",    "level": 1, "text": "..." },
    { "type": "paragraph",  "text": "..." },
    { "type": "list",       "ordered": false, "items": ["item1", "item2"] },
    { "type": "table",      "headers": ["Col A", "Col B"], "rows": [["a1","b1"], ["a2","b2"]] },
    { "type": "kpi",        "items": [{ "label": "Revenue", "value": "$1.2M", "delta": "+12%" }] },
    { "type": "divider" },
    { "type": "page-break" }
  ]
}
\`\`\`

## PPTX spec (use \`slides\` array)
\`\`\`json
{
  "title": "Pitch Deck",
  "theme": { "primary": "#7c3aed", "background": "#0f0f17", "text": "#ffffff", "accent": "#f472b6" },
  "slides": [
    { "layout": "title",   "title": "Forge AI",     "subtitle": "Build apps faster" },
    { "layout": "section", "title": "The Problem",  "body": "..." },
    { "layout": "bullets", "title": "Solution",     "items": ["Point 1", "Point 2", "Point 3"] },
    { "layout": "kpi",     "title": "Traction",     "items": [{ "label": "MAU", "value": "12k", "delta": "+38%" }] },
    { "layout": "table",   "title": "Roadmap",      "headers": ["Quarter","Milestone"], "rows": [["Q1","Launch"]] }
  ]
}
\`\`\`
Layouts: \`title\`, \`section\`, \`bullets\`, \`kpi\`, \`table\`.

## XLSX / CSV spec
\`\`\`json
{
  "sheets": [
    { "name": "Revenue", "headers": ["Month","Total"], "rows": [["Jan", 12000], ["Feb", 15400]] }
  ]
}
\`\`\`
CSV uses the first sheet only.

## Rules
- Output ONE forge-doc block per requested document. Multiple files = multiple blocks.
- Filename must include the matching extension (.pdf, .docx, .pptx, .xlsx, .csv, .md, .txt, .json).
- The JSON inside must be strict / valid (no trailing commas, no comments).
- Generate complete, realistic, professional content tailored to the prompt — never lorem-ipsum, never "TODO".
- Choose the best format for the request: PPTX for decks/presentations, XLSX for tabular financials, PDF for printed reports/invoices/resumes, DOCX for editable Word docs.
- For PDF/DOCX: include a \`cover\` block, then \`heading\` + \`paragraph\` + \`list\` + \`table\` + \`kpi\` blocks for sections.
- For pitch decks: 8–14 slides, mix of layouts (title → problem → solution → market → product → traction → business model → roadmap → team → ask).
- For invoices: include kpi for total, table for line items, paragraph for terms.
- Documents and React app code can coexist in the same response (e.g. "build a calculator and also export a feature spec PDF").

# USER ATTACHMENTS
The user can attach arbitrary files to a turn. They arrive in this turn's content blocks:
- **Images** are sent as image blocks — read them visually (UI mocks, screenshots, designs, photos).
- **Text-decodable files** (code, JSON, CSV, MD, TXT, YAML, …) arrive inline as fenced text preceded by \`[Attached file: <name>]\`. Treat the contents as authoritative source — quote, reference, or refactor it as the user asks.
- **PDF / XLSX / CSV** content is **already extracted** for you (PDFs as plain text, spreadsheets as Markdown tables). Use the data directly.
- **Other binary files** (DOCX, PPTX, ZIP, audio, video, fonts, …) appear as a metadata-only line. You cannot read their bytes — if their content matters, ask the user to paste relevant parts or convert to a readable format.
Always ground your answer in the attached content when it's relevant; never fabricate details about the file.

# QUALITY BAR
Modern, polished, production-grade Tailwind UI. Accessible. Fully responsive. Realistic content (no lorem-ipsum) unless the user asks. Prefer composable components over megafiles. Documents must be professionally written, accurate, and visually polished.`;

const DEFAULT_SETTINGS = {
  anthropicKey: '',
  openaiKey: '',
  geminiKey: '',
  temperature: 0.7,
  maxTokens: 64000,
};

// Default per-conversation IDE state (open editor tabs, active file, expanded folders).
// Kept inside each conversation so chats are fully isolated — switching between chats
// restores that chat's own workspace, and a brand-new chat starts with a clean slate.
function emptyIde() {
  return { openTabs: [], activeFile: null, expanded: {} };
}

function migrateConversation(c) {
  if (!c) return c;
  const messages = Array.isArray(c.messages) ? c.messages : [];
  // If a chat has no messages, force a clean workspace — drop any stale starter files
  // or generated content that may have been persisted in older versions of the app.
  const files = messages.length === 0 ? [] : (Array.isArray(c.files) ? c.files : []);
  return {
    ...c,
    messages,
    files,
    tokens: c.tokens || { in: 0, out: 0 },
    console: messages.length === 0 ? [] : (Array.isArray(c.console) ? c.console : []),
    ide: messages.length === 0 ? emptyIde() : (c.ide || emptyIde()),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && Array.isArray(s.conversations)) {
      s.conversations = s.conversations.map(migrateConversation);
    }
    // Wipe the legacy global IDE state — replaced by per-conversation `ide` field.
    try { localStorage.removeItem('appforge.ide.v1'); } catch {}
    return s;
  } catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function newConversation() {
  return {
    id: 'c_' + Math.random().toString(36).slice(2, 9),
    title: 'New chat',
    messages: [],
    files: [],
    model: MODELS[0].id,
    updated: Date.now(),
    tokens: { in: 0, out: 0 },
    console: [],
    ide: emptyIde(),
  };
}

// ---- Main App --------------------------------------------------------------

export default function App() {
  // Framework/language intent detection (strict prompt override).
  const detectStackIntent = (prompt) => {
    const t = String(prompt || '').toLowerCase();
    const has = (re) => re.test(t);
    const forbidReact = has(/\bwithout\s+react\b|\bno\s+react\b|\bnot\s+react\b|\bvanilla\s+js\b|\bplain\s+html\b|\bonly\s+html\b/);
    if (has(/\bnext\.?js\b|\bnextjs\b/)) return { id: 'next', label: 'Next.js' };
    if (has(/\bvue\.?js\b|\bvuejs\b|\bvue\b/)) return { id: 'vue', label: 'Vue' };
    if (has(/\bangular\b/)) return { id: 'angular', label: 'Angular' };
    if (has(/\bflask\b/)) return { id: 'flask', label: 'Flask (Python)' };
    if (has(/\bdjango\b/)) return { id: 'django', label: 'Django (Python)' };
    if (has(/\blaravel\b/)) return { id: 'laravel', label: 'Laravel (PHP)' };
    if (has(/\bexpress\b/)) return { id: 'express', label: 'Express (Node.js)' };
    if (has(/\bnode(\.js)?\b|\bbackend api\b|\brest api\b/)) return { id: 'node', label: 'Node.js' };
    if (has(/\bpython\b/)) return { id: 'python', label: 'Python' };
    if (!forbidReact && has(/\breact\b/)) return { id: 'react', label: 'React' };
    if (has(/\bhtml\b|\bcss\b|\bjavascript\b|\bjs\b/) || forbidReact) return { id: 'static', label: 'HTML/CSS/Vanilla JS' };
    return { id: 'static', label: 'HTML/CSS/Vanilla JS' };
  };

  const stackRulesBlock = (intent) => {
    const id = intent?.id || 'static';
    if (id === 'static') {
      return [
        '# STACK OVERRIDE (STRICT)',
        'The user requested plain HTML/CSS/Vanilla JS (no React). You MUST follow this.',
        '',
        'Allowed files to create/update (preferred):',
        '- index.html',
        '- styles.css (or style.css)',
        '- script.js (or main.js)',
        '',
        'Hard prohibitions:',
        '- DO NOT create or update src/App.jsx, src/main.jsx, or any .jsx/.tsx files.',
        '- DO NOT use React/JSX/Vite/Next/Vue.',
        '',
        'If the project already contains React files, ignore them and produce a static site in the files above.',
      ].join('\n');
    }
    // Framework-specific: enforce requested stack and avoid switching.
    return [
      '# STACK OVERRIDE (STRICT)',
      `The user requested ${intent.label}. You MUST follow this stack and ONLY generate files appropriate for it.`,
      '',
      'Hard prohibitions:',
      '- Do NOT switch to a different framework.',
      '- Do NOT generate unrelated boilerplate.',
      '',
      'If the existing project uses a different stack, migrate only if the user explicitly asked to.',
    ].join('\n');
  };
  const [theme, setTheme] = React.useState('dark');
  const [settings, setSettings] = React.useState(() => loadState()?.settings || DEFAULT_SETTINGS);
  const [conversations, setConversations] = React.useState(() => loadState()?.conversations || [newConversation()]);
  const [currentId, setCurrentId] = React.useState(() => loadState()?.currentId || null);
  const viewport = useViewport();
  const { isMobile } = viewport;
  // On mobile we collapse to one panel at a time. Default closed sidebar drawer.
  const [sidebarOpen, setSidebarOpen] = React.useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [mobileView, setMobileView] = React.useState('chat'); // 'chat' | 'workspace'
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [chatWidth, setChatWidth] = React.useState(() => loadState()?.chatWidth || 460);
  const abortRef = React.useRef(null);
  const stableFilesRef = React.useRef({});
  const healRef = React.useRef({});
  const pkgRef = React.useRef({});
  const healTimerRef = React.useRef({});
  const validateTimerRef = React.useRef({});

  // When transitioning into mobile, close the sidebar drawer (it would otherwise
  // be stuck open from a desktop layout). When leaving mobile, restore it open.
  const wasMobileRef = React.useRef(isMobile);
  React.useEffect(() => {
    if (wasMobileRef.current !== isMobile) {
      setSidebarOpen(!isMobile);
      wasMobileRef.current = isMobile;
    }
  }, [isMobile]);

  // While the mobile drawer is open, lock background scroll so the body
  // doesn't bounce around on iOS when interacting with the drawer.
  React.useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = sidebarOpen ? 'hidden' : prev;
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, sidebarOpen]);

  const current = React.useMemo(
    () => conversations.find(c => c.id === currentId) || conversations[0],
    [conversations, currentId]
  );

  React.useEffect(() => {
    if (!currentId && conversations[0]) setCurrentId(conversations[0].id);
  }, [currentId, conversations]);

  React.useEffect(() => {
    saveState({ settings, conversations, currentId, chatWidth });
  }, [settings, conversations, currentId, chatWidth]);

  React.useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.body.classList.toggle('light', theme === 'light');
  }, [theme]);

  const updateConvo = (id, patch) => {
    setConversations(cs => cs.map(c => c.id === id ? (typeof patch === 'function' ? { ...c, ...patch(c), updated: Date.now() } : { ...c, ...patch, updated: Date.now() }) : c));
  };

  // Append a structured entry to the per-conversation console. Supports rich entry
  // shapes ({ level, msg, ... }) so the installer can emit terminal-style logs.
  const logEntry = (id, entry) => {
    setConversations(cs => cs.map(c => c.id === id ? {
      ...c, console: [...(c.console || []), { t: Date.now(), ...entry }].slice(-400),
    } : c));
  };
  const log = (id, level, msg) => logEntry(id, { level, msg });
  const lastEditRef = React.useRef({});

  const normalizeErr = (err) => ({
    message: String(err?.message || err?.msg || 'Error'),
    stack: String(err?.stack || ''),
    source: err?.source || 'app',
    data: err?.data || null,
  });

  const fileByName = (list, name) => (list || []).find(f => f?.name === name) || null;
  const upsertFile = (list, file) => {
    const next = [...(list || [])];
    const i = next.findIndex(f => f?.name === file?.name);
    if (i >= 0) next[i] = { ...next[i], ...file };
    else next.push(file);
    return next;
  };
  const changedFiles = (before, after) => {
    const b = new Map((before || []).map(f => [f.name, f.code]));
    const a = new Map((after || []).map(f => [f.name, f.code]));
    const names = new Set([...b.keys(), ...a.keys()]);
    const out = [];
    for (const n of names) if (b.get(n) !== a.get(n)) out.push(n);
    return out;
  };
  const guessRelevantFiles = ({ message = '', stack = '' }, files) => {
    const text = `${message}\n${stack}`;
    const hits = new Set();
    const re = /(?:^|[\s(])((?:\/)?src\/[A-Za-z0-9_./-]+\.(?:jsx|tsx|js|ts|mjs|cjs))/g;
    let m;
    while ((m = re.exec(text))) hits.add(m[1].replace(/^\//, ''));
    const list = [...hits].filter(n => fileByName(files, n));
    return list;
  };
  const protectEntryFromAutoHeal = ({ baseFiles, nextFiles, stableFiles, err }) => {
    const entryNames = ['src/App.jsx', 'src/App.tsx', 'App.jsx', 'App.tsx'];
    const hasEntryChange = entryNames.some(n => fileByName(baseFiles, n)?.code !== fileByName(nextFiles, n)?.code);
    if (!hasEntryChange) return nextFiles;
    const msg = String(err?.message || '');
    const stk = String(err?.stack || '');
    const mentionsEntry = entryNames.some(n => msg.includes(n) || stk.includes(n));
    if (mentionsEntry) return nextFiles;
    const stable = stableFiles || baseFiles;
    let out = nextFiles;
    for (const n of entryNames) {
      const stableEntry = fileByName(stable, n);
      const baseEntry = fileByName(baseFiles, n);
      if (!stableEntry && !baseEntry) continue;
      out = upsertFile(out, stableEntry || baseEntry);
    }
    return out;
  };

  const filesSignature = (files) => {
    // Cheap stable signature: names + lengths + a few char codes.
    let h = 5381;
    for (const f of (files || [])) {
      if (!f?.name) continue;
      const name = String(f.name);
      for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) | 0;
      const code = String(f.code || '');
      h = ((h << 5) + h + code.length) | 0;
      // sample first/last chars for better discrimination
      if (code.length) {
        h = ((h << 5) + h + code.charCodeAt(0)) | 0;
        h = ((h << 5) + h + code.charCodeAt(code.length - 1)) | 0;
      }
    }
    return String(h);
  };

  const setHealState = (id, patch) => {
    setConversations(cs => cs.map(c => {
      if (c.id !== id) return c;
      const prev = c.healing || null;
      const next = typeof patch === 'function' ? patch(prev) : patch;
      return { ...c, healing: next };
    }));
  };

  const setHealing = (id, active, patch = {}) => {
    if (!active) return setHealState(id, null);
    setHealState(id, (prev) => ({
      active: true,
      since: prev?.since || Date.now(),
      attempt: patch.attempt ?? prev?.attempt ?? 1,
      step: patch.step || prev?.step || 'detect',
      reason: patch.reason ?? prev?.reason ?? '',
      detail: patch.detail ?? prev?.detail ?? '',
    }));
  };

  const clearValidationTimer = (cid) => {
    const t = validateTimerRef.current[cid];
    if (t) window.clearTimeout(t);
    validateTimerRef.current[cid] = null;
  };

  const startValidation = (cid, reason) => {
    clearValidationTimer(cid);
    setHealing(cid, true, { step: 'validate', reason: reason || 'validating preview', detail: 'Reloading preview and waiting for mount…' });
    log(cid, 'info', 'auto-heal: validating preview render…');
    try { window.dispatchEvent(new CustomEvent('forge:preview-reload')); } catch {}
    validateTimerRef.current[cid] = window.setTimeout(() => {
      validateTimerRef.current[cid] = null;
      scheduleHeal({ source: 'validate', message: 'Preview did not become ready (timeout)', stack: '' });
    }, 4500);
  };

  const scheduleHeal = React.useCallback((rawErr) => {
    if (!rawErr || !current?.id) return;
    if (isStreaming) return;
    if (!current.files?.length) return;
    if (abortRef.current) return; // already generating

    const cid = current.id;
    const err = normalizeErr(rawErr);
    const message = err.message;
    const stack = err.stack;
    const key = `${err.source}\n${message}\n${stack}`.slice(0, 700);

    const state = healRef.current[cid] || { attempts: 0, key: '' };
    const attempts = state.key === key ? state.attempts + 1 : 1;
    const sig = filesSignature(current.files || []);
    const sameSnapshot = state.key === key && state.lastFilesSig === sig;

    // If the exact same error repeats without any code changes, don't spam the model.
    // Prefer preview-only recovery (rollback/reload) and then VALIDATE.
    if (sameSnapshot && attempts >= 2) {
      const stable = stableFilesRef.current[cid];
      if (stable?.length) {
        setHealing(cid, true, { attempt: attempts, step: 'rollback', reason: `${err.source}: ${message}`, detail: 'Reverting to last stable snapshot…' });
        log(cid, 'warn', `auto-heal: repeated identical error with no code changes — rolling back to last stable snapshot`);
        setConversations(cs => cs.map(c => c.id === cid ? { ...c, files: stable.map(f => ({ ...f })) } : c));
      } else {
        setHealing(cid, true, { attempt: attempts, step: 'reload', reason: `${err.source}: ${message}`, detail: 'Forcing preview reload…' });
        log(cid, 'warn', `auto-heal: repeated identical error with no code changes — forcing preview reload`);
      }
      startValidation(cid, 'post-recovery validation');
      return;
    }
    healRef.current[cid] = {
      attempts,
      key,
      lastFilesSig: sig,
      lastError: { source: err.source, message, stack },
      lastEdit: lastEditRef.current[cid] || null,
    };

    // Guardrails: max retries per identical error signature.
    if (attempts > 3) {
      logEntry(cid, { level: 'error', msg: `auto-heal stopped (too many retries): ${message}` });
      clearValidationTimer(cid);
      setHealing(cid, false);
      const stable = stableFilesRef.current[cid];
      if (stable?.length) {
        setConversations(cs => cs.map(c => c.id === cid ? { ...c, files: stable.map(f => ({ ...f })) } : c));
        log(cid, 'warn', 'rolled back to last stable preview after repeated failures');
      }
      return;
    }

    // Debounce/batch multiple fast errors into one heal attempt.
    if (healTimerRef.current[cid]) window.clearTimeout(healTimerRef.current[cid]);
    const delay = 450 + (attempts - 1) * 650;
    setHealing(cid, true, { attempt: attempts, step: 'analyze', reason: `${err.source}: ${message}`, detail: 'Analyzing error and preparing targeted fix…' });
    logEntry(cid, { level: attempts > 1 ? 'warn' : 'error', msg: `auto-heal detected (${err.source}): ${message}` });
    try { window.dispatchEvent(new CustomEvent('forge:preview-reload')); } catch {}

    const filesNow = current.files || [];
    const guessed = guessRelevantFiles({ message, stack }, filesNow);
    const focus = [...new Set([...(guessed || []), ...(lastEditRef.current[cid] ? [lastEditRef.current[cid]] : [])])].filter(Boolean);

    // about:srcdoc stacks often lack real module file paths; rollback-first avoids useless rewrites.
    const isSrcDoc = (stack || '').includes('about:srcdoc') || (message || '').includes('about:srcdoc');
    if (isSrcDoc && focus.length === 0 && attempts >= 2) {
      const stable = stableFilesRef.current[cid];
      if (stable?.length) {
        setHealing(cid, true, { attempt: attempts, step: 'rollback', reason: `${err.source}: ${message}`, detail: 'No file paths in srcdoc stack — reverting to stable snapshot…' });
        setConversations(cs => cs.map(c => c.id === cid ? { ...c, files: stable.map(f => ({ ...f })) } : c));
        log(cid, 'warn', `auto-heal: srcdoc error without file paths — rolled back to last stable snapshot`);
        startValidation(cid, 'post-rollback validation');
      }
      return;
    }

    const repairPrompt = [
      'Auto-fix the current project. The app/preview has errors and must self-heal until it runs successfully.',
      '',
      `Error source: ${err.source}`,
      '',
      'Error message:',
      message,
      '',
      'Stack trace / details:',
      stack || '(no stack trace)',
      '',
      focus.length
        ? 'Likely related files (prioritize these; change as little as possible):\n- ' + focus.join('\n- ')
        : 'No concrete file path in stack trace (about:srcdoc). Make the smallest possible fix.',
      '',
      'Requirements:',
      '- Modify only the files needed to fix the runtime/build/import/dependency problem.',
      '- Preserve the current UI and behavior.',
      '- Do NOT rewrite the entire app. Avoid touching src/App.jsx unless the error clearly comes from it.',
      '- Fix broken imports/exports, missing packages, invalid JSX, runtime crashes, and module resolution issues.',
      '- If a fix makes things worse, revert to the last stable working version and try a different minimal fix.',
      '- Do NOT introduce unrelated features.',
    ].join('\n');

    healTimerRef.current[cid] = window.setTimeout(() => {
      healTimerRef.current[cid] = null;
      // Re-check current convo still active and not streaming.
      if (!abortRef.current) {
        setHealing(cid, true, { attempt: attempts, step: 'patch', reason: `${err.source}: ${message}`, detail: 'Applying patch…' });
        send(repairPrompt, [], { internal: true });
      }
    }, delay);
  }, [current?.id, current?.files, isStreaming]);

  // Per-conversation IDE state updater. Each chat owns its own openTabs / activeFile /
  // expanded folders so switching chats restores that chat's exact editor state, and
  // a fresh chat never inherits stale tabs or selections from a previous one.
  const setIde = (id, patch) => {
    setConversations(cs => cs.map(c => {
      if (c.id !== id) return c;
      const prev = c.ide || emptyIde();
      const next = typeof patch === 'function' ? patch(prev) : patch;
      return { ...c, ide: { ...prev, ...next } };
    }));
  };

  const newChat = () => {
    const c = newConversation();
    setConversations(cs => [c, ...cs]);
    setCurrentId(c.id);
  };

  const deleteConvo = (id) => {
    setConversations(cs => {
      const next = cs.filter(c => c.id !== id);
      if (next.length === 0) {
        const c = newConversation();
        setCurrentId(c.id);
        return [c];
      }
      if (id === currentId) setCurrentId(next[0].id);
      return next;
    });
  };

  const stop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  };

  const send = async (text, attachments = [], opts = {}) => {
    if (!current || isStreaming) return;
    const cid = current.id;
    const isInternal = !!opts.internal;
    // Persist enough of each attachment to (a) re-render the original card in
    // chat history, and (b) re-build the API content blocks on resend. We strip
    // the raw `file` reference but keep dataUrl (images), extracted text
    // content, and lightweight metadata.
    const persistedAtts = (attachments || []).map(a => ({
      name: a.name,
      size: a.size,
      mime: a.mime,
      kind: a.kind,
      category: a.category,
      label: a.label,
      palette: a.palette,
      extractedKind: a.extractedKind,
      dataUrl: a.dataUrl,
      content: a.content,
      extractError: a.extractError,
    }));
    const userMsg = {
      id: 'm_' + Math.random().toString(36).slice(2,9),
      role: 'user',
      content: text,
      attachments: persistedAtts,
      internal: !!opts.internal,
    };
    const baseMessages = [...current.messages, userMsg];
    const newTitle = current.messages.length === 0
      ? (text.slice(0, 40) + (text.length > 40 ? '…' : '')) || 'Image chat'
      : current.title;
    updateConvo(cid, { messages: baseMessages, title: newTitle });

    const { fn: streamer, key } = getStreamer(current.model, settings);
    log(cid, opts.internal ? 'warn' : 'gen', `${opts.internal ? '⚕ auto-heal' : '▶'} ${current.model} · ${PROVIDER_FOR_MODEL(current.model)}${key ? '' : ' (demo mode)'}`);
    if (persistedAtts.length) {
      const summary = persistedAtts
        .map(a => `${a.name} (${a.label || (a.mime || 'file')}, ${formatBytes(a.size || 0)}${a.extractedKind === 'text' ? ', text' : a.extractedKind === 'image' ? ', vision' : ', metadata'})`)
        .join(' · ');
      log(cid, 'info', `📎 ${persistedAtts.length} attachment${persistedAtts.length > 1 ? 's' : ''}: ${summary}`);
    }

    setIsStreaming(true);
    abortRef.current = new AbortController();
    const assistantMsg = {
      id: 'm_' + Math.random().toString(36).slice(2,9),
      role: 'assistant', content: '', model: current.model, tokens: null,
      internal: !!opts.internal,
    };
    updateConvo(cid, c => ({ messages: [...c.messages, assistantMsg] }));

    // Snapshot the project state at send-time. All ops parsed from the stream
    // are applied against this snapshot so each chunk produces a consistent
    // merged file tree (rather than compounding off the live state).
    const baseFiles = current.files || [];

    // Build the system prompt: agent rules + the FULL current project context.
    // This is what makes the model evolve the existing codebase instead of
    // regenerating disconnected new code each turn.
    let system = SYSTEM_PROMPT + '\n\n' + projectContextBlock(baseFiles);
    const intent = detectStackIntent(text);
    system += '\n\n' + stackRulesBlock(intent);
    if (isRefactorRequest(text) && baseFiles.length) {
      system += '\n\n# THIS TURN IS A REFACTOR\nThe user is restructuring an existing project. PRESERVE all visuals, copy, layout, and behavior. Only change file structure / code organization. Do NOT introduce new UI or unrelated features.';
    }

    try {
      const apiMessages = baseMessages.map(m => {
        if (m.attachments?.length) {
          const blocks = [
            ...attachmentsToBlocks(m.attachments),
            ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ];
          return { role: m.role, content: blocks };
        }
        return { role: m.role, content: m.content };
      });
      const stream = streamWithFailover({
        model: current.model, messages: apiMessages, system, settings,
        temperature: settings.temperature, maxTokens: settings.maxTokens,
        signal: abortRef.current.signal,
        onSwitch: ({ from, to, reason }) => log(cid, 'warn', `↻ ${from.provider} failed (${reason}) — switching to ${to.provider}`),
      });

      let acc = '';
      let usage = null;
      for await (const part of stream) {
        if (part.delta) {
          acc += part.delta;
          // Live merge: apply only COMPLETE file fences + any deletes/renames seen
          // so far against the snapshot. Files the model isn't touching this turn
          // remain untouched in the workspace.
          const liveOps = extractOps(acc);
          const merged = applyOpsLive(baseFiles, liveOps);
          setConversations(cs => cs.map(c => {
            if (c.id !== cid) return c;
            const msgs = c.messages.map(m => m.id === assistantMsg.id ? { ...m, content: acc } : m);
            return { ...c, messages: msgs, files: merged };
          }));
        }
        if (part.usage) usage = part.usage;
      }

      // Final merge — include in-flight (still-streaming) files too in case the
      // closing fence was the last thing to land.
      const finalOps = extractOps(acc);
      let finalFiles = applyOps(baseFiles, finalOps);

      // Enforce intent: if user asked for static HTML but model only touched JSX/App.jsx,
      // auto-regenerate once with a stronger constraint (prevents "always App.jsx" bug).
      if (!isInternal && intent?.id === 'static') {
        const touched = changedFiles(baseFiles, finalFiles);
        const touchedJsx = touched.filter(n => /\.(jsx|tsx)$/.test(n));
        const touchedStatic = touched.filter(n => /^(index\.html|styles?\.css|script\.js|main\.js)$/i.test(n));
        if (touchedJsx.length && touchedStatic.length === 0) {
          log(cid, 'warn', 'stack enforcement: model tried to output React/JSX for an HTML request — regenerating as static site');
          // Roll back those changes and retry once as an internal constrained generation.
          finalFiles = baseFiles;
          const retryPrompt = [
            'Regenerate the project STRICTLY as a static website.',
            'You previously violated the stack by producing React/JSX.',
            '',
            'Output ONLY these files (and nothing else):',
            '- index.html',
            '- styles.css',
            '- script.js',
            '',
            'No React. No JSX. No src/ folder. No package.json changes unless explicitly required.',
          ].join('\n');
          // Fire-and-forget follow-up generation; chat hides internal messages.
          window.setTimeout(() => {
            if (!abortRef.current) send(retryPrompt, [], { internal: true });
          }, 250);
        }
      }

      if (isInternal) {
        const err = healRef.current[cid]?.lastError || null;
        const stable = stableFilesRef.current[cid] || null;
        finalFiles = protectEntryFromAutoHeal({ baseFiles, nextFiles: finalFiles, stableFiles: stable, err });
        const changed = changedFiles(baseFiles, finalFiles);
        if (changed.length > 8) {
          log(cid, 'error', `auto-heal produced too many changes (${changed.length}); rolling back to last stable snapshot`);
          if (stable?.length) finalFiles = stable.map(f => ({ ...f }));
        }
      }

      const created = finalOps.files.filter(f => !baseFiles.find(b => b.name === f.name));
      const updated = finalOps.files.filter(f => baseFiles.find(b => b.name === f.name));
      const summary = [];
      if (created.length) summary.push(`${created.length} created`);
      if (updated.length) summary.push(`${updated.length} updated`);
      if (finalOps.deletes.length) summary.push(`${finalOps.deletes.length} deleted`);
      if (finalOps.renames.length) summary.push(`${finalOps.renames.length} renamed`);
      log(cid, 'info', `✓ ${summary.length ? summary.join(' · ') : 'no file changes'}`);

      setConversations(cs => cs.map(c => {
        if (c.id !== cid) return c;
        const tokens = usage || { in: Math.round(text.length / 4), out: Math.round(acc.length / 4) };
        const msgs = c.messages.map(m => m.id === assistantMsg.id ? { ...m, content: acc, tokens } : m);
        return {
          ...c, messages: msgs,
          files: finalFiles,
          tokens: { in: c.tokens.in + tokens.in, out: c.tokens.out + tokens.out },
        };
      }));

      // If this was an internal auto-heal turn, validate by forcing a preview reload
      // and waiting for the iframe to report readiness.
      if (isInternal) {
        startValidation(cid, 'post-patch validation');
      }

      // Materialize any forge-doc blocks the model emitted into real Blob URLs.
      // We attach the realized docs to the assistant message itself so chat-side
      // DocumentCards render the right URLs and the workspace's Documents tab can
      // aggregate every doc the conversation has produced.
      const docs = extractDocs(acc);
      if (docs.length) {
        log(cid, 'gen', `📄 generating ${docs.length} document${docs.length === 1 ? '' : 's'}…`);
        try {
          const realized = await materializeDocs(docs);
          for (const d of realized) {
            if (d.error) {
              log(cid, 'error', `✗ ${d.filename}: ${d.error}`);
            } else {
              log(cid, 'info', `✓ ${d.filename} (${(FRIENDLY_FORMAT[d.format] || d.format)} · ${formatBytes(d.size)})`);
            }
          }
          setConversations(cs => cs.map(c => {
            if (c.id !== cid) return c;
            const msgs = c.messages.map(m => m.id === assistantMsg.id ? { ...m, docs: realized } : m);
            return { ...c, messages: msgs };
          }));
        } catch (docErr) {
          log(cid, 'error', `Document generation failed: ${docErr?.message || docErr}`);
        }
      }

      // Detect new npm imports introduced this turn and run the simulated
      // installer. The preview iframe loads packages from esm.sh, so this is
      // functionally equivalent to a real install for the live preview.
      const beforePkgs = detectPackages(baseFiles);
      const afterPkgs = detectPackages(finalFiles);
      const newPkgs = diffPackages(beforePkgs, afterPkgs);
      if (newPkgs.length) {
        const result = await runInstall({
          packages: newPkgs,
          log: (entry) => logEntry(cid, entry),
          signal: abortRef.current?.signal,
        });
        if (result?.installed?.length) {
          setConversations(cs => cs.map(c => {
            if (c.id !== cid) return c;
            return { ...c, files: patchPackageJson(c.files, result.installed) };
          }));
        }
      }
    } catch (err) {
      const msg = err?.name === 'AbortError' ? 'Stopped.' : (err?.message || 'Generation failed.');
      log(cid, 'error', msg);
      setConversations(cs => cs.map(c => {
        if (c.id !== cid) return c;
        const msgs = c.messages.map(m => m.id === assistantMsg.id ? { ...m, error: msg } : m);
        return { ...c, messages: msgs };
      }));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const retry = (failedMsg) => {
    if (!current) return;
    const idx = current.messages.findIndex(m => m.id === failedMsg.id);
    const prior = current.messages[idx - 1];
    if (!prior || prior.role !== 'user') return;
    setConversations(cs => cs.map(c => c.id !== current.id ? c : { ...c, messages: c.messages.slice(0, idx) }));
    setTimeout(() => send(prior.content), 50);
  };

  const handlePreviewReady = React.useCallback(() => {
    if (!current?.id || !current.files?.length || isStreaming) return;
    stableFilesRef.current[current.id] = current.files.map(f => ({ ...f }));
    healRef.current[current.id] = { attempts: 0, key: '', lastFilesSig: filesSignature(current.files || []) };
    clearValidationTimer(current.id);
    setHealing(current.id, false);
    log(current.id, 'info', '✓ preview rendered successfully');
  }, [current?.id, current?.files, isStreaming]);

  const handleRuntimeError = React.useCallback((err) => {
    if (current?.id && current?.healing?.step === 'validate') clearValidationTimer(current.id);
    scheduleHeal({ ...err, source: 'preview' });
  }, [current?.id, current?.files, isStreaming]);

  // Capture browser console + runtime errors (including Vite client/runtime issues)
  React.useEffect(() => {
    if (!current?.id) return;
    const cid = current.id;
    if (window.__FORGE_APP_LOG_PATCHED__) return;
    window.__FORGE_APP_LOG_PATCHED__ = true;

    const orig = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };
    const fmt = (args) => {
      try {
        return Array.prototype.slice.call(args).map(a => {
          if (typeof a === 'string') return a;
          if (a && a.message) return a.message;
          try { return JSON.stringify(a); } catch { return String(a); }
        }).join(' ');
      } catch { return ''; }
    };

    console.warn = function () { orig.warn.apply(console, arguments); log(cid, 'warn', fmt(arguments)); };
    console.error = function () { orig.error.apply(console, arguments); log(cid, 'error', fmt(arguments)); scheduleHeal({ source: 'console', message: fmt(arguments) }); };
    console.log = function () { orig.log.apply(console, arguments); };
    console.info = function () { orig.info.apply(console, arguments); };

    const onErr = (ev) => scheduleHeal({ source: 'window', message: ev?.message || 'Runtime error', stack: ev?.error?.stack || '' });
    const onRej = (ev) => scheduleHeal({ source: 'promise', message: ev?.reason?.message || String(ev?.reason || 'Unhandled rejection'), stack: ev?.reason?.stack || '' });
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);

    return () => {
      console.log = orig.log;
      console.info = orig.info;
      console.warn = orig.warn;
      console.error = orig.error;
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, [current?.id, scheduleHeal]);

  const setModel = (id) => updateConvo(current.id, { model: id });
  const setFile = (name, code) => {
    if (!current?.id) return;
    const cid = current.id;
    lastEditRef.current[cid] = name;
    setConversations(cs => cs.map(c => c.id !== cid ? c : {
      ...c, files: c.files.map(f => f.name === name ? { ...f, code } : f),
    }));

    // Auto-install newly imported packages on manual edits (not just model turns).
    // Debounced by signature via pkgRef.
    window.setTimeout(async () => {
      try {
        const convo = (conversations || []).find(c => c.id === cid);
        const files = convo?.files || current.files || [];
        const before = new Set(pkgRef.current[cid] || []);
        const after = detectPackages(files);
        pkgRef.current[cid] = after;
        const newly = after.filter(p => !before.has(p));
        if (!newly.length) return;
        log(cid, 'gen', `📦 detected new imports: ${newly.join(', ')}`);
        const result = await runInstall({
          packages: newly,
          log: (entry) => logEntry(cid, entry),
          signal: abortRef.current?.signal,
        });
        if (result?.installed?.length) {
          setConversations(cs2 => cs2.map(c => c.id !== cid ? c : ({ ...c, files: patchPackageJson(c.files, result.installed) })));
        }
      } catch (e) {
        log(cid, 'warn', `auto-install failed: ${e?.message || e}`);
      }
    }, 300);
  };

  // Aggregate every doc generated across this conversation. Each assistant
  // message owns its own docs[] (set after streaming); the Documents workspace
  // tab shows the union, newest first, which doubles as a natural version
  // history (regenerating a doc with the same name produces a second entry).
  const allDocs = React.useMemo(() => {
    const list = [];
    for (const m of (current?.messages || [])) {
      if (m.docs?.length) list.push(...m.docs);
    }
    return list.reverse();
  }, [current?.messages]);

  const switchToDocsTab = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('forge:tab', { detail: 'documents' }));
  }, []);

  const handlePreviewDoc = React.useCallback((doc) => {
    if (!doc?.id) return;
    window.dispatchEvent(new CustomEvent('forge:tab', { detail: 'documents' }));
    window.dispatchEvent(new CustomEvent('forge:preview-doc', { detail: doc.id }));
  }, []);

  const regenerateDoc = React.useCallback(async (doc) => {
    if (!current?.id || !doc) return;
    if (doc.spec) {
      try {
        const blob = await buildBlob(doc);
        const url = URL.createObjectURL(blob);
        setConversations(cs => cs.map(c => {
          if (c.id !== current.id) return c;
          const msgs = c.messages.map(m => {
            if (!Array.isArray(m.docs)) return m;
            const docs = m.docs.map(d => d.id === doc.id ? { ...d, blob, url, size: blob.size, generatedAt: Date.now(), error: null } : d);
            return { ...m, docs };
          });
          return { ...c, messages: msgs };
        }));
        log(current.id, 'info', `↻ rebuilt ${doc.filename}`);
        return;
      } catch (err) {
        log(current.id, 'error', `Could not rebuild ${doc.filename}: ${err?.message || err}`);
      }
    }
    // No spec available (or rebuild failed) — fall back to asking the model
    // to regenerate with improvements.
    const prompt = `Regenerate the document "${doc.filename}" (${doc.format.toUpperCase()}). Improve content quality, polish phrasing, and refine the design. Output a single forge-doc block with format="${doc.format}" and filename="${doc.filename}".`;
    send(prompt);
  }, [current?.id, send]);

  const totalTokens = React.useMemo(() => conversations.reduce((acc, c) => ({
    in: acc.in + (c.tokens?.in || 0), out: acc.out + (c.tokens?.out || 0),
  }), { in: 0, out: 0 }), [conversations]);

  const draggingRef = React.useRef(false);
  React.useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const min = window.innerWidth < 900 ? Math.min(window.innerWidth, 320) : 340;
      const max = Math.min(720, Math.max(min, window.innerWidth * 0.55));
      const w = Math.max(min, Math.min(max, e.clientX - (sidebarOpen ? 248 : 48)));
      setChatWidth(w);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [sidebarOpen]);

  const startDrag = () => {
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  if (!current) return null;
  const provider = PROVIDER_FOR_MODEL(current.model);
  const hasApiKey = (provider === 'anthropic' && settings.anthropicKey) ||
                    (provider === 'openai' && settings.openaiKey) ||
                    (provider === 'gemini' && settings.geminiKey);
  // Packages imported anywhere in the project — passed to the preview iframe
  // so its importmap can resolve them via esm.sh and the live preview actually
  // renders code that uses framer-motion / lucide-react / etc.
  const previewPackages = React.useMemo(() => detectPackages(current.files), [current.files]);
  // A workspace is "empty" when the chat hasn't produced anything yet — no messages and
  // no generated files. In that state we show a welcome screen instead of stale code.
  const isEmptyWorkspace = current.messages.length === 0 && (current.files?.length || 0) === 0;

  const switchToChat = () => setMobileView('chat');
  const switchToWorkspace = () => setMobileView('workspace');

  return (
    <div
      className="app-shell flex h-screen w-screen overflow-hidden bg-ink-950"
      data-mobile-view={mobileView}
    >
      {isMobile && (
        <div className="mobile-topbar">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1.5 rounded-lg text-ink-200 hover:text-white hover:bg-ink-800 transition flex-none"
            aria-label="Open history"
          >
            <IconHistory size={16} />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
            <div className="logo-mark w-6 h-6 flex-none" />
            <div className="text-[14px] font-semibold tracking-tight truncate">
              Vishal’s <span className="logo-gradient">Lovable</span>
            </div>
          </div>
          <div className="flex items-center bg-ink-800/80 border border-ink-700 rounded-lg p-0.5 flex-none">
            <button
              onClick={switchToChat}
              className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition ${mobileView === 'chat' ? 'bg-forge-600 text-white shadow' : 'text-ink-300'}`}
            >
              Chat
            </button>
            <button
              onClick={switchToWorkspace}
              className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition ${mobileView === 'workspace' ? 'bg-forge-600 text-white shadow' : 'text-ink-300'}`}
            >
              Build
            </button>
          </div>
        </div>
      )}

      {isMobile && sidebarOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <HistorySidebar
        open={sidebarOpen}
        conversations={conversations}
        currentId={current.id}
        onPick={(id) => {
          setCurrentId(id);
          if (isMobile) setSidebarOpen(false);
        }}
        onDelete={deleteConvo}
        onClose={() => setSidebarOpen(false)}
        onToggle={() => setSidebarOpen(o => !o)}
        totalTokens={totalTokens}
        isMobile={isMobile}
      />

      <ChatPanel
        width={chatWidth}
        messages={current.messages}
        isStreaming={isStreaming}
        model={current.model}
        onModelChange={setModel}
        onSend={(text, attachments) => {
          send(text, attachments);
          if (isMobile) setMobileView('workspace');
        }}
        onNewChat={newChat}
        onRetry={retry}
        onStop={stop}
        onPreview={() => {
          if (isMobile) setMobileView('workspace');
          window.dispatchEvent(new CustomEvent('forge:tab', { detail: 'preview' }));
        }}
        hasApiKey={hasApiKey}
        onPreviewDoc={(doc) => { if (isMobile) setMobileView('workspace'); handlePreviewDoc(doc); }}
        onRegenerateDoc={regenerateDoc}
        isMobile={isMobile}
        onOpenSidebar={() => setSidebarOpen(true)}
        onShowWorkspace={isMobile ? switchToWorkspace : undefined}
      />

      <div className={`resizer ${draggingRef.current ? 'dragging' : ''}`} onMouseDown={startDrag} />

      <div className="workspace-shell flex-1 flex flex-col h-full min-w-0 bg-ink-900">
        <div className="workspace-header flex items-center justify-between px-4 py-2.5 border-b border-ink-800/80 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isMobile && (
              <button
                onClick={switchToChat}
                className="workspace-back-btn p-1.5 -ml-1 rounded-md hover:bg-ink-800 text-ink-300 hover:text-white transition flex-none"
                aria-label="Back to chat"
                title="Back to chat"
              >
                <IconChevronLeft size={14} />
              </button>
            )}
            <div className="flex items-center gap-2 text-[11.5px] text-ink-400 min-w-0">
              <div className="flex items-center gap-1.5 flex-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
                <span className="font-mono uppercase tracking-[0.14em] text-ink-300">workspace</span>
              </div>
            {current.healing?.active && (
              <>
                <span className="text-ink-600 flex-none">·</span>
                <span className="inline-flex items-center gap-2 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-200 font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse-soft" />
                  Fixing error…
                </span>
              </>
            )}
              {isEmptyWorkspace ? (
                <>
                  <span className="text-ink-600 flex-none">·</span>
                  <span className="font-mono text-ink-500 truncate">new chat</span>
                </>
              ) : current.files.length > 0 && (
                <>
                  <span className="text-ink-600 hidden sm:inline flex-none">·</span>
                  <span className="font-mono truncate hidden sm:inline">{current.title}</span>
                  <span className="text-ink-600 flex-none">·</span>
                  <span className="font-mono text-ink-500 flex-none">{current.files.length} file{current.files.length === 1 ? '' : 's'}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-none">
            <button
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-md hover:bg-ink-800 text-ink-300 hover:text-white transition"
              title="Toggle theme"
            >
              {theme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded-md hover:bg-ink-800 text-ink-300 hover:text-white transition"
              title="Settings"
            >
              <IconSettings size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <PreviewPanel
            files={current.files}
            previewPackages={previewPackages}
            isLoading={isStreaming}
            onFileChange={setFile}
            console={current.console || []}
            ide={current.ide || emptyIde()}
            onIdeChange={(patch) => setIde(current.id, patch)}
            isEmpty={isEmptyWorkspace}
            onPickSuggestion={(p) => send(p)}
            onRuntimeError={handleRuntimeError}
            onPreviewReady={handlePreviewReady}
            onPreviewLog={(entry) => {
              if (!entry) return;
              const lvl = entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'info';
              logEntry(current.id, { level: lvl, msg: `[preview] ${entry.msg || ''}` });
              if (lvl === 'error') scheduleHeal({ source: 'preview-console', message: entry.msg || 'Preview console error' });
            }}
            docs={allDocs}
            onRegenerateDoc={regenerateDoc}
          />
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
      />
    </div>
  );
}

