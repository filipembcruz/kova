import { useState } from 'react';
import { lighten } from './ui';

export function Donut({ data, size = 230, thick = 30, onSelect, selected }: { data: { id: string; value: number; color: string }[]; size?: number; thick?: number; onSelect?: (id: string | null) => void; selected?: string | null }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = (size - thick) / 2;
  const c = 2 * Math.PI * r;
  const gap = data.length > 1 ? 4 : 0;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card2)" strokeWidth={thick} />
      {data.map((d) => {
        const len = (d.value / total) * c;
        const seg = Math.max(len - gap, 0.5);
        const el = (
          <circle
            key={d.id}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={selected === d.id ? thick + 8 : thick}
            strokeDasharray={`${seg} ${c - seg}`}
            strokeDashoffset={-acc}
            strokeLinecap={len > 14 ? 'round' : 'butt'}
            opacity={selected && selected !== d.id ? 0.35 : 1}
            style={{ transition: 'all .3s' }}
            onClick={() => onSelect?.(selected === d.id ? null : d.id)}
          />
        );
        acc += len;
        return el;
      })}
    </svg>
  );
}

export interface BarGroup {
  label: string;
  bars: { value: number; color: string; key?: string }[];
  stacked?: boolean;
  highlight?: boolean;
}

/** Grouped or stacked bar chart with rounded bars. */
export function Bars({ groups, height = 200, fmt, onPick, picked }: { groups: BarGroup[]; height?: number; fmt?: (v: number) => string; onPick?: (i: number) => void; picked?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const sel = picked ?? hover;
  const max = Math.max(1, ...groups.map((g) => (g.stacked ? g.bars.reduce((a, b) => a + Math.max(b.value, 0), 0) : Math.max(...g.bars.map((b) => Math.abs(b.value)), 0))));
  const W = 340;
  const top = 26;
  const H = height;
  const bottom = 22;
  const plotH = H - top - bottom;
  const gw = W / groups.length;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ height: 'auto' }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={0} x2={W} y1={top + plotH * (1 - f)} y2={top + plotH * (1 - f)} stroke="var(--line)" strokeDasharray="3 5" />
      ))}
      {groups.map((g, i) => {
        const n = g.stacked ? 1 : g.bars.length;
        const inner = Math.min(gw * 0.72, n * 22 + (n - 1) * 4);
        const bw = g.stacked ? inner : (inner - (n - 1) * 4) / n;
        const x0 = i * gw + (gw - inner) / 2;
        const isSel = sel === i;
        let yAcc = top + plotH;
        const sumV = g.bars.reduce((a, b) => a + Math.max(b.value, 0), 0);
        const pillV = g.stacked ? sumV : Math.max(...g.bars.map((b) => b.value));
        return (
          <g key={i} onClick={() => { setHover(i); onPick?.(i); }} style={{ cursor: 'pointer' }}>
            <rect x={i * gw} y={0} width={gw} height={H} fill="transparent" />
            {g.stacked
              ? g.bars.filter((b) => b.value > 0).map((b, j, arr) => {
                  const h = (b.value / max) * plotH;
                  yAcc -= h;
                  const last = j === arr.length - 1;
                  return (
                    <rect key={j} x={x0} y={yAcc} width={bw} height={Math.max(h - 1.5, 0.5)} rx={last ? Math.min(8, bw / 2) : 2} fill={b.color} opacity={sel !== null && !isSel ? 0.45 : 1} />
                  );
                })
              : g.bars.map((b, j) => {
                  const h = Math.max((Math.abs(b.value) / max) * plotH, b.value ? 3 : 0);
                  return (
                    <rect
                      key={j}
                      x={x0 + j * (bw + 4)}
                      y={top + plotH - h}
                      width={bw}
                      height={h}
                      rx={Math.min(8, bw / 2)}
                      fill={g.highlight || isSel ? b.color : sel === null && !groups.some((x) => x.highlight) ? b.color : lighten(b.color.startsWith('#') ? b.color : '#9B8CFF', 0.55)}
                    />
                  );
                })}
            <text x={i * gw + gw / 2} y={H - 4} textAnchor="middle" fontSize="11" fill={isSel || g.highlight ? 'var(--ink)' : 'var(--muted)'} fontWeight={isSel || g.highlight ? 700 : 500}>
              {g.label}
            </text>
            {(isSel || (sel === null && g.highlight)) && fmt && pillV > 0 && (
              <g>
                {(() => {
                  const txt = fmt(pillV);
                  const w = Math.max(40, txt.length * 6.4 + 14);
                  const cx = Math.min(Math.max(i * gw + gw / 2, w / 2), W - w / 2);
                  const h = (g.stacked ? sumV : Math.abs(pillV)) / max * plotH;
                  const y = Math.max(top + plotH - h - 24, 0);
                  return (
                    <>
                      <rect x={cx - w / 2} y={y} width={w} height={20} rx={10} fill="var(--ink)" />
                      <text x={cx} y={y + 14} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--card)">{txt}</text>
                    </>
                  );
                })()}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Week pace bars with dashed average line (home). */
export function PaceBars({ days, avg, fmt, color = '#7C5CFF' }: { days: { label: string; value: number; today?: boolean }[]; avg: number; fmt: (v: number) => string; color?: string }) {
  const W = 340, H = 170, top = 30, bottom = 22, left = 4;
  const plotH = H - top - bottom;
  const max = Math.max(1, avg * 1.2, ...days.map((d) => d.value));
  const gw = (W - left) / days.length;
  const bw = Math.min(34, gw * 0.62);
  const maxIdx = days.reduce((m, d, i) => (d.value > days[m].value ? i : m), 0);
  const avgY = top + plotH - (avg / max) * plotH;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={lighten(color, 0.82)} />
          <line x1="0" y1="0" x2="0" y2="6" stroke={lighten(color, 0.55)} strokeWidth="2" />
        </pattern>
        <linearGradient id="hot" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ff5fa2" />
          <stop offset="1" stopColor={color} />
        </linearGradient>
      </defs>
      {days.map((d, i) => {
        const h = Math.max((d.value / max) * plotH, 6);
        const x = left + i * gw + (gw - bw) / 2;
        const hot = i === maxIdx && d.value > 0;
        return (
          <g key={i}>
            <rect x={x} y={top + plotH - h} width={bw} height={h} rx={bw / 2} fill={hot ? 'url(#hot)' : 'url(#hatch)'} />
            <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize="11" fill={d.today ? 'var(--ink)' : 'var(--muted)'} fontWeight={d.today ? 700 : 500}>{d.label}</text>
            {hot && (() => {
              const txt = fmt(d.value);
              const w = Math.max(42, txt.length * 6.3 + 14);
              const cx = Math.min(Math.max(x + bw / 2, w / 2), W - w / 2);
              const y = Math.max(top + plotH - h - 26, 0);
              return (
                <>
                  <rect x={cx - w / 2} y={y} width={w} height={21} rx={10.5} fill="#ff5fa2" />
                  <text x={cx} y={y + 14.5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{txt}</text>
                </>
              );
            })()}
          </g>
        );
      })}
      {avg > 0 && <line x1={0} x2={W} y1={avgY} y2={avgY} stroke="#ff5fa2" strokeWidth="1.5" strokeDasharray="4 5" />}
    </svg>
  );
}
