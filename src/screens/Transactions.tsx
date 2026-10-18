import { useMemo, useState } from 'react';
import { PiArrowLeftBold, PiMagnifyingGlassBold, PiArrowRightBold, PiFunnelBold, PiXBold } from 'react-icons/pi';
import type { Tx, Transfer } from '../lib/types';
import { useStore } from '../lib/store';
import { useT } from '../i18n';
import { Gran, Period, periodOf, shiftPeriod, today, inPeriod } from '../lib/calc';
import { dayLabel, money, monthLabel, shortDate } from '../lib/format';
import { Bubble, Money, Seg, PeriodNav, Empty, Sheet } from '../components/ui';
import { navigate, openOverlay, useRoute } from '../lib/nav';
import { openTxEditor } from '../components/TxEditor';

export function TxRow({ tx, showDate }: { tx: Tx; showDate?: boolean }) {
  const s = useStore();
  const { locale } = useT();
  const cat = s.categories.find((c) => c.id === tx.categoryId);
  const acc = s.accounts.find((a) => a.id === tx.accountId);
  const cur = acc?.currency ?? s.settings.baseCurrency;
  const foreign = cur !== s.settings.baseCurrency;
  return (
    <button className="item" onClick={() => openTxEditor({ tx })}>
      <Bubble icon={cat?.icon ?? 'question'} color={cat?.color ?? '#999'} size={46} />
      <div className="grow">
        <div className="t ellipsis">{tx.note || cat?.name || '—'}</div>
        <div className="s ellipsis">
          {tx.note ? cat?.name : ''}{tx.note ? ' · ' : ''}{acc?.name}{showDate ? ' · ' + shortDate(tx.date, locale) : ''}
          {tx.tags.length ? ' · #' + tx.tags.join(' #') : ''}
        </div>
      </div>
      <div className="right">
        <div className={'amt ' + (tx.kind === 'income' ? 'pos' : 'neg')}>
          {tx.kind === 'income' ? '+' : '−'}{s.settings.hideBalance ? '••••' : money(foreign ? tx.base : tx.amount, s.settings.baseCurrency, locale)}
        </div>
        {foreign && !s.settings.hideBalance && <div className="amt2">{money(tx.amount, cur, locale)}</div>}
      </div>
    </button>
  );
}

