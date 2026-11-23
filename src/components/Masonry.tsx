import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props<T> {
  items: T[];
  /** Приблизна висота картки при заданій ширині колонки — щоб колонки виходили рівними */
  estimate: (item: T, colWidth: number) => number;
  render: (item: T) => ReactNode;
  getKey: (item: T) => string;
  minColumn?: number;
  gap?: number;
}

/** Сітка «цеглинками»: кожна наступна картка йде в найкоротшу колонку, тож новіші лишаються зверху. */
export function Masonry<T>({ items, estimate, render, getKey, minColumn = 250, gap = 12 }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor((width + gap) / (minColumn + gap)));
  const colWidth = width ? (width - gap * (cols - 1)) / cols : minColumn;
  const columns: T[][] = Array.from({ length: cols }, () => []);
  const heights = new Array<number>(cols).fill(0);
  for (const item of items) {
    let shortest = 0;
    for (let i = 1; i < cols; i++) if (heights[i] < heights[shortest] - 1) shortest = i;
    columns[shortest].push(item);
    heights[shortest] += estimate(item, colWidth) + gap;
  }

  return (
    <div className="masonry" ref={ref} style={{ gap }}>
      {width > 0 &&
        columns.map((col, i) => (
          <div className="masonry-col" key={i} style={{ gap }}>
            {col.map((item) => (
              <div key={getKey(item)}>{render(item)}</div>
            ))}
          </div>
        ))}
    </div>
  );
}
