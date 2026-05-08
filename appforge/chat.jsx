// Chat panel: message history, streaming, model selector, prompt suggestions, input
import React from 'react';
import {
  IconAlert,
  IconBolt,
  IconChart,
  IconCheck,
  IconChevron,
  IconCloud,
  IconCode,
  IconCopy,
  IconEye,
  IconList,
  IconPlus,
  IconRefresh,
  IconSparkles,
  ModelDot,
} from './icons.jsx';
import { renderMessageBody } from './highlighter.jsx';

export const MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4',  provider: 'Anthropic', color: '#d97706' },
  { id: 'gpt-4o',                   label: 'GPT-4o',           provider: 'OpenAI',    color: '#10a37f' },
  { id: 'gpt-4.1',                  label: 'GPT-4.1',          provider: 'OpenAI',    color: '#10a37f' },
  { id: 'gemini-1.5-pro',           label: 'Gemini 1.5 Pro',   provider: 'Google',    color: '#4285f4' },
  { id: 'gemini-2.5-pro',           label: 'Gemini 2.5 Pro',   provider: 'Google',    color: '#4285f4' },
];

export const SUGGESTIONS = [
  { icon: IconList,   title: 'Todo app',           sub: 'with drag and drop reordering',          prompt: 'Build a beautiful todo app with drag-and-drop reordering, priority colors, and a count of remaining tasks.' },
  { icon: IconChart,  title: 'Analytics dashboard', sub: 'with charts and KPI cards',              prompt: 'Create a sleek analytics dashboard with KPI cards, a line chart of weekly visitors, and a recent-activity feed.' },
  { icon: IconBolt,   title: 'SaaS landing',       sub: 'hero, features, pricing, footer',         prompt: 'Make a modern landing page for a SaaS product called Forge — hero, three feature cards, three pricing tiers, footer.' },
  { icon: IconCloud,  title: 'Weather app',        sub: 'today + 5-day forecast',                   prompt: 'Build a weather app UI showing today\'s conditions and a 5-day forecast with mock data and pretty icons.' },
];

function ModelPill({ model, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-ink-800 hover:bg-ink-750 border border-ink-700 text-[11.5px] text-ink-200 transition"
    >
      <ModelDot color={model.color} />
      <span className="font-medium">{model.label}</span>
      <IconChevron size={11} className="text-ink-400" />
    </button>
  );
}

