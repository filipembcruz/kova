import { useMemo, useState } from 'react';
import { PiArrowLeftBold, PiMagnifyingGlassBold, PiArrowRightBold, PiXBold, PiSlidersHorizontalBold, PiSortDescendingBold, PiCalendarBlankBold, PiCheckBold, PiArrowsClockwiseBold } from 'react-icons/pi';
import type { Tx, Transfer } from '../lib/types';
import { useStore } from '../lib/store';
import { useT } from '../i18n';
import { Gran, Period, periodOf, shiftPeriod, today, inPeriod, fold } from '../lib/calc';
import { dayLabel, money, monthLabel, shortDate } from '../lib/format';
import { Bubble, Seg, PeriodNav, Empty, Sheet } from '../components/ui';
import { navigate, openOverlay, useRoute } from '../lib/nav';
import { openTxEditor } from '../components/TxEditor';

export function TxRow({ tx, showDate }: { tx: Tx; showDate?: boolean }) {
  const s = useStore();
  const { t, locale } = useT();
  const cat = s.categories.find((c) => c.id === tx.categoryId);
  const acc = s.accounts.find((a) => a.id === tx.accountId);
  const cur = acc?.currency ?? s.settings.baseCurrency;
  const foreign = cur !== s.settings.baseCurrency;
  const planned = tx.date > today();
  return (
    <button className={'item' + (planned ? ' planned' : '')} onClick={() => openTxEditor({ tx })}>
      <Bubble icon={cat?.icon ?? 'question'} color={cat?.color ?? '#999'} size={44} />
      <div className="grow">
        <div className="t">{cat?.name ?? '—'}</div>
        <div className="s">
          {planned && <span className="tag plan" style={{ marginRight: 6 }}>{t('planned')}</span>}
          {tx.repeat && <PiArrowsClockwiseBold size={11} style={{ marginRight: 4 }} />}
          {acc?.name}{showDate ? ' · ' + shortDate(tx.date, locale) : ''}
        </div>
        {(tx.note || tx.tags.length > 0) && (
          <div className="s" style={{ color: 'var(--ink2)' }}>
            {tx.note}{tx.tags.length ? (tx.note ? '  ' : '') + tx.tags.map((g) => '#' + g).join(' ') : ''}
          </div>
        )}
      </div>
      <div className="right">
        <div className={'amt ' + (tx.kind === 'income' ? 'pos' : 'neg')}>
          {tx.kind === 'income' ? '+' : '−'}{money(foreign ? tx.base : tx.amount, s.settings.baseCurrency, locale)}
        </div>
        {foreign && <div className="amt2">{money(tx.amount, cur, locale)}</div>}
      </div>
    </button>
  );
}

export function TransferRow({ tr }: { tr: Transfer }) {
  const s = useStore();
  const { t, locale } = useT();
  const from = s.accounts.find((a) => a.id === tr.from);
  const to = s.accounts.find((a) => a.id === tr.to);
  const planned = tr.date > today();
  return (
    <button className={'item' + (planned ? ' planned' : '')} onClick={() => openTxEditor({ transfer: tr })}>
      <div style={{ position: 'relative', width: 44, height: 44, flex: 'none' }}>
        <div style={{ position: 'absolute', left: 0, top: 0 }}><Bubble icon={from?.icon ?? 'wallet'} color={from?.color ?? '#999'} size={30} /></div>
        <div style={{ position: 'absolute', right: 0, bottom: 0, border: '2px solid var(--paper)', borderRadius: '50%' }}><Bubble icon={to?.icon ?? 'wallet'} color={to?.color ?? '#999'} size={28} /></div>
      </div>
      <div className="grow">
        <div className="t row" style={{ gap: 6, flexWrap: 'wrap' }}>{from?.name} <PiArrowRightBold size={13} /> {to?.name}</div>
        <div className="s">{planned && <span className="tag plan" style={{ marginRight: 6 }}>{t('planned')}</span>}{tr.note || t('transfer')}</div>
      </div>
      <div className="right">
        <div className="amt" style={{ color: 'var(--xfer)' }}>{money(tr.fromAmount, from?.currency ?? 'BRL', locale)}</div>
        {from?.currency !== to?.currency && <div className="amt2">{money(tr.toAmount, to?.currency ?? 'BRL', locale)}</div>}
      </div>
    </button>
  );
}

