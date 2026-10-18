import { useMemo } from 'react';
import { PiArrowLeftBold, PiPlusBold, PiBellRingingBold, PiReceiptBold } from 'react-icons/pi';
import { setState, useStore } from '../lib/store';
import { useT } from '../i18n';
import { addDays, today, uid, periodOf } from '../lib/calc';
import { buildReport } from '../lib/report';
import { Bubble } from '../components/ui';
import { money } from '../lib/format';
import { Empty, Switch } from '../components/ui';
import { openTxEditor } from '../components/TxEditor';
import { upcomingBills } from '../lib/reminders';
import { notificationsAllowed } from '../native';
import { PlannedRow } from './Home';

/** Fixed bills & recurring income: what is coming, how much it costs per month, reminders. */
export function Bills() {
  const s = useStore();
  const { t, locale } = useT();
  const base = s.settings.baseCurrency;
  const bills = useMemo(() => upcomingBills(s), [s.txs]);
  const planned = useMemo(() => s.txs.filter((x) => x.date > today() && !x.done && !x.series).sort((a, b) => (a.date < b.date ? -1 : 1)), [s.txs]);
  const perMonth = (k: 'expense' | 'income') =>
    bills.filter((b) => b.kind === k).reduce((a, b) => a + (b.repeat === 'weekly' ? b.base * 52 / 12 : b.repeat === 'yearly' ? b.base / 12 : b.base), 0);
  const exp = perMonth('expense');
  const inc = perMonth('income');
  const suggestions = useMemo(() => {
    const r = buildReport(s, periodOf('month', today()), () => '', (c) => String(c));
    return r.fixed.filter((f) => !f.txs.some((x) => x.series));
  }, [s.txs]);
  const adopt = (txId: string) => {
    notificationsAllowed(true);
    setState((st) => ({ ...st, txs: st.txs.map((x) => (x.id === txId ? { ...x, repeat: 'monthly', series: uid(), remind: 1 } : x)) }));
  };
  const groups: [string, typeof bills][] = [
    [t('monthly'), bills.filter((b) => b.repeat === 'monthly')],
    [t('weekly'), bills.filter((b) => b.repeat === 'weekly')],
    [t('yearly'), bills.filter((b) => b.repeat === 'yearly')],
  ];

  return (
    <>
      <div className="topbar">
        <button className="icon-btn" onClick={() => history.back()} aria-label="back"><PiArrowLeftBold /></button>
        <h1 style={{ fontSize: 24 }}>{t('fixedBills')}</h1>
        <button className="icon-btn solid" onClick={() => openTxEditor({ kind: 'expense', repeat: 'monthly', date: addDays(today(), 1) })} aria-label="add"><PiPlusBold /></button>
      </div>

      <div className="paper">
        <div className="stats">
          <div className="st"><span>{t('fixedPerMonth')}</span><b>{money(Math.round(exp), base, locale)}</b></div>
          {inc > 0 && <div className="st"><span>{t('recurringIncome')}</span><b className="pos">{money(Math.round(inc), base, locale)}</b></div>}
          <div className="st"><span>{t('fixedPerYear')}</span><b>{money(Math.round(exp * 12), base, locale)}</b></div>
        </div>
        <div className="row" style={{ marginTop: 8, padding: '6px 6px 0' }}>
          <span className="set-ico" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}><PiBellRingingBold /></span>
          <div className="grow"><b style={{ fontWeight: 600 }}>{t('billReminders')}</b><div className="small muted">{t('billRemindersD')}</div></div>
          <Switch on={s.settings.billReminders} onChange={async (v) => { if (v) await notificationsAllowed(true); setState((st) => ({ ...st, settings: { ...st.settings, billReminders: v } })); }} />
        </div>
      </div>

      {suggestions.length > 0 && (
        <>
          <div className="section-title">{t('suggestedBills')}</div>
          <div className="small muted" style={{ margin: '-4px 8px 10px' }}>{t('suggestedBillsD')}</div>
          <div className="paper flush">
            {suggestions.map((f) => {
              const c = s.categories.find((x) => x.id === f.categoryId);
              return (
                <div key={f.name + f.categoryId} className="item">
                  <Bubble icon={c?.icon ?? 'question'} color={c?.color ?? '#999'} size={40} />
                  <div className="grow"><div className="t">{f.name}</div><div className="s">{c?.name} · ~{money(f.avg, base, locale)}{t('perMonth')}</div></div>
                  <button className="mini-btn" onClick={() => adopt(f.txs[0].id)}>{t('addFixed')}</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {bills.length === 0 && planned.length === 0 && suggestions.length === 0 && (
        <div className="paper"><Empty icon="receipt" title={t('noBills')} hint={t('noBillsHint')} /></div>
      )}

      {groups.map(([title, list]) => list.length > 0 && (
        <div key={title}>
          <div className="section-title">{title}</div>
          <div className="paper flush">{list.map((x) => <PlannedRow key={x.id} tx={x} />)}</div>
        </div>
      ))}

      {planned.length > 0 && (
        <>
          <div className="section-title">{t('plannedOnce')}</div>
          <div className="paper flush">{planned.map((x) => <PlannedRow key={x.id} tx={x} />)}</div>
        </>
      )}

      <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => openTxEditor({ kind: 'expense', repeat: 'monthly', date: addDays(today(), 1) })}>
        <PiReceiptBold /> {t('newFixed')}
      </button>
    </>
  );
}
