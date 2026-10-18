import { useMemo, useState } from 'react';
import { PiCaretLeftBold, PiCaretRightBold, PiCaretDownBold, PiCalendarBlankBold } from 'react-icons/pi';
import { useStore } from '../lib/store';
import { useT } from '../i18n';
import { addDays, Gran, iso, pad, parseIso, Period, periodOf, shiftPeriod, today, inPeriod } from '../lib/calc';
import { monthLabel, shortDate } from '../lib/format';
import { openOverlay } from '../lib/nav';
import { PeriodNav, Sheet } from './ui';

function monthNames(locale: string) {
  return Array.from({ length: 12 }, (_, i) => {
    const s = new Date(2024, i, 1).toLocaleDateString(locale, { month: 'short' }).replace('.', '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}

function useYears() {
  const s = useStore();
  return useMemo(() => {
    const now = new Date().getFullYear();
    let min = now;
    for (const t of s.txs) { const y = Number(t.date.slice(0, 4)); if (y < min) min = y; }
    const out: number[] = [];
    for (let y = now + 1; y >= Math.min(min, now - 5); y--) out.push(y);
    return out;
  }, [s.txs]);
}

/** Month calendar with quick month/year jump (tap the title). */
export function Calendar({ value, onPick, range }: { value?: string; onPick: (d: string) => void; range?: { start: string; end: string } }) {
  const s = useStore();
  const { locale } = useT();
  const years = useYears();
  const init = parseIso(value ?? today());
  const [ym, setYm] = useState({ y: init.getFullYear(), m: init.getMonth() });
  const [mode, setMode] = useState<'days' | 'months'>('days');
  const ws = s.settings.weekStart;
  const first = new Date(ym.y, ym.m, 1);
  const offset = (first.getDay() - ws + 7) % 7;
  const start = addDays(iso(first), -offset);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const wd = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + ws + i).toLocaleDateString(locale, { weekday: 'narrow' }));
  const names = monthNames(locale);
  const move = (d: number) => { const n = new Date(ym.y, ym.m + d, 1); setYm({ y: n.getFullYear(), m: n.getMonth() }); };
  const now = today();
  return (
    <div>
      <div className="cal-head">
        <button className="arrow" onClick={() => (mode === 'days' ? move(-1) : setYm({ ...ym, y: ym.y - 1 }))} aria-label="prev"><PiCaretLeftBold /></button>
        <button className="lbl-btn" onClick={() => setMode(mode === 'days' ? 'months' : 'days')}>
          {mode === 'days' ? monthLabel(`${ym.y}-${pad(ym.m + 1)}`, locale) : ym.y} <PiCaretDownBold />
        </button>
        <button className="arrow" onClick={() => (mode === 'days' ? move(1) : setYm({ ...ym, y: ym.y + 1 }))} aria-label="next"><PiCaretRightBold /></button>
      </div>
      {mode === 'days' ? (
        <div className="cal">
          {wd.map((w, i) => <div key={i} className="wd">{w}</div>)}
          {cells.map((d) => {
            const cls = [d.slice(0, 7) !== `${ym.y}-${pad(ym.m + 1)}` ? 'out' : '', d === now ? 'today' : '', d === value ? 'on' : '', range && d >= range.start && d <= range.end && d !== value ? 'in' : ''].join(' ');
            return <button key={d} className={cls} onClick={() => onPick(d)}>{Number(d.slice(8))}</button>;
          })}
        </div>
      ) : (
        <>
          <div className="pills" style={{ marginBottom: 10 }}>
            {years.map((y) => <button key={y} className={'pill text' + (y === ym.y ? ' on' : '')} onClick={() => setYm({ ...ym, y })}>{y}</button>)}
          </div>
          <div className="mgrid">
            {names.map((n, i) => (
              <button key={i} className={i === ym.m ? 'on' : ''} onClick={() => { setYm({ ...ym, m: i }); setMode('days'); }}>{n}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function pickDate(initial: string, title: string): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    openOverlay((close) => (
      <DateSheet
        initial={initial}
        title={title}
        onDone={(v) => { if (done) return; done = true; resolve(v); close(); }}
      />
    ));
  });
}

function DateSheet({ initial, title, onDone }: { initial: string; title: string; onDone: (v: string | null) => void }) {
  const { t } = useT();
  return (
    <Sheet title={title} onClose={() => onDone(null)}>
      <div className="sheet-b">
        <div className="pills" style={{ marginBottom: 12 }}>
          <button className="pill text" onClick={() => onDone(addDays(today(), -1))}>{t('yesterday')}</button>
          <button className="pill text" onClick={() => onDone(today())}>{t('today')}</button>
          <button className="pill text" onClick={() => onDone(addDays(today(), 1))}>{t('tomorrow')}</button>
        </div>
        <div className="paper"><Calendar value={initial} onPick={(d) => onDone(d)} /></div>
      </div>
    </Sheet>
  );
}

// ---------------- period control ----------------
export function PeriodControl({ period, setPeriod, grans = ['day', 'week', 'month', 'year', 'custom'] }: { period: Period; setPeriod: (p: Period) => void; grans?: Gran[] }) {
  const s = useStore();
  const { t, locale } = useT();
  const ws = s.settings.weekStart;
  const labels: Record<Gran, string> = { day: t('day'), week: t('week'), month: t('month'), year: t('year'), custom: t('period') };
  const open = (gran: Gran) => openOverlay((close) => <PeriodSheet gran={gran} period={period} onApply={(p) => { setPeriod(p); close(); }} />);
  const pick = (g: Gran) => {
    if (g === 'custom') return open('custom');
    setPeriod(periodOf(g, inPeriod(today(), period) ? today() : period.start, ws));
  };
  return (
    <>
      <div className="gran">
        {grans.map((g) => <button key={g} className={period.gran === g ? 'on' : ''} onClick={() => pick(g)}>{labels[g]}</button>)}
      </div>
      <PeriodNav label={periodText(period, locale)} onPrev={() => setPeriod(shiftPeriod(period, -1, ws))} onNext={() => setPeriod(shiftPeriod(period, 1, ws))} onLabel={() => open(period.gran)} />
    </>
  );
}

export function periodText(p: Period, locale: string) {
  if (p.gran === 'month') return monthLabel(p.start.slice(0, 7), locale);
  if (p.gran === 'year') return p.start.slice(0, 4);
  if (p.gran === 'day') return parseIso(p.start).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const sameYear = p.start.slice(0, 4) === p.end.slice(0, 4);
  return `${shortDate(p.start, locale)}${sameYear ? '' : ' ' + p.start.slice(0, 4)} – ${shortDate(p.end, locale)} ${p.end.slice(0, 4)}`;
}

function PeriodSheet({ gran, period, onApply }: { gran: Gran; period: Period; onApply: (p: Period) => void }) {
  const s = useStore();
  const { t, locale } = useT();
  const years = useYears();
  const ws = s.settings.weekStart;
  const [y, setY] = useState(Number(period.start.slice(0, 4)));
  const [a, setA] = useState(period.start);
  const [b, setB] = useState(period.end);
  const [editing, setEditing] = useState<'a' | 'b' | null>(null);
  const names = monthNames(locale);
  const now = today();
  const curM = now.slice(0, 7);

  if (gran === 'day' || gran === 'week') {
    return (
      <Sheet title={gran === 'day' ? t('day') : t('week')}>
        <div className="sheet-b">
          <div className="paper">
            <Calendar value={period.start} range={gran === 'week' ? period : undefined} onPick={(d) => onApply(periodOf(gran, d, ws))} />
          </div>
        </div>
      </Sheet>
    );
  }
  if (gran === 'month') {
    return (
      <Sheet title={t('month')}>
        <div className="sheet-b">
          <div className="pills" style={{ marginBottom: 12 }}>
            {years.map((yy) => <button key={yy} className={'pill text' + (yy === y ? ' on' : '')} onClick={() => setY(yy)}>{yy}</button>)}
          </div>
          <div className="mgrid">
            {names.map((n, i) => {
              const key = `${y}-${pad(i + 1)}`;
              return <button key={i} className={(period.start.slice(0, 7) === key ? 'on ' : '') + (key === curM ? 'cur' : '')} onClick={() => onApply(periodOf('month', key + '-01'))}>{n}</button>;
            })}
          </div>
        </div>
      </Sheet>
    );
  }
  if (gran === 'year') {
    return (
      <Sheet title={t('year')}>
        <div className="sheet-b">
          <div className="mgrid">
            {years.map((yy) => <button key={yy} className={(period.start.slice(0, 4) === String(yy) ? 'on ' : '') + (String(yy) === now.slice(0, 4) ? 'cur' : '')} onClick={() => onApply(periodOf('year', `${yy}-01-01`))}>{yy}</button>)}
          </div>
        </div>
      </Sheet>
    );
  }
  // custom range
  const d = parseIso(now);
  const presets: [string, Period][] = [
    [t('thisMonth'), periodOf('month', now)],
    [t('lastMonth'), periodOf('month', iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)))],
    [t('last3m'), { gran: 'custom', start: iso(new Date(d.getFullYear(), d.getMonth() - 2, 1)), end: periodOf('month', now).end }],
    [t('last12m'), { gran: 'custom', start: iso(new Date(d.getFullYear(), d.getMonth() - 11, 1)), end: periodOf('month', now).end }],
    [t('thisYear'), periodOf('year', now)],
    [t('lastYear'), periodOf('year', `${d.getFullYear() - 1}-01-01`)],
    [t('allTime'), { gran: 'custom', start: `${years[years.length - 1]}-01-01`, end: `${years[0]}-12-31` }],
  ];
  return (
    <Sheet title={t('period')} footer={<button className="btn primary" onClick={() => onApply({ gran: 'custom', start: a <= b ? a : b, end: a <= b ? b : a })}>{t('apply')}</button>}>
      <div className="sheet-b">
        <div className="pills" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {presets.map(([l, p]) => <button key={l} className="pill text" onClick={() => onApply(p)}>{l}</button>)}
        </div>
        <div className="row" style={{ gap: 10, marginBottom: 10 }}>
          <button className="field grow" style={{ textAlign: 'left', outline: editing === 'a' ? '2px solid var(--brand)' : 'none', marginBottom: 0 }} onClick={() => setEditing('a')}>
            <span>{t('from')}</span><b className="row" style={{ gap: 6 }}><PiCalendarBlankBold /> {parseIso(a).toLocaleDateString(locale, { dateStyle: 'medium' })}</b>
          </button>
          <button className="field grow" style={{ textAlign: 'left', outline: editing === 'b' ? '2px solid var(--brand)' : 'none', marginBottom: 0 }} onClick={() => setEditing('b')}>
            <span>{t('to')}</span><b className="row" style={{ gap: 6 }}><PiCalendarBlankBold /> {parseIso(b).toLocaleDateString(locale, { dateStyle: 'medium' })}</b>
          </button>
        </div>
        {editing && (
          <div className="paper">
            <Calendar key={editing} value={editing === 'a' ? a : b} range={{ start: a, end: b }} onPick={(v) => { if (editing === 'a') { setA(v); setEditing('b'); } else { setB(v); setEditing(null); } }} />
          </div>
        )}
      </div>
    </Sheet>
  );
}
