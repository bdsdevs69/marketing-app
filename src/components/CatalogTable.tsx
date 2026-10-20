'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface Column<T> {
  key: string;
  label: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: number;
  render: (row: T) => React.ReactNode;
}

interface CatalogTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  // Height of the sticky app header, so the column headings stick under it.
  stickyTop?: number;
  empty?: React.ReactNode;
}

const EST_ROW_HEIGHT = 64;
const OVERSCAN_PX = 1000;

// A table that scrolls with the page (no inner scroll box) but only keeps the
// rows near the viewport in the DOM. Row heights vary (genre chips wrap), so
// each row is measured the first time it renders and spacer rows keep the
// page height exact. Scroll state lives here, so scrolling never re-renders
// the dashboard around the table.
export default function CatalogTable<T>({ rows, columns, rowKey, stickyTop = 64, empty }: CatalogTableProps<T>) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const heights = useRef<Map<number, number>>(new Map());
  const [view, setView] = useState({ top: 0, height: 900 });
  const [measureTick, setMeasureTick] = useState(0);

  // New data means new row heights.
  useEffect(() => {
    heights.current.clear();
    setMeasureTick((t) => t + 1);
  }, [rows]);

  // Track which slice of the table is on screen, once per animation frame.
  const frame = useRef<number | null>(null);
  const update = useCallback(() => {
    frame.current = null;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = Math.max(0, stickyTop - rect.top);
    const height = window.innerHeight;
    setView((v) => (Math.abs(v.top - top) < 8 && v.height === height ? v : { top, height }));
  }, [stickyTop]);

  useEffect(() => {
    const schedule = () => {
      if (frame.current === null) frame.current = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [update]);

  const range = useMemo(() => {
    const total = rows.length;
    const heightAt = (i: number) => heights.current.get(i) ?? EST_ROW_HEIGHT;

    const from = Math.max(0, view.top - OVERSCAN_PX);
    let start = 0;
    let padTop = 0;
    while (start < total && padTop + heightAt(start) <= from) {
      padTop += heightAt(start);
      start++;
    }

    const budget = view.height + OVERSCAN_PX * 2;
    let end = start;
    let used = 0;
    while (end < total && used < budget) {
      used += heightAt(end);
      end++;
    }

    let padBottom = 0;
    for (let i = end; i < total; i++) padBottom += heightAt(i);

    return { start, end, padTop, padBottom };
    // measureTick: recompute once real heights are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, view, measureTick]);

  // Measure each row the first time it renders; recompute only if the
  // estimates were off enough to matter.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let drift = 0;
    el.querySelectorAll<HTMLTableRowElement>('tr[data-row]').forEach((tr) => {
      const index = Number(tr.dataset.row);
      if (heights.current.has(index)) return;
      const h = tr.offsetHeight;
      if (h > 0) {
        heights.current.set(index, h);
        drift += Math.abs(h - EST_ROW_HEIGHT);
      }
    });
    if (drift > 24) setMeasureTick((t) => t + 1);
  });

  const colCount = columns.length;

  return (
    <div ref={wrapRef} className="catalog-grid">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ top: stickyTop, width: c.width, textAlign: c.align ?? 'left' }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="catalog-grid-empty">
                {empty ?? 'No results found'}
              </td>
            </tr>
          ) : (
            <>
              {range.padTop > 0 && (
                <tr aria-hidden="true" className="catalog-spacer" style={{ height: range.padTop }}>
                  <td colSpan={colCount} />
                </tr>
              )}
              {rows.slice(range.start, range.end).map((row, offset) => {
                const index = range.start + offset;
                return (
                  <tr key={rowKey(row, index)} data-row={index}>
                    {columns.map((c) => (
                      <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {range.padBottom > 0 && (
                <tr aria-hidden="true" className="catalog-spacer" style={{ height: range.padBottom }}>
                  <td colSpan={colCount} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
