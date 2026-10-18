import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { tap } from '../native';

/** Drag-to-reorder for lists and grids (pointer events; works with touch and mouse). */
export function Sortable<T extends { id: string }>({ items, enabled, onCommit, className, itemClass, render }: {
  items: T[];
  enabled: boolean;
  onCommit: (ids: string[]) => void;
  className?: string;
  itemClass?: string;
  render: (item: T, dragging: boolean) => ReactNode;
}) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const st = useRef({ gx: 0, gy: 0, px: 0, py: 0 });
  const ids = order ?? items.map((i) => i.id);
  const byId = new Map(items.map((i) => [i.id, i]));

  const elOf = (id: string) => box.current?.querySelector(`[data-sort-id="${CSS.escape(id)}"]`) as HTMLElement | null;
  const place = () => {
    if (!dragId) return;
    const el = elOf(dragId);
    if (!el) return;
    el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${st.current.px - st.current.gx - r.left}px, ${st.current.py - st.current.gy - r.top}px) scale(1.05)`;
  };
  useLayoutEffect(place);

  const down = (e: React.PointerEvent) => {
    if (!enabled) return;
    const el = (e.target as HTMLElement).closest('[data-sort-id]') as HTMLElement | null;
    if (!el || !box.current) return;
    const r = el.getBoundingClientRect();
    st.current = { gx: e.clientX - r.left, gy: e.clientY - r.top, px: e.clientX, py: e.clientY };
    box.current.setPointerCapture(e.pointerId);
    setOrder(items.map((i) => i.id));
    setDragId(el.dataset.sortId!);
    tap();
  };

  const move = (e: React.PointerEvent) => {
    if (!dragId || !box.current) return;
    st.current.px = e.clientX;
    st.current.py = e.clientY;
    if (e.clientY < 90) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 140) window.scrollBy(0, 12);
    for (const el of Array.from(box.current.querySelectorAll('[data-sort-id]')) as HTMLElement[]) {
      const id = el.dataset.sortId!;
      if (id === dragId) continue;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const cur = [...ids];
        const to = ids.indexOf(id);
        cur.splice(ids.indexOf(dragId), 1);
        cur.splice(to, 0, dragId);
        if (cur.join() !== ids.join()) { setOrder(cur); return; }
      }
    }
    place();
  };

  const up = () => {
    if (!dragId) return;
    const el = elOf(dragId);
    if (el) el.style.transform = '';
    onCommit(ids);
    setDragId(null);
    setOrder(null);
  };

  return (
    <div ref={box} className={(className ?? '') + ' sortable' + (dragId ? ' active' : '')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {ids.map((id) => {
        const it = byId.get(id);
        if (!it) return null;
        return (
          <div key={id} data-sort-id={id} className={(itemClass ?? '') + (enabled ? ' drag-item' : '') + (dragId === id ? ' dragging' : '')}>
            {render(it, dragId === id)}
          </div>
        );
      })}
    </div>
  );
}
