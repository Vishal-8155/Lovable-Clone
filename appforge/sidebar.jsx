// Collapsible conversation history sidebar
import { IconChevronLeft, IconHistory, IconTrash, IconX } from './icons.jsx';

export function HistorySidebar({ open, conversations, currentId, onPick, onDelete, onClose, onToggle, totalTokens, isMobile }) {
  // On mobile the sidebar is a slide-in drawer (CSS positions it fixed). It
  // always renders its full content; the drawer's close button dismisses it.
  // On desktop, width animates between 48px (collapsed) and 248px (expanded).
  const showFull = isMobile ? true : open;
  const desktopWidth = open ? 248 : 48;

  return (
    <div
      data-open={open ? 'true' : 'false'}
      className={`history-sidebar flex-none flex flex-col h-full bg-ink-950 border-r border-ink-800/80 transition-all duration-300 overflow-hidden`}
      style={isMobile ? undefined : { width: desktopWidth }}
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-ink-800/80">
        <button
          onClick={isMobile ? onClose : onToggle}
          className="p-1.5 rounded-md hover:bg-ink-800 text-ink-300 hover:text-white transition flex-none"
          title={isMobile ? 'Close history' : (open ? 'Collapse history' : 'Expand history')}
        >
          {isMobile ? <IconX size={14} /> : (open ? <IconChevronLeft size={14} /> : <IconHistory size={14} />)}
        </button>
        {showFull && <div className="text-[10.5px] uppercase tracking-[0.16em] text-ink-500 font-mono">history</div>}
      </div>

      {showFull ? (
        <>
          <div className="flex-1 overflow-y-auto scroll-fine px-2 py-2 space-y-1">
            {conversations.length === 0 && (
              <div className="px-2 py-6 text-center text-[11.5px] text-ink-500 leading-relaxed">
                No past conversations yet.<br/>Start one to see it here.
              </div>
            )}
            {conversations.map(c => (
              <div
                key={c.id}
                className={`group flex items-start gap-2 px-2 py-1.5 rounded-md cursor-pointer transition ${
                  c.id === currentId ? 'bg-forge-600/20 text-white' : 'hover:bg-ink-850 text-ink-300'
                }`}
                onClick={() => onPick(c.id)}
              >
                <span className={`flex-none w-1 h-7 rounded-full ${c.id === currentId ? 'bg-forge-400' : 'bg-ink-700 group-hover:bg-ink-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{c.title || 'Untitled'}</div>
                  <div className="text-[10.5px] text-ink-500 font-mono">{c.messages.length} msg · {timeAgo(c.updated)}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-ink-400 hover:text-red-300 hover:bg-red-500/10 transition"
                >
                  <IconTrash size={11} />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-ink-800/80 p-3">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-500 font-mono mb-1.5">plan</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[16px] font-semibold logo-gradient">Unlimited</span>
            </div>
            <div className="text-[10.5px] text-ink-500 font-mono mt-0.5">no token caps</div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center pt-2 gap-1">
          {conversations.slice(0, 8).map(c => (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              title={c.title}
              className={`w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-mono ${
                c.id === currentId ? 'bg-forge-600/30 text-forge-200' : 'text-ink-400 hover:bg-ink-850 hover:text-white'
              }`}
            >
              {(c.title || '?').charAt(0).toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  return d + 'd';
}

