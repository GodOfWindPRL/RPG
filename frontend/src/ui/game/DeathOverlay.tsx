import { useEffect, useState } from 'react';

type DeathOverlayProps = {
  visible: boolean;
  onRevive: () => void;
};

export function DeathOverlay({ visible, onRevive }: DeathOverlayProps) {
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (!visible) {
      setAnimateIn(false);
      return;
    }
    const id = requestAnimationFrame(() => setAnimateIn(true));
    return () => cancelAnimationFrame(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={`death-overlay-backdrop fixed inset-0 z-200 flex flex-col items-center justify-center bg-black/70 backdrop-blur-[3px] transition-opacity duration-500 ease-out ${animateIn ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="death-title"
    >
      <div
        className={`death-overlay-panel flex flex-col items-center gap-8 rounded-2xl border border-red-900/50 bg-slate-950/85 px-12 py-10 shadow-[0_0_48px_rgba(127,29,29,0.35)] transition-all duration-500 ease-out ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
        style={{ transitionDelay: animateIn ? '120ms' : '0ms' }}
      >
        <h1 id="death-title" className="text-4xl font-bold tracking-tight text-red-400 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
          You Died.
        </h1>
        <button
          type="button"
          tabIndex={-1}
          className="death-revive-btn rounded-xl bg-linear-to-b from-red-800 to-red-950 px-10 py-3.5 text-lg font-semibold text-red-50 shadow-lg ring-1 ring-red-500/40 transition hover:from-red-700 hover:to-red-900 hover:ring-red-400/60 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
          onPointerDown={(e) => e.preventDefault()}
          onClick={onRevive}
        >
          Revive
        </button>
      </div>
    </div>
  );
}
