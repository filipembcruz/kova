import { useMemo, useState } from 'react';
import { PiArrowLeftBold, PiMagnifyingGlassBold, PiArrowRightBold, PiXBold, PiSlidersHorizontalBold, PiCheckBold, PiArrowsClockwiseBold, PiPaperclipBold, PiListBulletsBold, PiChartPieSliceBold, PiPencilSimpleBold } from 'react-icons/pi';
import type { Kind, Tx, Transfer } from '../lib/types';
import { useStore } from '../lib/store';
import { useT } from '../i18n';
import { Gran, Period, periodOf, today, inPeriod, fold, isPlanned } from '../lib/calc';
import { dayLabel, money, shortDate } from '../lib/format';
import { Bubble, Seg, Empty, Sheet } from '../components/ui';
import { Donut } from '../components/charts';
import { PeriodControl, periodText } from '../components/Pickers';
import { navigate, openOverlay, useRoute } from '../lib/nav';
import { openTxEditor } from '../components/TxEditor';
import { openAccountEditor } from '../components/Editors';

export { periodText as periodLabel };
export { PeriodControl as GranPicker };

export function TxRow({ tx, showDate }: { tx: Tx; showDate?: boolean }) {
  const s = useStore();
  const { t, locale } = useT();
  const cat = s.categories.find((c) => c.id === tx.categoryId);
  const acc = s.accounts.find((a) => a.id === tx.accountId);
  const cur = acc?.currency ?? s.settings.baseCurrency;
  const foreign = cur !== s.settings.baseCurrency;
  const planned = isPlanned(tx);
  return (
    <button className={'item' + (planned ? ' planned' : '')} onClick={() => openTxEditor({ tx })}>
      <Bubble icon={cat?.icon ?? 'question'} color={cat?.color ?? '#999'} size={44} />
      <div className="grow">
        <div className="t">{cat?.name ?? '—'}</div>
        <div className="s">
          {planned && <span className="tag plan" style={{ marginRight: 6 }}>{t('planned')}</span>}
          {tx.repeat && <PiArrowsClockwiseBold size={11} style={{ marginRight: 4 }} />}
          {tx.attachments?.length ? <PiPaperclipBold size={11} style={{ marginRight: 4 }} /> : null}
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
      <RoutePair fromId={tr.from} toId={tr.to} />
      <div className="grow">
        <div className="t row" style={{ gap: 6, flexWrap: 'wrap' }}>{from?.name} <PiArrowRightBold size={13} /> {to?.name}</div>
        <div className="s">{planned && <span className="tag plan" style={{ marginRight: 6 }}>{t('planned')}</span>}{tr.note || shortDate(tr.date, locale)}</div>
      </div>
      <div className="right">
        <div className="amt" style={{ color: 'var(--xfer)' }}>{money(tr.fromAmount, from?.currency ?? 'BRL', locale)}</div>
        {from?.currency !== to?.currency && <div className="amt2">{money(tr.toAmount, to?.currency ?? 'BRL', locale)}</div>}
      </div>
    </button>
  );
}

function RoutePair({ fromId, toId }: { fromId: string; toId: string }) {
  const s = useStore();
  const from = s.accounts.find((a) => a.id === fromId);
  const to = s.accounts.find((a) => a.id === toId);
  return (
    <div style={{ position: 'relative', width: 44, height: 44, flex: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0 }}><Bubble icon={from?.icon ?? 'wallet'} color={from?.color ?? '#999'} size={30} /></div>
      <div style={{ position: 'absolute', right: 0, bottom: 0, borderRadius: 10, background: 'var(--paper)', padding: 2 }}><Bubble icon={to?.icon ?? 'wallet'} color={to?.color ?? '#999'} size={26} /></div>
    </div>
  );
}

type KindF = 'expense' | 'income' | 'transfer' | 'all';
type Sort = 'date' | 'desc' | 'asc';
type View = 'list' | 'group';

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

