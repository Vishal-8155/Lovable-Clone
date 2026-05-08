// Settings modal — API keys, temperature, max tokens, persisted to localStorage
import React from 'react';
import { IconKey, IconSettings, IconX } from './icons.jsx';

const TOKEN_OPTIONS = [1000, 2000, 4000];

export function SettingsModal({ open, onClose, settings, onChange }) {
  if (!open) return null;
  const set = (k, v) => onChange({ ...settings, [k]: v });
  const tempPct = Math.round(settings.temperature * 100);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-fade-up">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md glass rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-forge-600/20 flex items-center justify-center text-forge-300">
              <IconSettings size={14} />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-ink-100">Settings</div>
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-500 font-mono">api keys & model</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/5 text-ink-400 hover:text-white transition">
            <IconX size={14} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto scroll-fine">
          <Field label="Anthropic API key" hint="sk-ant-…">
            <KeyInput value={settings.anthropicKey} onChange={v => set('anthropicKey', v)} placeholder="sk-ant-api03-…" />
          </Field>
          <Field label="OpenAI API key" hint="sk-…">
            <KeyInput value={settings.openaiKey} onChange={v => set('openaiKey', v)} placeholder="sk-…" />
          </Field>
          <Field label="Gemini API key" hint="AIza…">
            <KeyInput value={settings.geminiKey} onChange={v => set('geminiKey', v)} placeholder="AIza…" />
          </Field>

          <div className="h-px bg-white/5" />

          <Field label="Temperature" hint={`${settings.temperature.toFixed(2)}`}>
            <input
              type="range"
              min={0} max={1} step={0.05}
              value={settings.temperature}
              onChange={e => set('temperature', parseFloat(e.target.value))}
              className="forge-range"
              style={{ '--val': tempPct + '%' }}
            />
            <div className="flex justify-between text-[10px] uppercase font-mono text-ink-500 tracking-wider mt-1">
              <span>precise</span><span>balanced</span><span>creative</span>
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 bg-ink-900/40">
          <div className="text-[10.5px] text-ink-500 font-mono">
            stored locally · not sent anywhere
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-forge-600 hover:bg-forge-500 text-white text-[12px] font-medium shadow-lg shadow-forge-900/40 transition"
          >
            Save & close
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11.5px] uppercase tracking-[0.14em] text-ink-300 font-mono">{label}</label>
        {hint && <span className="text-[10.5px] text-ink-500 font-mono">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function KeyInput({ value, onChange, placeholder }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">
        <IconKey size={13} />
      </div>
      <input
        type={show ? 'text' : 'password'}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-14 py-2 rounded-md bg-ink-850 border border-ink-700 focus:border-forge-500/60 outline-none text-[12.5px] text-ink-100 placeholder-ink-500 font-mono transition"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] uppercase font-mono tracking-wider text-ink-400 hover:text-white"
      >
        {show ? 'hide' : 'show'}
      </button>
    </div>
  );
}

