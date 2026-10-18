import { useMemo, useState } from 'react';
import { PiEyeBold, PiEyeSlashBold, PiCaretDownBold, PiCheckBold, PiArrowsClockwiseBold, PiSquaresFourBold, PiChartLineUpBold } from 'react-icons/pi';
import type { Kind, Tx } from '../lib/types';
import { setState, useBalances, useStore } from '../lib/store';
import { useT } from '../i18n';
import { byCategory, filterTx, Period, periodOf, shiftPeriod, sum, today, toBase } from '../lib/calc';
import { money, shortDate } from '../lib/format';
import { Bubble, Empty, PeriodNav, Sheet } from '../components/ui';
import { Donut } from '../components/charts';
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
