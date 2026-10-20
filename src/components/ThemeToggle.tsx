'use client';

import { Moon, Sun } from 'lucide-react';

export const THEME_KEY = 'dna-pricing-theme';

// Light/dark switch. The theme lives on <html data-theme> (set before first
// paint by the boot script in layout.tsx), so this needs no React state and
// CSS decides which icon shows — nothing flips after hydration.
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    if (next === 'dark') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {}
  };

  return (
    <button type="button" onClick={toggle} className={`theme-toggle ${className}`} aria-label="Switch light or dark mode">
      <Moon size={16} className="theme-icon-moon" aria-hidden="true" />
      <Sun size={16} className="theme-icon-sun" aria-hidden="true" />
      <span className="theme-label theme-label-dark">Dark</span>
      <span className="theme-label theme-label-light">Light</span>
    </button>
  );
}
