'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  onReset?: () => void;
  resetDisabled?: boolean;
  footerLabel: string;
  children: React.ReactNode;
}

// Right-hand sheet that slides over a blurred page. It stays mounted through
// the closing animation so it can slide back out rather than vanish.
export default function FilterDrawer({
  open,
  onClose,
  onReset,
  resetDisabled,
  footerLabel,
  children,
}: FilterDrawerProps) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  // Keep the latest onClose without re-running the open/close effects (which
  // would steal focus from inputs inside the drawer on every keystroke).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      // Two frames so the off-screen position paints before sliding in.
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }

    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), 300);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);

    // Stop the page underneath from scrolling while the sheet is open.
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });

    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div className={`filter-drawer${shown ? ' is-open' : ''}`}>
      <div className="filter-drawer-backdrop" onClick={() => onCloseRef.current()} />

      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className="filter-drawer-panel"
      >
        <header className="filter-drawer-head">
          <h2 className="text-lg font-bold text-white">Refine the list</h2>
          <div className="flex items-center gap-4">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                disabled={resetDisabled}
                className="text-sm font-semibold text-gray-400 hover:text-white disabled:opacity-40 disabled:hover:text-gray-400 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              aria-label="Close filters"
              className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="filter-drawer-body">{children}</div>

        <footer className="filter-drawer-foot">
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="filter-drawer-cta"
          >
            {footerLabel}
          </button>
        </footer>
      </aside>
    </div>
  );
}