type KindF = 'expense' | 'income' | 'transfer' | 'all';

export function periodLabel(p: Period, locale: string) {
  if (p.gran === 'month') return monthLabel(p.start.slice(0, 7), locale);
  if (p.gran === 'year') return p.start.slice(0, 4);
  if (p.gran === 'day') return new Date(p.start + 'T12:00').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  return `${shortDate(p.start, locale)} – ${shortDate(p.end, locale)}${p.start.slice(0, 4) !== today().slice(0, 4) ? ' ' + p.start.slice(0, 4) : ''}`;
}

export function GranPicker({ period, setPeriod }: { period: Period; setPeriod: (p: Period) => void }) {
  const s = useStore();
  const { t } = useT();
  const pick = (g: Gran) => {
    if (g === 'custom') {
      openOverlay((close) => <CustomRange initial={period} onApply={(p) => { setPeriod(p); close(); }} />);
      return;
    }
    setPeriod(periodOf(g, inPeriod(today(), period) ? today() : period.start, s.settings.weekStart));
  };
  const opts: { v: Gran; label: string }[] = [
    { v: 'day', label: t('day') },
    { v: 'week', label: t('week') },
    { v: 'month', label: t('month') },
    { v: 'year', label: t('year') },
    { v: 'custom', label: t('period') },
  ];
  return (
    <div className="gran">
      {opts.map((o) => (
        <button key={o.v} className={period.gran === o.v ? 'on' : ''} onClick={() => pick(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

function CustomRange({ initial, onApply }: { initial: Period; onApply: (p: Period) => void }) {
  const { t } = useT();
  const [a, setA] = useState(initial.start);
  const [b, setB] = useState(initial.end);
  return (
    <Sheet title={t('period')} footer={<button className="btn primary" onClick={() => onApply({ gran: 'custom', start: a <= b ? a : b, end: a <= b ? b : a })}>{t('apply')}</button>}>
      <div className="sheet-b">
        <label className="field"><span>{t('from')}</span><input type="date" value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label className="field"><span>{t('to')}</span><input type="date" value={b} onChange={(e) => setB(e.target.value)} /></label>
      </div>
    </Sheet>
  );
}

function CategoryFilter({ initial, onApply }: { initial: string[]; onApply: (ids: string[]) => void }) {
  const s = useStore();
  const { t } = useT();
  const [sel, setSel] = useState<string[]>(initial);
  const [q, setQ] = useState('');
  const cats = s.categories.filter((c) => !q || fold(c.name).includes(fold(q))).sort((a, b) => (a.kind === b.kind ? a.order - b.order : a.kind === 'expense' ? -1 : 1));
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <Sheet
      title={t('categories')}
      footer={
        <>
          <button className="btn ghost" onClick={() => setSel([])}>{t('clear')}</button>
          <button className="btn primary" onClick={() => onApply(sel)}>{t('apply')}</button>
        </>
      }
    >
      <div className="sheet-b">
        <div className="search"><PiMagnifyingGlassBold /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} /></div>
        <div className="paper flush">
          {cats.map((c) => (
            <button key={c.id} className="item" onClick={() => toggle(c.id)}>
              <span className={'check' + (sel.includes(c.id) ? ' on' : '')}>{sel.includes(c.id) && <PiCheckBold />}</span>
              <Bubble icon={c.icon} color={c.color} size={36} />
              <span className="t grow">{c.name}</span>
              <span className="small muted">{c.kind === 'income' ? t('income') : t('expense')}</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** Text that a transaction can be found by: category, account, note, tags and amounts in several formats. */
function haystack(x: Tx, catName: string, accName: string) {
  const a = (x.amount / 100).toFixed(2), b = (x.base / 100).toFixed(2);
  return fold([catName, accName, x.note, x.tags.join(' '), a, a.replace('.', ','), b, b.replace('.', ',')].join(' | '));
}

export function Transactions() {
  const s = useStore();
  const { t, locale } = useT();
  const r = useRoute();
  const q0 = r.query;
  const [kind, setKind] = useState<KindF>((q0.get('kind') as KindF) || 'all');
  const [accId, setAccId] = useState(q0.get('acc') || '');
  const [cats, setCats] = useState<string[]>(q0.get('cat') ? [q0.get('cat')!] : []);
  const [period, setPeriod] = useState<Period>(() => {
    const st = q0.get('start'), en = q0.get('end'), g = (q0.get('gran') as Gran) || 'month';
    if (st && en) return { gran: g, start: st, end: en };
    return periodOf(g, today(), s.settings.weekStart);
  });
  const [allTime, setAllTime] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'date' | 'value'>('date');
  const base = s.settings.baseCurrency;

  const acc = s.accounts.find((a) => a.id === accId);

  const data = useMemo(() => {
    const terms = fold(q.trim()).split(/\s+/).filter(Boolean);
    const catName = new Map(s.categories.map((c) => [c.id, c.name]));
    const accName = new Map(s.accounts.map((a) => [a.id, a.name]));
    const inP = (d: string) => allTime || inPeriod(d, period);
    const txs = kind === 'transfer' ? [] : s.txs.filter((x) => {
      if (!inP(x.date) || (kind !== 'all' && x.kind !== kind) || (accId && x.accountId !== accId) || (cats.length && !cats.includes(x.categoryId))) return false;
      if (!terms.length) return true;
      const h = haystack(x, catName.get(x.categoryId) ?? '', accName.get(x.accountId) ?? '');
      return terms.every((w) => h.includes(w));
    });
    const trs = (kind === 'transfer' || kind === 'all') && !cats.length ? s.transfers.filter((x) => {
      if (!inP(x.date) || (accId && x.from !== accId && x.to !== accId)) return false;
      if (!terms.length) return true;
      const h = fold([x.note, accName.get(x.from), accName.get(x.to), (x.fromAmount / 100).toFixed(2).replace('.', ',')].join(' '));
      return terms.every((w) => h.includes(w));
    }) : [];
    const inc = txs.filter((x) => x.kind === 'income').reduce((a, x) => a + x.base, 0);
    const exp = txs.filter((x) => x.kind === 'expense').reduce((a, x) => a + x.base, 0);
    type It = { k: 't'; d: string; v: number; x: Tx } | { k: 'r'; d: string; v: number; x: Transfer };
    const items: It[] = [...txs.map((x) => ({ k: 't' as const, d: x.date, v: x.base, x })), ...trs.map((x) => ({ k: 'r' as const, d: x.date, v: x.fromAmount, x }))];
    if (sort === 'value') {
      items.sort((a, b) => b.v - a.v);
      return { groups: [['', items]] as [string, It[]][], inc, exp, count: items.length };
    }
    items.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
    const map = new Map<string, It[]>();
    for (const it of items) {
      if (!map.has(it.d)) map.set(it.d, []);
      map.get(it.d)!.push(it);
    }
    return { groups: [...map.entries()], inc, exp, count: items.length };
  }, [s.txs, s.transfers, s.categories, s.accounts, kind, accId, cats, period, q, allTime, sort]);

  const net = data.inc - data.exp;
  const filterLabel = cats.length === 1 ? s.categories.find((c) => c.id === cats[0])?.name ?? t('filters') : cats.length > 1 ? t('nCategories', { n: String(cats.length) }) : t('filters');

  return (
    <>
      <div className="topbar">
        <button className="icon-btn" onClick={() => history.back()} aria-label="back"><PiArrowLeftBold /></button>
        <h1 style={{ fontSize: 22 }}>{acc ? acc.name : t('transactions')}</h1>
      </div>

      <div className="search">
        <PiMagnifyingGlassBold />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchHint')} enterKeyHint="search" />
        {q && <button onClick={() => setQ('')} aria-label="clear"><PiXBold /></button>}
      </div>

      <Seg<KindF>
        color
        value={kind}
        onChange={setKind}
        options={[
          { v: 'all', label: t('all') },
          { v: 'expense', label: t('expenses'), cls: 'expense' },
          { v: 'income', label: t('income'), cls: 'income' },
          { v: 'transfer', label: t('transfers'), cls: 'transfer' },
        ]}
      />

      <div className="pills" style={{ margin: '10px 0 0' }}>
        <button className={'pill text' + (cats.length ? ' on' : '')} onClick={() => openOverlay((close) => <CategoryFilter initial={cats} onApply={(ids) => { setCats(ids); close(); }} />)}>
          <PiSlidersHorizontalBold /> {filterLabel}
        </button>
        <button className="pill text" onClick={() => setSort(sort === 'date' ? 'value' : 'date')}>
          {sort === 'date' ? <PiCalendarBlankBold /> : <PiSortDescendingBold />} {sort === 'date' ? t('sortDate') : t('sortValue')}
        </button>
        <button className={'pill text' + (allTime ? ' on' : '')} onClick={() => setAllTime(!allTime)}>{t('allTime')}</button>
        <button className={'pill text' + (!accId ? ' on' : '')} onClick={() => setAccId('')}>{t('total')}</button>
        {s.accounts.filter((a) => !a.archived || a.id === accId).sort((a, b) => a.order - b.order).map((a) => (
          <button key={a.id} className={'pill' + (accId === a.id ? ' on' : '')} onClick={() => setAccId(a.id)}>
            <Bubble icon={a.icon} color={a.color} size={22} /> {a.name}
          </button>
        ))}
      </div>

      {!allTime && (
        <div className="paper" style={{ marginTop: 12, padding: '12px 12px 6px' }}>
          <GranPicker period={period} setPeriod={setPeriod} />
          <PeriodNav label={periodLabel(period, locale)} onPrev={() => setPeriod(shiftPeriod(period, -1, s.settings.weekStart))} onNext={() => setPeriod(shiftPeriod(period, 1, s.settings.weekStart))} />
        </div>
      )}

      <div className="paper flush" style={{ marginTop: allTime ? 12 : 0 }}>
        <div className="stats" style={{ padding: '4px 8px' }}>
          {kind !== 'income' && kind !== 'transfer' && <div className="st"><span>{t('expenses')}</span><b>{money(data.exp, base, locale)}</b></div>}
          {kind !== 'expense' && kind !== 'transfer' && <div className="st"><span>{t('income')}</span><b className="pos">{money(data.inc, base, locale)}</b></div>}
          {kind === 'all' && <div className="st"><span>{t('net')}</span><b style={{ color: net < 0 ? 'var(--exp)' : 'var(--inc)' }}>{money(net, base, locale, { sign: true })}</b></div>}
          <div className="st"><span>{t('results')}</span><b>{data.count}</b></div>
        </div>
      </div>

      {data.count === 0 && <Empty icon="sparkle" title={t('noData')} />}
      {data.groups.map(([day, items]) => {
        const dayExp = items.reduce((a, it) => a + (it.k === 't' && it.x.kind === 'expense' ? it.x.base : 0), 0);
        return (
          <div key={day || 'sorted'}>
            {day && (
              <div className="day-h">
                <span>{dayLabel(day, locale, t)}</span>
                {dayExp > 0 && <span className="num">−{money(dayExp, base, locale)}</span>}
              </div>
            )}
            <div className="paper flush" style={{ marginBottom: 6, marginTop: day ? 0 : 12 }}>
              {items.map((it) => (it.k === 't' ? <TxRow key={it.x.id} tx={it.x} showDate={!day} /> : <TransferRow key={it.x.id} tr={it.x} />))}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function goTx(params: Record<string, string>) {
  navigate('/tx?' + new URLSearchParams(params).toString());
}