export function TransferRow({ tr }: { tr: Transfer }) {
  const s = useStore();
  const { locale } = useT();
  const from = s.accounts.find((a) => a.id === tr.from);
  const to = s.accounts.find((a) => a.id === tr.to);
  const hide = s.settings.hideBalance;
  return (
    <button className="item" onClick={() => openTxEditor({ transfer: tr })}>
      <div style={{ position: 'relative', width: 46, height: 46, flex: 'none' }}>
        <div style={{ position: 'absolute', left: 0, top: 0 }}><Bubble icon={from?.icon ?? 'wallet'} color={from?.color ?? '#999'} size={32} round /></div>
        <div style={{ position: 'absolute', right: 0, bottom: 0, border: '2px solid var(--card)', borderRadius: '50%' }}><Bubble icon={to?.icon ?? 'wallet'} color={to?.color ?? '#999'} size={30} round /></div>
      </div>
      <div className="grow">
        <div className="t ellipsis row" style={{ gap: 6 }}>{from?.name} <PiArrowRightBold size={13} /> {to?.name}</div>
        <div className="s ellipsis">{tr.note || shortDate(tr.date, locale)}</div>
      </div>
      <div className="right">
        <div className="amt" style={{ color: 'var(--blue)' }}>{hide ? '••••' : money(tr.fromAmount, from?.currency ?? 'BRL', locale)}</div>
        {from?.currency !== to?.currency && !hide && <div className="amt2">{money(tr.toAmount, to?.currency ?? 'BRL', locale)}</div>}
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
  return (
    <Seg<Gran>
      small
      value={period.gran}
      onChange={pick}
      options={[
        { v: 'day', label: t('day') },
        { v: 'week', label: t('week') },
        { v: 'month', label: t('month') },
        { v: 'year', label: t('year') },
        { v: 'custom', label: t('period') },
      ]}
    />
  );
}

function CustomRange({ initial, onApply }: { initial: Period; onApply: (p: Period) => void }) {
  const { t } = useT();
  const [a, setA] = useState(initial.start);
  const [b, setB] = useState(initial.end);
  return (
    <Sheet title={t('period')} footer={<button className="btn grad" onClick={() => onApply({ gran: 'custom', start: a <= b ? a : b, end: a <= b ? b : a })}>{t('apply')}</button>}>
      <div className="sheet-b">
        <label className="field"><span>{t('from')}</span><input type="date" value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label className="field"><span>{t('to')}</span><input type="date" value={b} onChange={(e) => setB(e.target.value)} /></label>
      </div>
    </Sheet>
  );
}

export function Transactions() {
  const s = useStore();
  const { t, locale } = useT();
  const r = useRoute();
  const q0 = r.query;
  const [kind, setKind] = useState<KindF>((q0.get('kind') as KindF) || 'all');
  const [accId, setAccId] = useState(q0.get('acc') || '');
  const [catId, setCatId] = useState(q0.get('cat') || '');
  const [period, setPeriod] = useState<Period>(() => {
    const st = q0.get('start'), en = q0.get('end'), g = (q0.get('gran') as Gran) || 'month';
    if (st && en) return { gran: g, start: st, end: en };
    return periodOf(g, today(), s.settings.weekStart);
  });
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);

  const cat = s.categories.find((c) => c.id === catId);
  const acc = s.accounts.find((a) => a.id === accId);

  const { groups, inc, exp } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const catName = new Map(s.categories.map((c) => [c.id, c.name.toLowerCase()]));
    const useAll = !!needle; // search across all time
    const txs = kind === 'transfer' ? [] : s.txs.filter((x) =>
      (useAll || inPeriod(x.date, period)) && (kind === 'all' || x.kind === kind) && (!accId || x.accountId === accId) && (!catId || x.categoryId === catId) &&
      (!needle || x.note.toLowerCase().includes(needle) || x.tags.some((g) => g.toLowerCase().includes(needle)) || (catName.get(x.categoryId) ?? '').includes(needle)));
    const trs = (kind === 'transfer' || kind === 'all') && !catId ? s.transfers.filter((x) =>
      (useAll || inPeriod(x.date, period)) && (!accId || x.from === accId || x.to === accId) && (!needle || x.note.toLowerCase().includes(needle))) : [];
    const items: ({ k: 't'; d: string; x: Tx } | { k: 'r'; d: string; x: Transfer })[] = [
      ...txs.map((x) => ({ k: 't' as const, d: x.date, x })),
      ...trs.map((x) => ({ k: 'r' as const, d: x.date, x })),
    ].sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
    const map = new Map<string, typeof items>();
    for (const it of items) {
      if (!map.has(it.d)) map.set(it.d, []);
      map.get(it.d)!.push(it);
    }
    const inc = txs.filter((x) => x.kind === 'income').reduce((a, x) => a + x.base, 0);
    const exp = txs.filter((x) => x.kind === 'expense').reduce((a, x) => a + x.base, 0);
    return { groups: [...map.entries()], inc, exp };
  }, [s.txs, s.transfers, s.categories, kind, accId, catId, period, q]);

  const isFuture = period.end >= today();

  return (
    <>
      <div className="topbar">
        <button className="round-btn" onClick={() => history.back()} aria-label="back"><PiArrowLeftBold /></button>
        <h1 style={{ fontSize: 22 }}>{acc ? acc.name : t('transactions')}</h1>
        <button className="round-btn" onClick={() => setSearching(!searching)} aria-label="search"><PiMagnifyingGlassBold /></button>
      </div>

      {searching && (
        <div className="search">
          <PiMagnifyingGlassBold />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchHint')} />
          {q && <button onClick={() => setQ('')}><PiXBold /></button>}
        </div>
      )}

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

      <div className="pills" style={{ margin: '12px 0 4px' }}>
        <button className={'pill' + (!accId ? ' on' : '')} onClick={() => setAccId('')}><PiFunnelBold /> {t('all')}</button>
        {s.accounts.filter((a) => !a.archived || a.id === accId).sort((a, b) => a.order - b.order).map((a) => (
          <button key={a.id} className={'pill' + (accId === a.id ? ' on' : '')} onClick={() => setAccId(a.id)}>
            <Bubble icon={a.icon} color={a.color} size={22} round /> {a.name}
          </button>
        ))}
      </div>
      {cat && (
        <div className="pills" style={{ margin: '8px 0' }}>
          <button className="pill on" onClick={() => setCatId('')}><Bubble icon={cat.icon} color={cat.color} size={22} round /> {cat.name} <PiXBold /></button>
        </div>
      )}

      {!q && (
        <div className="card" style={{ padding: 14, marginTop: 10 }}>
          <GranPicker period={period} setPeriod={setPeriod} />
          <PeriodNav label={periodLabel(period, locale)} onPrev={() => setPeriod(shiftPeriod(period, -1, s.settings.weekStart))} onNext={() => setPeriod(shiftPeriod(period, 1, s.settings.weekStart))} nextDisabled={isFuture} />
          <div className="stat-row" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 10 }}>
            <div className="stat"><span>{t('income')}</span><b className="pos"><Money cents={inc} compact /></b></div>
            <div className="stat"><span>{t('expenses')}</span><b><Money cents={exp} compact /></b></div>
            <div className="stat"><span>{t('net')}</span><b className={inc - exp >= 0 ? 'pos' : ''} style={inc - exp < 0 ? { color: 'var(--red)' } : undefined}><Money cents={inc - exp} compact sign /></b></div>
          </div>
        </div>
      )}

      {groups.length === 0 && <Empty title={t('noData')} hint={t('noDataHint')} />}
      {groups.map(([day, items]) => {
        const dayExp = items.reduce((a, it) => a + (it.k === 't' && it.x.kind === 'expense' ? it.x.base : 0), 0);
        return (
          <div key={day}>
            <div className="day-h">
              <span>{dayLabel(day, locale, t)}</span>
              {dayExp > 0 && <span>−<Money cents={dayExp} /></span>}
            </div>
            <div className="card tight" style={{ marginBottom: 8 }}>
              {items.map((it) => (it.k === 't' ? <TxRow key={it.x.id} tx={it.x} /> : <TransferRow key={it.x.id} tr={it.x} />))}
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