function ModelMenu({ open, current, onPick, onClose }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-0 mt-1.5 w-64 z-50 glass rounded-lg shadow-2xl shadow-black/50 p-1 animate-fade-up">
        {MODELS.map(m => (
          <button
            key={m.id}
            onClick={() => { onPick(m); onClose(); }}
            className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-left transition ${
              current === m.id ? 'bg-forge-600/20 text-white' : 'text-ink-200 hover:bg-ink-800'
            }`}
          >
            <ModelDot color={m.color} />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium leading-tight">{m.label}</div>
              <div className="text-[10.5px] text-ink-500 font-mono uppercase tracking-wider">{m.provider}</div>
            </div>
            {current === m.id && <IconCheck size={13} className="text-forge-300" />}
          </button>
        ))}
      </div>
    </>
  );
}

function TypingIndicator({ model }) {
  const m = MODELS.find(x => x.id === model) || MODELS[0];
  return (
    <div className="flex items-start gap-3 animate-fade-up">
      <div className="flex-none w-7 h-7 rounded-md bg-gradient-to-br from-forge-500 to-pink-400 flex items-center justify-center">
        <IconSparkles size={14} className="text-white" />
      </div>
      <div className="flex-1 pt-1.5">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-500 font-mono mb-1.5 flex items-center gap-1.5">
          <ModelDot color={m.color} /> {m.label} <span className="text-ink-600">·</span> generating
        </div>
        <div className="flex items-center gap-1 h-5">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    </div>
  );
}

function ImageLightbox({ src, name, onClose }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-up">
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <img src={src} alt={name || 'image'} className="max-w-[90vw] max-h-[85vh] rounded-xl shadow-2xl shadow-black/60 border border-white/10" />
        {name && <div className="mt-2 text-center text-[11px] text-ink-400 font-mono">{name}</div>}
        <button onClick={onClose} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-ink-900 border border-ink-700 text-white text-[14px] flex items-center justify-center hover:bg-forge-600 transition">×</button>
      </div>
    </div>
  );
}

export function MessageView({ msg, onCopyCode, onRetry, onPreview }) {
  const m = MODELS.find(x => x.id === msg.model) || MODELS[0];
  const isUser = msg.role === 'user';
  const [lightbox, setLightbox] = React.useState(null);
  const handlePreview = (p) => {
    if (p?.kind === 'image') { setLightbox(p); return; }
    onPreview?.(p);
  };

  if (isUser) {
    const atts = msg.attachments || [];
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="max-w-[85%] bg-forge-600/15 border border-forge-600/25 rounded-2xl rounded-tr-sm px-3.5 py-2.5">
          {atts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {atts.map((a, i) => (
                <button
                  key={i}
                  onClick={() => handlePreview({ kind: 'image', src: a.dataUrl, name: a.name })}
                  className="group relative rounded-xl overflow-hidden border border-white/10 bg-ink-900/50 backdrop-blur-md hover:border-forge-400/60 transition"
                >
                  <img src={a.dataUrl} alt={a.name || 'attachment'} className="max-h-44 max-w-[220px] object-cover block" />
                  <span className="absolute inset-0 flex items-end justify-end p-1.5 opacity-0 group-hover:opacity-100 transition bg-gradient-to-t from-black/60 to-transparent">
                    <span className="text-[10px] font-mono text-white/90 px-1.5 py-0.5 rounded bg-black/40">expand</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {msg.content && <div className="text-[14px] leading-relaxed text-ink-100 whitespace-pre-wrap">{msg.content}</div>}
        </div>
        {lightbox && <ImageLightbox src={lightbox.src} name={lightbox.name} onClose={() => setLightbox(null)} />}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 animate-fade-up">
      <div className="flex-none w-7 h-7 rounded-md bg-gradient-to-br from-forge-500 to-pink-400 flex items-center justify-center mt-0.5">
        <IconSparkles size={14} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-500 font-mono mb-1.5 flex items-center gap-1.5">
          <ModelDot color={m.color} /> {m.label}
        </div>
        <div className="space-y-1">{renderMessageBody(msg.content, { onCopy: onCopyCode, onPreview })}</div>
        {msg.error && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[12.5px]">
            <IconAlert size={14} />
            <span className="flex-1">{msg.error}</span>
            <button onClick={() => onRetry?.(msg)} className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-200 text-[11px]">
              <IconRefresh size={11} /> Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatPanel({
  width, messages, isStreaming, model, onModelChange,
  onSend, onNewChat, onRetry, onStop, onPreview, hasApiKey,
}) {
  const [input, setInput] = React.useState('');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [attachments, setAttachments] = React.useState([]); // {id, kind, name, size, dataUrl, mime}
  const [dragOver, setDragOver] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const scrollRef = React.useRef(null);
  const taRef = React.useRef(null);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isStreaming]);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(null), 2400);
  };

  const ingestFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    for (const f of files) {
      if (f.size > 8 * 1024 * 1024) { showToast(`${f.name} is too large (8MB max)`); continue; }
      const isImg = f.type.startsWith('image/');
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(f);
        });
        setAttachments(a => [...a, {
          id: 'a_' + Math.random().toString(36).slice(2, 9),
          kind: isImg ? 'image' : 'file',
          name: f.name || (isImg ? 'screenshot.png' : 'file'),
          size: f.size,
          mime: f.type || 'application/octet-stream',
          dataUrl,
        }]);
      } catch { showToast(`Could not read ${f.name}`); }
    }
  };

  const onPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      ingestFiles(files);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) ingestFiles(e.dataTransfer.files);
  };

  const removeAttachment = (id) => setAttachments(a => a.filter(x => x.id !== id));

  const send = () => {
    const v = input.trim();
    if ((!v && !attachments.length) || isStreaming) return;
    onSend(v, attachments);
    setInput('');
    setAttachments([]);
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const m = MODELS.find(x => x.id === model) || MODELS[0];
  const showWelcome = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-ink-900 border-r border-ink-800" style={{ width }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-ink-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="logo-mark w-7 h-7 flex-none" />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-tight">
              App<span className="logo-gradient">Forge</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-500 font-mono">AI app builder</div>
          </div>
        </div>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-ink-800 hover:bg-forge-600/20 hover:text-white border border-ink-700 hover:border-forge-600/40 text-[12px] text-ink-200 transition"
        >
          <IconPlus size={12} /> New
        </button>
      </div>

      {/* Model selector */}
      <div className="px-4 py-2.5 border-b border-ink-800/50 flex items-center justify-between gap-2">
        <div className="relative">
          <ModelPill model={m} onClick={() => setMenuOpen(o => !o)} />
          <ModelMenu open={menuOpen} current={model} onPick={(mm) => onModelChange(mm.id)} onClose={() => setMenuOpen(false)} />
        </div>
        {!hasApiKey && (
          <div className="text-[10.5px] text-amber-300/80 font-mono uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-soft" />
            demo mode
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-fine px-4 py-4 space-y-4">
        {showWelcome ? (
          <WelcomeBlock onPick={(p) => onSend(p)} />
        ) : (
          <>
            {messages.map(msg => (
              <MessageView key={msg.id} msg={msg} onRetry={onRetry} onPreview={onPreview} />
            ))}
            {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && <TypingIndicator model={model} />}
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-ink-800/80 relative">
        {toast && (
          <div className="absolute -top-10 left-3 right-3 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-200 text-[12px] animate-fade-up">
            {toast}
          </div>
        )}
        <input ref={fileInputRef} type="file" multiple accept="image/*,.txt,.md,.json,.js,.jsx,.ts,.tsx,.css,.html" className="hidden" onChange={(e) => { ingestFiles(e.target.files); e.target.value = ''; }} />
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-2xl bg-ink-850 border transition-all ${dragOver ? 'border-forge-400 shadow-[0_0_0_4px_rgba(124,58,237,0.18)]' : 'border-ink-700 focus-within:border-forge-500/50 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.12)]'}`}
        >
          {dragOver && (
            <div className="px-4 py-2 text-[12px] text-forge-200 border-b border-forge-500/30 bg-forge-600/10 rounded-t-2xl">
              Drop images or files to attach…
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map(a => (
                <div key={a.id} className="group relative rounded-xl bg-ink-800/80 border border-ink-700 backdrop-blur-md overflow-hidden animate-fade-up">
                  {a.kind === 'image' ? (
                    <img src={a.dataUrl} alt={a.name} className="w-16 h-16 object-cover" />
                  ) : (
                    <div className="w-16 h-16 flex flex-col items-center justify-center gap-0.5 px-1">
                      <span className="text-[10px] font-mono text-forge-300">{(a.name.split('.').pop() || 'file').toUpperCase()}</span>
                      <span className="text-[9px] text-ink-500 truncate w-full text-center">{a.name}</span>
                    </div>
                  )}
                  <button onClick={() => removeAttachment(a.id)} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition" title="Remove">×</button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={taRef}
            value={input}
            onChange={onInput}
            onKeyDown={onKey}
            onPaste={onPaste}
            rows={1}
            placeholder={messages.length ? 'Ask AppForge… (paste or drop images)' : 'Ask AppForge to build something… (paste or drop images)'}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[13.5px] text-ink-100 placeholder-ink-500 outline-none scroll-fine"
            style={{ maxHeight: 200 }}
          />
          <div className="flex items-center justify-between px-2 pb-2 pt-1 gap-2">
            <div className="flex items-center gap-1">
              <AttachMenu onUploadFiles={() => fileInputRef.current?.click()} />
              <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-ink-800 hover:bg-ink-750 border border-ink-700 text-[11.5px] text-ink-200 transition">
                <IconSparkles size={11} className="text-forge-300" /> Visual edits
              </button>
              <button className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-ink-800 text-[11.5px] text-ink-300 transition">
                Build <IconChevron size={10} />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button className="w-7 h-7 rounded-full hover:bg-ink-800 text-ink-400 hover:text-white transition flex items-center justify-center" title="Voice">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><path d="M12 19v3"/></svg>
              </button>
              {isStreaming ? (
                <button onClick={onStop} className="w-8 h-8 rounded-full bg-red-500/30 hover:bg-red-500/40 border border-red-400/50 text-red-200 transition flex items-center justify-center" title="Stop">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-300" />
                </button>
              ) : (
                <button onClick={send} disabled={!input.trim()} className="w-8 h-8 rounded-full bg-forge-600 hover:bg-forge-500 disabled:bg-ink-800 disabled:text-ink-500 text-white transition flex items-center justify-center shadow-lg shadow-forge-900/40 disabled:shadow-none" title="Send">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WelcomeBlock({ onPick }) {
  return (
    <div className="py-4">
      <div className="mb-5">
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-forge-300 font-mono mb-2 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-forge-400 animate-pulse-soft" />
          ready
        </div>
        <h2 className="font-display text-[34px] leading-[1.05] text-ink-100 mb-2">
          What should we<br /><em>forge today?</em>
        </h2>
        <p className="text-[13px] text-ink-400 leading-relaxed">
          Describe a component, screen, or full app. I'll write the React + Tailwind for it and render it on the right — instantly.
        </p>
      </div>
      <div className="text-[10.5px] uppercase tracking-[0.16em] text-ink-500 font-mono mb-2.5">Try one</div>
      <div className="grid grid-cols-2 gap-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick(s.prompt)}
            className="group text-left p-3 rounded-lg bg-ink-850 hover:bg-ink-800 border border-ink-700 hover:border-forge-600/40 transition"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <s.icon size={13} className="text-forge-300 group-hover:text-forge-200 transition" />
              <div className="text-[12.5px] font-medium text-ink-100">{s.title}</div>
            </div>
            <div className="text-[11.5px] text-ink-400 leading-snug">{s.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AttachMenu({ onUploadFiles }) {
  const [open, setOpen] = React.useState(false);
  const items = [
    { label: 'Upload files',   sub: 'Drop documents or assets', icon: '⤥', action: onUploadFiles },
    { label: 'Upload images',  sub: 'PNG, JPG, SVG',            icon: '▣', action: onUploadFiles },
    { label: 'Import project', sub: 'From a URL or zip',          icon: '▤' },
    { label: 'Connect GitHub', sub: 'Sync to a repository',       icon: '●' },
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-7 h-7 rounded-full transition flex items-center justify-center ${open ? 'bg-forge-600/30 text-forge-200' : 'hover:bg-ink-800 text-ink-300 hover:text-white'}`}
        title="Attach"
      >
        <IconPlus size={13} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 z-50 w-60 glass rounded-xl shadow-2xl shadow-black/50 p-1 animate-fade-up">
            {items.map(it => (
              <button key={it.label} onClick={() => { setOpen(false); it.action?.(); }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-forge-600/15 text-left transition">
                <span className="w-7 h-7 rounded-md bg-ink-800 flex items-center justify-center text-forge-300 text-[13px]">{it.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-ink-100 font-medium leading-tight">{it.label}</span>
                  <span className="block text-[10.5px] text-ink-500 font-mono">{it.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

