// AppForge — main app: orchestrates state, conversations, streaming, layout
import React from 'react';
import { ChatPanel, MODELS } from './chat.jsx';
import { IconMoon, IconSettings, IconSun } from './icons.jsx';
import { extractFiles, pickPreviewFile } from './files.jsx';
import { PreviewPanel } from './preview.jsx';
import { getStreamer, PROVIDER_FOR_MODEL, streamWithFailover } from './providers.jsx';
import { SettingsModal } from './settings.jsx';
import { HistorySidebar } from './sidebar.jsx';

const STORAGE_KEY = 'appforge.v2';

const SYSTEM_PROMPT = `You are an expert full-stack software engineer and UI designer.

Your job is to generate complete production-ready applications based on the user's request.

You can generate:
- frontend apps (React, Next.js, Vue, vanilla HTML/CSS/JS)
- backend apps (Node.js, Python, APIs)
- full-stack projects
- websites, SaaS landing pages, dashboards
- mobile UI mocks
- games, automations, Chrome extensions
- any programming language, any framework

Always generate clean, modern, scalable, beautiful, production-ready code.

When appropriate:
- generate multiple files with proper folder structure
- generate reusable components
- generate responsive layouts and polished UI
- include modern animations, smooth UX
- add comments where they clarify intent

Adapt to the user's requested stack and language.

CRITICAL output format:
- Return code in markdown fenced code blocks.
- For each file, label the fence with the filename, like:
  \`\`\`jsx filename="src/App.jsx"
  // ...code...
  \`\`\`
- The PRIMARY entry component for live preview should be a single React component named 'App' written for plain React 18 + Tailwind (no imports needed — React hooks are globally available, Tailwind classes work out of the box).
- For the App.jsx file, do NOT include import statements; the runtime injects React/hooks. Use only Tailwind classes — no external libraries.
- For other files (config, helpers, server code) include realistic content as you'd ship it.

On follow-up messages, modify the existing files based on user feedback.`;

const DEFAULT_SETTINGS = {
  anthropicKey: '',
  openaiKey: '',
  geminiKey: '',
  temperature: 0.7,
  maxTokens: 64000,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// Realistic starter project tree, shown before the first generation so the
// explorer feels like a real workspace.
const STARTER_FILES = [
  { name: 'src/App.tsx', lang: 'tsx', complete: true, code: `// Welcome to AppForge\n// Describe an app in the chat panel and a real codebase will be generated here.\n\nexport default function App() {\n  return (\n    <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">\n      <h1 className="text-4xl font-semibold">Hello, AppForge</h1>\n    </main>\n  );\n}\n` },
  { name: 'src/main.tsx', lang: 'tsx', complete: true, code: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);\n` },
  { name: 'src/index.css', lang: 'css', complete: true, code: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n` },
  { name: 'src/components/Header.tsx', lang: 'tsx', complete: true, code: `export function Header() {\n  return <header className="px-6 py-4 border-b border-white/5">AppForge</header>;\n}\n` },
  { name: 'src/components/Sidebar.tsx', lang: 'tsx', complete: true, code: `export function Sidebar() {\n  return <aside className="w-64 border-r border-white/5" />;\n}\n` },
  { name: 'src/pages/Index.tsx', lang: 'tsx', complete: true, code: `export default function Index() {\n  return <div>Index</div>;\n}\n` },
  { name: 'src/hooks/useTheme.ts', lang: 'ts', complete: true, code: `import { useState, useEffect } from 'react';\nexport function useTheme() {\n  const [theme, setTheme] = useState<'dark' | 'light'>('dark');\n  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);\n  return { theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') };\n}\n` },
  { name: 'src/lib/utils.ts', lang: 'ts', complete: true, code: `export function cn(...parts: (string | false | null | undefined)[]) {\n  return parts.filter(Boolean).join(' ');\n}\n` },
  { name: 'src/assets/.gitkeep', lang: 'txt', complete: true, code: `` },
  { name: 'public/favicon.svg', lang: 'svg', complete: true, code: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#7C3AED"/></svg>\n` },
  { name: 'supabase/config.toml', lang: 'toml', complete: true, code: `project_id = "appforge"\n` },
  { name: 'package.json', lang: 'json', complete: true, code: `{\n  "name": "appforge-app",\n  "private": true,\n  "version": "0.0.1",\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build",\n    "preview": "vite preview"\n  },\n  "dependencies": {\n    "react": "^18.3.1",\n    "react-dom": "^18.3.1"\n  }\n}\n` },
  { name: 'vite.config.ts', lang: 'ts', complete: true, code: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n` },
  { name: 'tsconfig.json', lang: 'json', complete: true, code: `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "module": "ESNext",\n    "jsx": "react-jsx",\n    "strict": true\n  },\n  "include": ["src"]\n}\n` },
  { name: 'README.md', lang: 'md', complete: true, code: `# AppForge starter\n\nDescribe what you want to build in the chat panel.\n` },
];

function newConversation() {
  return {
    id: 'c_' + Math.random().toString(36).slice(2, 9),
    title: 'New chat',
    messages: [],
    files: STARTER_FILES.map(f => ({ ...f })),
    model: MODELS[0].id,
    updated: Date.now(),
    tokens: { in: 0, out: 0 },
    console: [],
  };
}

// ---- Main App --------------------------------------------------------------

