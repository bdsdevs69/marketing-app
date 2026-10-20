'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

// Jump to the top or bottom of a long catalogue. Keeps its own scroll state so
// the dashboard doesn't re-render while scrolling.
export default function ScrollButtons() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      setVisible(window.scrollY > 500);
    };
    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={`scroll-buttons${visible ? ' is-visible' : ''}`}>
      <button type="button" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <ArrowUp size={18} />
      </button>
      <button
        type="button"
        aria-label="Jump to bottom"
        className="is-dark"
        onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
      >
        <ArrowDown size={18} />
      </button>
    </div>
  );
}
