import { useMemo, useState } from 'react';
import { PiEyeBold, PiEyeSlashBold, PiCaretDownBold, PiCheckBold, PiArrowsClockwiseBold, PiSquaresFourBold, PiChartLineUpBold, PiArrowDownLeftBold, PiArrowUpRightBold, PiPiggyBankBold } from 'react-icons/pi';
import type { Kind, Tx } from '../lib/types';
import { setState, useBalances, useStore } from '../lib/store';
import { useT } from '../i18n';
import { addDays, byCategory, filterTx, parseIso, Period, periodOf, shiftPeriod, sum, today, toBase, pad } from '../lib/calc';
import { money, shortDate } from '../lib/format';
import { Bubble, Empty, PeriodNav, Sheet } from '../components/ui';
import { Donut, PaceChart } from '../components/charts';
import { navigate, openOverlay, toast } from '../lib/nav';
import { openTxEditor } from '../components/TxEditor';
import { GranPicker, goTx, periodLabel } from './Transactions';

export function Home() {
  const s = useStore();
  const { t, locale } = useT();
  const { bal, total } = useBalances();
  const base = s.settings.baseCurrency;
  const hide = s.settings.hideBalance;
  const [accId, setAccId] = useState('');
  const [kind, setKind] = useState<Kind>('expense');
  const [period, setPeriod] = useState<Period>(() => periodOf('month', today(), s.settings.weekStart));
  const [sel, setSel] = useState<string | null>(null);
  const acc = s.accounts.find((a) => a.id === accId);

  const { rows, totalV } = useMemo(() => {
    const txs = filterTx(s, period, kind, accId || undefined);
    const rows = byCategory(txs).map(([id, v]) => ({ id, v, cat: s.categories.find((c) => c.id === id) }));
    return { rows, totalV: sum(txs) };
  }, [s.txs, s.categories, period, kind, accId]);

  const upcoming = useMemo(() => {
    const now = today();
    return s.txs.filter((x) => x.date > now && (!accId || x.accountId === accId)).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 6);
  }, [s.txs, accId]);

  const month = useMemo(() => {
    const m = periodOf('month', today());
    const i = sum(filterTx(s, m, 'income', accId || undefined));
    const e = sum(filterTx(s, m, 'expense', accId || undefined));
    return { m, i, e, rate: i ? Math.round(((i - e) / i) * 100) : null };
  }, [s.txs, accId]);

  const pace = useMemo(() => {
    if (period.gran === 'day') return null;
    const txs = filterTx(s, period, kind, accId || undefined);
    const now = today();
    const days = Math.round((parseIso(period.end).getTime() - parseIso(period.start).getTime()) / 864e5) + 1;
    const byMonth = period.gran === 'year' || days > 62;
    const buckets: { key: string; label: string; value: number; today?: boolean }[] = [];
    if (byMonth) {
      const d0 = parseIso(period.start);
      for (let m = new Date(d0.getFullYear(), d0.getMonth(), 1); m <= parseIso(period.end); m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
        const key = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
        buckets.push({ key, label: m.toLocaleDateString(locale, { month: 'narrow' }), value: 0, today: now.startsWith(key) });
      }
      for (const x of txs) { const b = buckets.find((k) => k.key === x.date.slice(0, 7)); if (b) b.value += x.base; }
    } else {
      for (let d = period.start; d <= period.end; d = addDays(d, 1)) {
        const dt = parseIso(d);
        buckets.push({ key: d, label: period.gran === 'week' ? dt.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '') : String(dt.getDate()), value: 0, today: d === now });
      }
      const idx = new Map(buckets.map((b, i) => [b.key, i]));
      for (const x of txs) { const i = idx.get(x.date); if (i !== undefined) buckets[i].value += x.base; }
    }
    const total = sum(txs);
    const elapsed = buckets.filter((b) => b.key <= now.slice(0, b.key.length)).length || buckets.length;
    const avg = total / Math.max(1, elapsed);
    const isCurrent = period.start <= now && now <= period.end;
    const prevTotal = sum(filterTx(s, shiftPeriod(period, -1, s.settings.weekStart), kind, accId || undefined));
    return { buckets, avg, total, byMonth, projection: isCurrent ? Math.round(avg * buckets.length) : null, change: prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null };
  }, [s.txs, period, kind, accId, locale]);

  const balanceV = acc ? bal.get(acc.id) ?? 0 : total;
  const balanceCur = acc ? acc.currency : base;
  const selRow = rows.find((r) => r.id === sel);
  const kColor = kind === 'expense' ? 'var(--exp)' : 'var(--inc)';

  const pickAccount = () =>
    openOverlay((close) => (
      <Sheet title={t('selectAccount')}>
        <div className="sheet-b">
          <div className="paper flush">
            {[{ id: '', name: t('total'), icon: 'wallet', color: '#5B3DF5', currency: base }, ...s.accounts.filter((a) => !a.archived).sort((a, b) => a.order - b.order)].map((a) => {
              const v = a.id ? bal.get(a.id) ?? 0 : total;
              return (
                <button key={a.id || 'total'} className="item" onClick={() => { setAccId(a.id); setSel(null); close(); }}>
                  <Bubble icon={a.icon} color={a.color} size={40} />
                  <div className="grow">
                    <div className="t">{a.name}</div>
                    <div className="s">{hide ? '••••••' : money(v, a.currency, locale)}</div>
                  </div>
                  {accId === a.id && <PiCheckBold size={20} />}
                </button>
              );
            })}
          </div>
        </div>
      </Sheet>
    ));

  return (
    <>
      <div className="topbar">
        <button className="acct-pick" onClick={pickAccount}>
          <Bubble icon={acc?.icon ?? 'wallet'} color={acc?.color ?? '#5B3DF5'} size={28} />
          {acc?.name ?? t('total')}
          <PiCaretDownBold className="caret" />
        </button>
        <div className="grow" />
        <button className="icon-btn" onClick={() => setState((st) => ({ ...st, settings: { ...st.settings, hideBalance: !st.settings.hideBalance } }))} aria-label="hide balance">
          {hide ? <PiEyeSlashBold /> : <PiEyeBold />}
        </button>
      </div>

      <div className="balance">
        <div className="lbl">{acc ? t('balance') : t('totalBalance')}</div>
        <div className={'val' + (hide ? ' hidden' : '')}>{hide ? '••••••' : money(balanceV, balanceCur, locale)}</div>
        {acc && acc.currency !== base && !hide && <div className="small muted">≈ {money(toBase(s, balanceV, acc.currency), base, locale)}</div>}
      </div>

      <div className="month-sum">
        <button onClick={() => goTx({ kind: 'income', gran: 'month', start: month.m.start, end: month.m.end, ...(accId ? { acc: accId } : {}) })}>
          <span><PiArrowDownLeftBold /> {t('income')}</span>
          <b className="pos">{money(month.i, base, locale)}</b>
        </button>
        <button onClick={() => goTx({ kind: 'expense', gran: 'month', start: month.m.start, end: month.m.end, ...(accId ? { acc: accId } : {}) })}>
          <span><PiArrowUpRightBold /> {t('expenses')}</span>
          <b>{money(month.e, base, locale)}</b>
        </button>
        <button onClick={() => navigate('/charts')}>
          <span><PiPiggyBankBold /> {t('savedShort')}</span>
          <b style={{ color: (month.rate ?? 0) >= 0 ? 'var(--brand)' : 'var(--exp)' }}>{month.rate === null ? '—' : `${month.rate}%`}</b>
        </button>
      </div>

      <div className="paper">
        <div className="kind-toggle" style={{ ['--k' as any]: kColor }}>
          <button className={kind === 'expense' ? 'on' : ''} onClick={() => { setKind('expense'); setSel(null); }}>{t('expenses')}</button>
          <button className={kind === 'income' ? 'on' : ''} onClick={() => { setKind('income'); setSel(null); }}>{t('income')}</button>
        </div>
        <GranPicker period={period} setPeriod={(p) => { setPeriod(p); setSel(null); }} />
        <PeriodNav label={periodLabel(period, locale)} onPrev={() => setPeriod(shiftPeriod(period, -1, s.settings.weekStart))} onNext={() => setPeriod(shiftPeriod(period, 1, s.settings.weekStart))} />

        {rows.length === 0 ? (
          <Empty icon="sparkle" title={t('noData')} hint={t('noDataHint')} />
        ) : (
          <div className="donut-wrap">
            <Donut data={rows.map((r) => ({ id: r.id, value: r.v, color: r.cat?.color ?? '#999' }))} selected={sel} onSelect={setSel} />
            <div className="donut-center">
              <div>
                <b className="num">{money(selRow ? selRow.v : totalV, base, locale)}</b>
                <span>{selRow ? `${selRow.cat?.name} · ${Math.round((selRow.v / (totalV || 1)) * 100)}%` : kind === 'expense' ? t('expenses') : t('income')}</span>
              </div>
            </div>
          </div>
        )}

        {rows.map((r) => {
          const pc = (r.v / (totalV || 1)) * 100;
          return (
            <button key={r.id} className="cat-row" onClick={() => goTx({ cat: r.id, kind, gran: period.gran, start: period.start, end: period.end, ...(accId ? { acc: accId } : {}) })}>
              <Bubble icon={r.cat?.icon ?? 'question'} color={r.cat?.color ?? '#999'} size={44} />
              <span className="nm">{r.cat?.name ?? '—'}</span>
              <span className="v">{money(r.v, base, locale)}</span>
              <div className="meta">
                <div className="bar grow"><i style={{ width: `${Math.max(pc, 1.5)}%`, background: r.cat?.color }} /></div>
                <span className="pc">{pc < 1 ? '<1' : Math.round(pc)}%</span>
              </div>
            </button>
          );
        })}
      </div>

      {pace && pace.total > 0 && (
        <div className="paper">
          <h3>
            {kind === 'expense' ? t('spendingPace') : t('incomePace')}
            {pace.change !== null && Math.abs(pace.change) >= 1 && (
              <span className={'tag ' + ((kind === 'expense' ? pace.change > 0 : pace.change < 0) ? 'red' : 'green')} style={{ marginLeft: 'auto' }}>
                {pace.change > 0 ? '+' : ''}{Math.round(pace.change)}% {t('vsPrevPeriod')}
              </span>
            )}
          </h3>
          <PaceChart data={pace.buckets} avg={pace.avg} color={kind === 'expense' ? '#E5484D' : '#11905A'} fmt={(v) => money(v, base, locale, { noCents: true })} />
          <div className="stats" style={{ marginTop: 6 }}>
            <div className="st"><span>{pace.byMonth ? t('monthlyAvg') : t('dailyAvg')}</span><b>{money(Math.round(pace.avg), base, locale)}</b></div>
            {pace.projection !== null && <div className="st"><span>{t('projected')}</span><b style={{ color: 'var(--brand)' }}>{money(pace.projection, base, locale)}</b></div>}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="section-title">{t('upcoming')}</div>
          <div className="paper flush">
            {upcoming.map((x) => <PlannedRow key={x.id} tx={x} />)}
          </div>
        </>
      )}

      <div className="qa" style={{ marginTop: 4 }}>
        <button onClick={() => goTx(accId ? { acc: accId } : {})}>
          <span className="set-ico"><PiSquaresFourBold /></span>{t('transactions')}
        </button>
        <button onClick={() => navigate('/charts')}>
          <span className="set-ico" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}><PiChartLineUpBold /></span>{t('seeReport')}
        </button>
      </div>
    </>
  );
}