export default function App() {
  const [theme, setTheme] = React.useState('dark');
  const [settings, setSettings] = React.useState(() => loadState()?.settings || DEFAULT_SETTINGS);
  const [conversations, setConversations] = React.useState(() => loadState()?.conversations || [newConversation()]);
  const [currentId, setCurrentId] = React.useState(() => loadState()?.currentId || null);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [chatWidth, setChatWidth] = React.useState(() => loadState()?.chatWidth || 460);
  const abortRef = React.useRef(null);

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

  const log = (id, level, msg) => {
    setConversations(cs => cs.map(c => c.id === id ? {
      ...c, console: [...(c.console || []), { t: Date.now(), level, msg }].slice(-200),
    } : c));
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

  const send = async (text, attachments = []) => {
    if (!current || isStreaming) return;
    const cid = current.id;
    const images = (attachments || []).filter(a => a.kind === 'image');
    const userMsg = {
      id: 'm_' + Math.random().toString(36).slice(2,9),
      role: 'user',
      content: text,
      attachments: images.map(a => ({ name: a.name, mime: a.mime, dataUrl: a.dataUrl })),
    };
    const baseMessages = [...current.messages, userMsg];
    const newTitle = current.messages.length === 0
      ? (text.slice(0, 40) + (text.length > 40 ? '…' : '')) || 'Image chat'
      : current.title;
    updateConvo(cid, { messages: baseMessages, title: newTitle });

    const { fn: streamer, key } = getStreamer(current.model, settings);
    log(cid, 'gen', `▶ ${current.model} · ${PROVIDER_FOR_MODEL(current.model)}${key ? '' : ' (demo mode)'}`);

    setIsStreaming(true);
    abortRef.current = new AbortController();
    const assistantMsg = {
      id: 'm_' + Math.random().toString(36).slice(2,9),
      role: 'assistant', content: '', model: current.model, tokens: null,
    };
    updateConvo(cid, c => ({ messages: [...c.messages, assistantMsg] }));

    let system = SYSTEM_PROMPT;
    if (current.files?.length) {
      system += `\n\nCurrent project files:\n` + current.files.map(f => `// ${f.name}\n\`\`\`${f.lang}\n${f.code}\n\`\`\``).join('\n\n');
      system += `\n\nModify these files based on the user's next request.`;
    }

    try {
      const apiMessages = baseMessages.map(m => {
        if (m.attachments?.length) {
          const blocks = [
            ...m.attachments.map(a => {
              const [, mime, , b64] = (a.dataUrl || '').match(/^data:([^;]+);(base64),(.*)$/) || [];
              return { type: 'image', source: { type: 'base64', media_type: mime || a.mime, data: b64 || '' } };
            }),
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
          const files = extractFiles(acc);
          setConversations(cs => cs.map(c => {
            if (c.id !== cid) return c;
            const msgs = c.messages.map(m => m.id === assistantMsg.id ? { ...m, content: acc } : m);
            return { ...c, messages: msgs, files: files.length ? files : c.files };
          }));
        }
        if (part.usage) usage = part.usage;
      }
      const finalFiles = extractFiles(acc);
      log(cid, 'info', `✓ generated ${finalFiles.length} file${finalFiles.length === 1 ? '' : 's'}`);
      setConversations(cs => cs.map(c => {
        if (c.id !== cid) return c;
        const tokens = usage || { in: Math.round(text.length / 4), out: Math.round(acc.length / 4) };
        const msgs = c.messages.map(m => m.id === assistantMsg.id ? { ...m, content: acc, tokens } : m);
        return {
          ...c, messages: msgs,
          files: finalFiles.length ? finalFiles : c.files,
          tokens: { in: c.tokens.in + tokens.in, out: c.tokens.out + tokens.out },
        };
      }));
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

  const setModel = (id) => updateConvo(current.id, { model: id });
  const setFile = (name, code) => {
    setConversations(cs => cs.map(c => c.id !== current.id ? c : {
      ...c, files: c.files.map(f => f.name === name ? { ...f, code } : f),
    }));
  };

  const totalTokens = React.useMemo(() => conversations.reduce((acc, c) => ({
    in: acc.in + (c.tokens?.in || 0), out: acc.out + (c.tokens?.out || 0),
  }), { in: 0, out: 0 }), [conversations]);

  const draggingRef = React.useRef(false);
  React.useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const w = Math.max(340, Math.min(720, e.clientX - (sidebarOpen ? 248 : 48)));
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
  const previewFile = pickPreviewFile(current.files);
  const previewCode = previewFile?.code || '';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ink-950">
      <HistorySidebar
        open={sidebarOpen}
        conversations={conversations}
        currentId={current.id}
        onPick={setCurrentId}
        onDelete={deleteConvo}
        onClose={() => setSidebarOpen(false)}
        onToggle={() => setSidebarOpen(o => !o)}
        totalTokens={totalTokens}
      />

      <ChatPanel
        width={chatWidth}
        messages={current.messages}
        isStreaming={isStreaming}
        model={current.model}
        onModelChange={setModel}
        onSend={send}
        onNewChat={newChat}
        onRetry={retry}
        onStop={stop}
        onPreview={() => { /* preview tab is default; just nudge focus to workspace */ window.dispatchEvent(new CustomEvent('forge:tab', { detail: 'preview' })); }}
        hasApiKey={hasApiKey}
      />

      <div className={`resizer ${draggingRef.current ? 'dragging' : ''}`} onMouseDown={startDrag} />

      <div className="flex-1 flex flex-col h-full min-w-0 bg-ink-900">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-800/80">
          <div className="flex items-center gap-3 text-[11.5px] text-ink-400">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
              <span className="font-mono uppercase tracking-[0.14em] text-ink-300">workspace</span>
            </div>
            {current.files.length > 0 && (
              <>
                <span className="text-ink-600">·</span>
                <span className="font-mono">{current.title}</span>
                <span className="text-ink-600">·</span>
                <span className="font-mono text-ink-500">{current.files.length} file{current.files.length === 1 ? '' : 's'}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
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
            previewCode={previewCode}
            isLoading={isStreaming}
            onFileChange={setFile}
            console={current.console || []}
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