/** Text a transaction can be found by: category, account, note, tags and amounts in several formats. */
function haystack(x: Tx, catName: string, accName: string) {
  const a = (x.amount / 100).toFixed(2), b = (x.base / 100).toFixed(2);
  return fold([catName, accName, x.note, x.tags.join(' '), a, a.replace('.', ','), b, b.replace('.', ','), x.attachments?.map((f) => f.name).join(' ') ?? ''].join(' | '));
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
  const [sort, setSort] = useState<Sort>((q0.get('sort') as Sort) || 'date');
  const [view, setView] = useState<View>((q0.get('view') as View) || 'list');
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
    const trTotal = trs.reduce((a, x) => a + x.fromAmount, 0);

    // grouped by category (per kind) and transfers by route
    const groupBy = (k: Kind) => {
      const m = new Map<string, { v: number; n: number }>();
      for (const x of txs) if (x.kind === k) { const e = m.get(x.categoryId) ?? { v: 0, n: 0 }; e.v += x.base; e.n++; m.set(x.categoryId, e); }
      const arr = [...m.entries()].map(([id, e]) => ({ id, ...e, cat: s.categories.find((c) => c.id === id) }));
      arr.sort((a, b) => (sort === 'asc' ? a.v - b.v : b.v - a.v));
      return arr;
    };
    const routes = new Map<string, { from: string; to: string; v: number; n: number; cur: string }>();
    for (const x of trs) {
      const k = x.from + '>' + x.to;
      const e = routes.get(k) ?? { from: x.from, to: x.to, v: 0, n: 0, cur: s.accounts.find((a) => a.id === x.from)?.currency ?? base };
      e.v += x.fromAmount; e.n++; routes.set(k, e);
    }
    const routeArr = [...routes.values()].sort((a, b) => (sort === 'asc' ? a.v - b.v : b.v - a.v));

    type It = { k: 't'; d: string; v: number; x: Tx } | { k: 'r'; d: string; v: number; x: Transfer };
    const items: It[] = [...txs.map((x) => ({ k: 't' as const, d: x.date, v: x.base, x })), ...trs.map((x) => ({ k: 'r' as const, d: x.date, v: x.fromAmount, x }))];
    let groups: [string, It[]][];
    if (sort !== 'date') {
      items.sort((a, b) => (sort === 'asc' ? a.v - b.v : b.v - a.v));
      groups = [['', items]];
    } else {
      items.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
      const map = new Map<string, It[]>();
      for (const it of items) { if (!map.has(it.d)) map.set(it.d, []); map.get(it.d)!.push(it); }
      groups = [...map.entries()];
    }
    return { groups, inc, exp, trTotal, count: items.length, expCats: groupBy('expense'), incCats: groupBy('income'), routes: routeArr };
  }, [s.txs, s.transfers, s.categories, s.accounts, kind, accId, cats, period, q, allTime, sort]);

  const net = data.inc - data.exp;
  const filterLabel = cats.length === 1 ? s.categories.find((c) => c.id === cats[0])?.name ?? t('filters') : cats.length > 1 ? t('nCategories', { n: String(cats.length) }) : t('filters');
  const sortLabel = sort === 'date' ? t('sortDate') : sort === 'desc' ? t('sortHigh') : t('sortLow');
  const nextSort: Record<Sort, Sort> = { date: 'desc', desc: 'asc', asc: 'date' };

  const GroupBlock = ({ title, rows, total, color }: { title: string; rows: typeof data.expCats; total: number; color: string }) => rows.length ? (
    <>
      <div className="section-title">{title} <span className="num" style={{ marginLeft: 'auto', fontSize: 16, color }}>{money(total, base, locale)}</span></div>
      <div className="paper">
        <div className="donut-wrap" style={{ width: 'min(220px, 60vw)' }}>
          <Donut data={rows.map((g) => ({ id: g.id, value: g.v, color: g.cat?.color ?? '#999' }))} />
          <div className="donut-center"><div><b className="num" style={{ fontSize: 'clamp(18px,5.6vw,24px)' }}>{money(total, base, locale)}</b><span>{rows.length} {t('categories').toLowerCase()}</span></div></div>
        </div>
        {rows.map((g) => {
          const pc = (g.v / (total || 1)) * 100;
          return (
            <button key={g.id} className="cat-row" onClick={() => { setCats([g.id]); setView('list'); }}>
              <Bubble icon={g.cat?.icon ?? 'question'} color={g.cat?.color ?? '#999'} size={42} />
              <span className="nm">{g.cat?.name ?? '—'}</span>
              <span className="v">{money(g.v, base, locale)}</span>
              <div className="meta">
                <div className="bar grow"><i style={{ width: `${Math.max(pc, 1.5)}%`, background: g.cat?.color }} /></div>
                <span className="pc">{g.n} · {pc < 1 ? '<1' : Math.round(pc)}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  ) : null;

  return (
    <>
      <div className="topbar">
        <button className="icon-btn" onClick={() => history.back()} aria-label="back"><PiArrowLeftBold /></button>
        <h1 style={{ fontSize: 24 }}>{acc ? acc.name : kind === 'income' ? t('income') : kind === 'expense' ? t('expenses') : kind === 'transfer' ? t('transfers') : t('transactions')}</h1>
        {acc && <button className="icon-btn solid" onClick={() => openAccountEditor(acc)} aria-label="edit account"><PiPencilSimpleBold /></button>}
        <button className={'icon-btn' + (view === 'group' ? ' on' : ' solid')} onClick={() => setView(view === 'list' ? 'group' : 'list')} aria-label="group">
          {view === 'list' ? <PiChartPieSliceBold /> : <PiListBulletsBold />}
        </button>
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
        <button className={'pill text' + (view === 'group' ? ' on' : '')} onClick={() => setView(view === 'list' ? 'group' : 'list')}>
          <PiChartPieSliceBold /> {kind === 'transfer' ? t('byRoute') : t('byCategory')}
        </button>
        <button className={'pill text' + (sort !== 'date' ? ' on' : '')} onClick={() => setSort(nextSort[sort])}>{sortLabel}</button>
        {kind !== 'transfer' && (
          <button className={'pill text' + (cats.length ? ' on' : '')} onClick={() => openOverlay((close) => <CategoryFilter initial={cats} onApply={(ids) => { setCats(ids); close(); }} />)}>
            <PiSlidersHorizontalBold /> {filterLabel}
          </button>
        )}
        <button className={'pill text' + (allTime ? ' on' : '')} onClick={() => setAllTime(!allTime)}>{t('allTime')}</button>
        <button className={'pill text' + (!accId ? ' on' : '')} onClick={() => setAccId('')}>{t('total')}</button>
        {s.accounts.filter((a) => !a.archived || a.id === accId).sort((a, b) => a.order - b.order).map((a) => (
          <button key={a.id} className={'pill' + (accId === a.id ? ' on' : '')} onClick={() => setAccId(a.id)}>
            <Bubble icon={a.icon} color={a.color} size={24} /> {a.name}
          </button>
        ))}
      </div>

      {!allTime && (
        <div className="paper" style={{ marginTop: 10, padding: '8px 12px 6px' }}>
          <PeriodControl period={period} setPeriod={setPeriod} />
        </div>
      )}

      <div className="paper flush" style={{ marginTop: allTime ? 10 : 0 }}>
        <div className="stats" style={{ padding: '2px 8px' }}>
          {(kind === 'all' || kind === 'income') && <div className="st"><span>{t('income')}</span><b className="pos">{money(data.inc, base, locale)}</b></div>}
          {(kind === 'all' || kind === 'expense') && <div className="st"><span>{t('expenses')}</span><b>{money(data.exp, base, locale)}</b></div>}
          {kind === 'all' && <div className="st"><span>{t('net')}</span><b style={{ color: net < 0 ? 'var(--exp)' : 'var(--inc)' }}>{money(net, base, locale, { sign: true })}</b></div>}
          {kind === 'transfer' && <div className="st"><span>{t('transfers')}</span><b style={{ color: 'var(--xfer)' }}>{money(data.trTotal, base, locale)}</b></div>}
          <div className="st"><span>{t('results')}</span><b>{data.count}</b></div>
        </div>
      </div>

      {data.count === 0 && <Empty icon="sparkle" title={t('noData')} />}

      {view === 'group' ? (
        <>
          {(kind === 'all' || kind === 'expense') && <GroupBlock title={t('expenses')} rows={data.expCats} total={data.exp} color="var(--exp)" />}
          {(kind === 'all' || kind === 'income') && <GroupBlock title={t('income')} rows={data.incCats} total={data.inc} color="var(--inc)" />}
          {(kind === 'all' || kind === 'transfer') && data.routes.length > 0 && (
            <>
              <div className="section-title">{t('byRoute')}</div>
              <div className="paper flush">
                {data.routes.map((g) => {
                  const f = s.accounts.find((a) => a.id === g.from), to = s.accounts.find((a) => a.id === g.to);
                  return (
                    <button key={g.from + g.to} className="item" onClick={() => { setAccId(g.from); setKind('transfer'); setView('list'); }}>
                      <RoutePair fromId={g.from} toId={g.to} />
                      <div className="grow">
                        <div className="t row" style={{ gap: 6, flexWrap: 'wrap' }}>{f?.name} <PiArrowRightBold size={13} /> {to?.name}</div>
                        <div className="s">{g.n} {g.n === 1 ? t('transfer').toLowerCase() : t('transfers').toLowerCase()}</div>
                      </div>
                      <div className="amt" style={{ color: 'var(--xfer)' }}>{money(g.v, g.cur, locale)}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        data.groups.map(([day, items]) => {
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
        })
      )}
    </>
  );
}

export function goTx(params: Record<string, string>) {
  navigate('/tx?' + new URLSearchParams(params).toString());
}