export function PlannedRow({ tx }: { tx: Tx }) {
  const s = useStore();
  const { t, locale } = useT();
  const cat = s.categories.find((c) => c.id === tx.categoryId);
  const acc = s.accounts.find((a) => a.id === tx.accountId);
  const confirm = () => {
    setState((st) => ({ ...st, txs: st.txs.map((x) => (x.id === tx.id ? { ...x, date: today() } : x)) }));
    toast(t('confirmed'));
  };
  return (
    <div className="item planned-row" style={{ cursor: 'pointer' }} onClick={() => openTxEditor({ tx })}>
      <Bubble icon={cat?.icon ?? 'question'} color={cat?.color ?? '#999'} size={42} />
      <div className="grow">
        <div className="t">{tx.note || cat?.name}</div>
        <div className="s">
          <span className="tag plan">{shortDate(tx.date, locale)}</span> {acc?.name}
          {tx.repeat && <> · <PiArrowsClockwiseBold size={11} /> {t(tx.repeat)}</>}
        </div>
      </div>
      <div className="right">
        <div className={'amt ' + (tx.kind === 'income' ? 'pos' : 'neg')}>{tx.kind === 'income' ? '+' : '−'}{money(tx.amount, acc?.currency ?? s.settings.baseCurrency, locale)}</div>
        <button className="mini-btn" style={{ marginTop: 6 }} onClick={(e) => { e.stopPropagation(); confirm(); }}>{t('confirmNow')}</button>
      </div>
    </div>
  );
}
