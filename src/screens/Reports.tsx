import { useMemo, useState, type ReactNode } from 'react';
import { PiCaretRightBold } from 'react-icons/pi';
import { useStore } from '../lib/store';
import { useT } from '../i18n';
import { buildReport, Insight, Report } from '../lib/report';
import { Period, periodOf, today, parseIso } from '../lib/calc';
import { money, monthLabel, shortDate } from '../lib/format';
import { Bubble, Empty, Sheet } from '../components/ui';
import { Bars } from '../components/charts';
import { PeriodControl, periodText } from '../components/Pickers';
import { iconFor } from '../lib/icons';
import { openOverlay } from '../lib/nav';
import { TxRow, goTx } from './Transactions';

function Delta({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  if (!before) return null;
  const ch = ((now - before) / Math.abs(before)) * 100;
  if (!Number.isFinite(ch) || Math.abs(ch) < 1) return null;
  const bad = invert ? ch > 0 : ch < 0;
  return <span className={'tag ' + (bad ? 'red' : 'green')}>{ch > 300 ? '>300%' : `${ch > 0 ? '+' : ''}${Math.round(ch)}%`}</span>;
}

const toneColor = (i: Insight) => (i.tone === 'good' ? ['var(--inc)', 'var(--inc-soft)'] : i.tone === 'warn' ? ['var(--exp)', 'var(--exp-soft)'] : ['var(--xfer)', 'var(--xfer-soft)']);

export function Reports() {
  const s = useStore();
  const { t, locale } = useT();
  const [p, setP] = useState<Period>(() => periodOf('month', today(), s.settings.weekStart));
  const base = s.settings.baseCurrency;
  const fmt = (c: number) => money(c, base, locale);
  const r = useMemo(() => buildReport(s, p, t, fmt), [s.txs, s.transfers, s.categories, s.accounts, s.settings.rates, p, locale]);
  const empty = !r.income && !r.expense;
  const openInsight = (i: Insight) => openOverlay(() => <InsightDetail insight={i} r={r} />);

  return (
    <>
      <div className="paper" style={{ padding: '8px 12px 6px' }}>
        <PeriodControl period={p} setPeriod={setP} />
      </div>

      {empty ? (
        <div className="paper"><Empty title={t('noData')} /></div>
      ) : (
        <>
          <div className="paper">
            <div className="small muted" style={{ fontWeight: 600, margin: '0 6px' }}>{r.saved >= 0 ? t('savedL') : t('loss')}</div>
            <div className="row" style={{ margin: '2px 6px 4px', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
              <span className="num" style={{ fontSize: 'clamp(30px, 9vw, 38px)', color: r.saved >= 0 ? 'var(--inc)' : 'var(--exp)' }}>{money(r.saved, base, locale, { sign: true })}</span>
              {r.income > 0 && <span className="tag lilac">{Math.round(r.rate)}% {t('savingsRate').toLowerCase()}</span>}
            </div>
            <div className="bar" style={{ height: 10, margin: '10px 6px 6px' }}>
              <i style={{ width: `${r.income ? Math.max(0, Math.min(100, r.rate)) : 0}%`, background: 'linear-gradient(90deg, var(--brand), var(--inc))' }} />
            </div>
            <div className="stats">
              <button className="st" onClick={() => goTx({ kind: 'income', gran: p.gran, start: p.start, end: p.end, view: 'group' })}>
                <span>{t('income')} <Delta now={r.income} before={r.prev.income} /></span><b className="pos">{fmt(r.income)} <PiCaretRightBold size={12} /></b>
              </button>
              <button className="st" onClick={() => goTx({ kind: 'expense', gran: p.gran, start: p.start, end: p.end, view: 'group' })}>
                <span>{t('expenses')} <Delta now={r.expense} before={r.prev.expense} invert /></span><b>{fmt(r.expense)} <PiCaretRightBold size={12} /></b>
              </button>
              <div className="st"><span>{t('dailyAvg')}</span><b>{fmt(Math.round(r.daily))}</b></div>
              {r.biggestDay && <div className="st"><span>{t('biggestDay')} · {shortDate(r.biggestDay.date, locale)}</span><b>{fmt(r.biggestDay.v)}</b></div>}
              <div className="st"><span>{t('netWorth')}</span><b style={{ whiteSpace: 'normal', textAlign: 'right' }}>{fmt(r.netWorthStart)} → {fmt(r.netWorthEnd)}</b></div>
            </div>
          </div>

          {r.insights.length > 0 && (
            <>
              <div className="section-title">{t('attention')}</div>
              <div className="paper flush">
                {r.insights.map((i, k) => {
                  const I = iconFor(i.icon);
                  const [c, bg] = toneColor(i);
                  return (
                    <button key={k} className="item" style={{ alignItems: 'flex-start' }} onClick={() => openInsight(i)}>
                      <span className="set-ico" style={{ background: bg, color: c }}><I /></span>
                      <div className="grow">
                        <div className="t">{i.title}</div>
                        <div className="s">{i.text}</div>
                        <div className="s" style={{ color: 'var(--brand)', fontWeight: 600, marginTop: 4 }}>{t('howCalculated')}</div>
                      </div>
                      <PiCaretRightBold className="chev" />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {r.cats.length > 0 && (
            <>
              <div className="section-title">{t('whereMoney')}</div>
              <div className="paper">
                <div className="dist" style={{ height: 14, margin: '0 6px 10px' }}>
                  {r.cats.map((c) => <i key={c.id} style={{ width: `${c.share}%`, background: c.cat?.color ?? '#999', minWidth: 2 }} />)}
                </div>
                {r.cats.map((c) => (
                  <button key={c.id} className="cat-row" onClick={() => goTx({ cat: c.id, kind: 'expense', gran: p.gran, start: p.start, end: p.end })}>
                    <Bubble icon={c.cat?.icon ?? 'question'} color={c.cat?.color ?? '#999'} size={40} />
                    <span className="nm">{c.cat?.name ?? '—'}</span>
                    <span className="v">{fmt(c.v)}</span>
                    <div className="meta">
                      <span className="small muted grow">{Math.round(c.share)}% · {c.count} {c.count === 1 ? t('item') : t('items')}{c.avg ? ` · ${t('avgL')} ${fmt(Math.round(c.avg))}` : ''}</span>
                      <Delta now={c.v} before={c.avg} invert />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {r.months.length > 0 && (
            <>
              <div className="section-title">{t('monthByMonth')}</div>
              <div className="paper">
                <Bars height={200} fmt={fmt} groups={r.months.map((m) => ({ label: monthLabel(m.key, locale, 'short', false).replace('.', ''), bars: [{ value: m.income, color: '#10A36A' }, { value: m.expense, color: '#EF4444' }] }))} />
                <div className="legend" style={{ justifyContent: 'center', margin: '6px 0 4px' }}>
                  <span><i style={{ background: '#10A36A' }} />{t('income')}</span><span><i style={{ background: '#EF4444' }} />{t('expenses')}</span>
                </div>
                {r.months.map((m) => {
                  const net = m.income - m.expense;
                  return (
                    <div key={m.key} className="item" style={{ alignItems: 'flex-start' }}>
                      <div className="grow">
                        <div className="t">{monthLabel(m.key, locale)}</div>
                        <div className="s"><span className="pos">+{fmt(m.income)}</span> · −{fmt(m.expense)}</div>
                      </div>
                      <div className="amt" style={{ color: net >= 0 ? 'var(--inc)' : 'var(--exp)' }}>{money(net, base, locale, { sign: true })}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {r.topTx.length > 0 && (
            <>
              <div className="section-title">{t('biggestExpenses')}</div>
              <div className="paper flush">{r.topTx.map((x) => <TxRow key={x.id} tx={x} showDate />)}</div>
            </>
          )}

          {r.incomeCats.length > 0 && (
            <>
              <div className="section-title">{t('incomeSources')}</div>
              <div className="paper flush">
                {r.incomeCats.map((c) => (
                  <button key={c.id} className="cat-row" onClick={() => goTx({ cat: c.id, kind: 'income', gran: p.gran, start: p.start, end: p.end })}>
                    <Bubble icon={c.cat?.icon ?? 'question'} color={c.cat?.color ?? '#999'} size={40} />
                    <span className="nm">{c.cat?.name ?? '—'}</span>
                    <span className="v pos">{fmt(c.v)}</span>
                    <div className="meta">
                      <div className="bar grow"><i style={{ width: `${c.share}%`, background: c.cat?.color }} /></div>
                      <span className="pc">{Math.round(c.share)}%</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="small muted" style={{ textAlign: 'center', margin: '14px 0' }}>{periodText(p, locale)}</div>
        </>
      )}
    </>
  );
}

/** Explains how each insight was calculated, with the numbers and the transactions behind it. */
function InsightDetail({ insight: i, r }: { insight: Insight; r: Report }) {
  const s = useStore();
  const { t, locale } = useT();
  const base = s.settings.baseCurrency;
  const fmt = (c: number) => money(c, base, locale);
  const cat = i.catId ? s.categories.find((c) => c.id === i.catId) : undefined;
  const pTxs = s.txs.filter((x) => x.date >= r.period.start && x.date <= r.period.end);
  let body: ReactNode;

  switch (i.key) {
    case 'saved':
      body = (
        <>
          <div className="formula">{t('income')} <b>{fmt(r.income)}</b> − {t('expenses')} <b>{fmt(r.expense)}</b> = <b>{money(r.saved, base, locale, { sign: true })}</b><br />
            {t('savingsRate')} = {t('savedL').toLowerCase()} ÷ {t('income').toLowerCase()} = <b>{Math.round(r.rate)}%</b></div>
          <div className="small muted">{t('dSavedNote')}</div>
        </>
      );
      break;
    case 'spent':
      body = (
        <>
          <div className="formula">{t('expenses')}: <b>{fmt(r.expense)}</b> · {t('previousPeriod')}: <b>{fmt(r.prev.expense)}</b><br />
            ({fmt(r.expense)} − {fmt(r.prev.expense)}) ÷ {fmt(r.prev.expense)} = <b>{Math.round(((r.expense - r.prev.expense) / r.prev.expense) * 100)}%</b></div>
          <div className="label">{t('dBiggestChanges')}</div>
          <div className="paper flush">
            {r.catPrevDiff.slice(0, 8).map((d) => (
              <div key={d.id} className="item">
                <Bubble icon={d.cat?.icon ?? 'question'} color={d.cat?.color ?? '#999'} size={36} />
                <div className="grow"><div className="t">{d.cat?.name}</div><div className="s">{fmt(d.prev)} → {fmt(d.now)}</div></div>
                <div className="amt" style={{ color: d.now > d.prev ? 'var(--exp)' : 'var(--inc)' }}>{money(d.now - d.prev, base, locale, { sign: true })}</div>
              </div>
            ))}
          </div>
        </>
      );
      break;
    case 'projection': {
      const totalDays = Math.round((parseIso(r.period.end).getTime() - parseIso(r.period.start).getTime()) / 864e5) + 1;
      body = (
        <div className="formula">{t('dSpentSoFar')}: <b>{fmt(r.expense)}</b> {t('dIn')} <b>{r.days}</b> {t('dDays')}<br />
          {t('dailyAvg')} = <b>{fmt(Math.round(r.daily))}</b><br />
          {t('projected')} = {fmt(Math.round(r.daily))} × {totalDays} {t('dDays')} = <b>{fmt(r.projection ?? 0)}</b></div>
      );
      break;
    }
    case 'catUp':
    case 'budget':
    case 'concentration': {
      const c = r.cats.find((x) => x.id === i.catId);
      const list = pTxs.filter((x) => x.categoryId === i.catId && x.kind === 'expense').sort((a, b) => b.base - a.base);
      body = (
        <>
          {i.key === 'catUp' && c && (
            <>
              <div className="formula">{t('dThisPeriod')}: <b>{fmt(c.v)}</b><br />{t('dAvgPrev')}: <b>{fmt(Math.round(c.avg))}</b><br />({fmt(c.v)} − {fmt(Math.round(c.avg))}) ÷ {fmt(Math.round(c.avg))} = <b>{Math.round(((c.v - c.avg) / c.avg) * 100)}%</b></div>
              <div className="paper">
                <Bars height={170} fmt={fmt} groups={[...r.histLabels].reverse().map((l, k) => ({ label: shortLabel(l, r.period.gran, locale), bars: [{ value: [...r.hist].reverse()[k].get(c.id) ?? 0, color: cat?.color ?? '#999' }] })).concat([{ label: t('now'), bars: [{ value: c.v, color: cat?.color ?? '#999' }], highlight: true } as any])} />
              </div>
            </>
          )}
          {i.key === 'budget' && cat?.budget && <div className="formula">{t('budget')}: <b>{fmt(cat.budget)}</b> · {t('dSpent')}: <b>{fmt(list.reduce((a, x) => a + x.base, 0))}</b></div>}
          {i.key === 'concentration' && c && <div className="formula">{cat?.name}: <b>{fmt(c.v)}</b> ÷ {t('expenses').toLowerCase()} <b>{fmt(r.expense)}</b> = <b>{Math.round(c.share)}%</b></div>}
          <div className="label">{t('transactions')} ({list.length})</div>
          <div className="paper flush">{list.map((x) => <TxRow key={x.id} tx={x} showDate />)}</div>
        </>
      );
      break;
    }
    case 'nonEss': {
      const byCat = r.nonEssentialCats;
      const kw = r.neList.filter((n) => n.reason === 'keyword');
      body = (
        <>
          <div className="formula">{t('dNonEssHow')}<br />{t('nonEssentialT')}: <b>{fmt(r.nonEssential)}</b> ÷ {t('expenses').toLowerCase()} <b>{fmt(r.expense)}</b> = <b>{Math.round((r.nonEssential / (r.expense || 1)) * 100)}%</b></div>
          <div className="label">{t('dNonEssCats')}</div>
          <div className="paper flush">
            {byCat.map((c) => (
              <div key={c.id} className="item">
                <Bubble icon={c.cat?.icon ?? 'question'} color={c.cat?.color ?? '#999'} size={36} />
                <div className="grow"><div className="t">{c.cat?.name}</div><div className="s">{r.neList.filter((n) => n.tx.categoryId === c.id && n.reason === 'category').length ? t('dMarkedNonEss') : t('dByKeyword')}</div></div>
                <div className="amt">{fmt(c.v)}</div>
              </div>
            ))}
          </div>
          {kw.length > 0 && (
            <>
              <div className="label">{t('dKeywordTx')}</div>
              <div className="paper flush">
                {kw.map((n) => (
                  <div key={n.tx.id}>
                    <TxRow tx={n.tx} showDate />
                    <div className="small" style={{ margin: '-6px 0 8px 66px', color: 'var(--brand)', fontWeight: 600 }}>“{n.word}”</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="small muted" style={{ margin: '10px 6px' }}>{t('dChangeEssential')}</div>
        </>
      );
      break;
    }
    case 'fixed':
      body = (
        <>
          <div className="formula">{t('dFixedHow')}</div>
          {r.fixed.map((f) => (
            <div key={f.name + f.categoryId}>
              <div className="label">{f.name} · {t('avgL')} {fmt(f.avg)}{t('perMonth')}</div>
              <div className="paper flush">{f.txs.slice(0, 4).map((x) => <TxRow key={x.id} tx={x} showDate />)}</div>
            </div>
          ))}
        </>
      );
      break;
    case 'worth':
    default:
      body = (
        <div className="formula">{t('dWorthStart')}: <b>{fmt(r.netWorthStart)}</b><br />{t('dWorthEnd')}: <b>{fmt(r.netWorthEnd)}</b><br />{t('dWorthDiff')}: <b>{money(r.netWorthEnd - r.netWorthStart, base, locale, { sign: true })}</b><br /><span className="small">{t('dWorthNote')}</span></div>
      );
  }

  return (
    <Sheet title={i.title}>
      <div className="sheet-b">{body}</div>
    </Sheet>
  );
}

function shortLabel(start: string, gran: Period['gran'], locale: string) {
  if (gran === 'month') return monthLabel(start.slice(0, 7), locale, 'short', false).replace('.', '');
  if (gran === 'year') return start.slice(0, 4);
  return shortDate(start, locale);
}
