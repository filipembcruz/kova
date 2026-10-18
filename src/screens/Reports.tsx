import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { useT } from '../i18n';
import { buildReport, rPeriod, rShift, RGran, RPeriod } from '../lib/report';
import { money, monthLabel, shortDate } from '../lib/format';
import { Bubble, Empty, PeriodNav } from '../components/ui';
import { iconFor } from '../lib/icons';
import { TxRow, goTx } from './Transactions';

function label(p: RPeriod, locale: string, t: (k: any) => string) {
  if (p.gran === 'month') return monthLabel(p.start.slice(0, 7), locale);
  if (p.gran === 'year') return p.start.slice(0, 4);
  const q = Math.floor(Number(p.start.slice(5, 7)) / 3) + 1;
  return `${t('quarter')} ${q} · ${p.start.slice(0, 4)}`;
}

function Delta({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  if (!before) return null;
  const ch = ((now - before) / Math.abs(before)) * 100;
  if (!Number.isFinite(ch) || Math.abs(ch) < 1) return null;
  const bad = invert ? ch > 0 : ch < 0;
  return <span className={'tag ' + (bad ? 'red' : 'green')}>{ch > 300 ? '>300%' : `${ch > 0 ? '+' : ''}${Math.round(ch)}%`}</span>;
}

export function Reports() {
  const s = useStore();
  const { t, locale } = useT();
  const [p, setP] = useState<RPeriod>(() => rPeriod('month'));
  const base = s.settings.baseCurrency;
  const fmt = (c: number) => money(c, base, locale);
  const r = useMemo(() => buildReport(s, p, t, fmt), [s.txs, s.transfers, s.categories, s.accounts, s.settings.rates, p, locale]);
  const setGran = (g: RGran) => setP(rPeriod(g, p.start <= new Date().toISOString().slice(0, 10) && p.end >= new Date().toISOString().slice(0, 10) ? undefined : p.start));
  const empty = !r.income && !r.expense;

  return (
    <>
      <div className="paper" style={{ padding: '12px 12px 6px' }}>
        <div className="gran">
          {(['month', 'quarter', 'year'] as RGran[]).map((g) => (
            <button key={g} className={p.gran === g ? 'on' : ''} onClick={() => setGran(g)}>{g === 'month' ? t('month') : g === 'quarter' ? t('quarter') : t('year')}</button>
          ))}
        </div>
        <PeriodNav label={label(p, locale, t)} onPrev={() => setP(rShift(p, -1))} onNext={() => setP(rShift(p, 1))} />
      </div>

      {empty ? (
        <div className="paper"><Empty title={t('noData')} /></div>
      ) : (
        <>
          <div className="paper">
            <div className="small muted" style={{ fontWeight: 600, margin: '0 6px' }}>{r.saved >= 0 ? t('savedL') : t('loss')}</div>
            <div className="row" style={{ margin: '2px 6px 4px', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
              <span className="num" style={{ fontSize: 'clamp(28px, 8.5vw, 36px)', color: r.saved >= 0 ? 'var(--inc)' : 'var(--exp)' }}>{money(r.saved, base, locale, { sign: true })}</span>
              {r.income > 0 && <span className="tag lilac">{Math.round(r.rate)}% {t('savingsRate').toLowerCase()}</span>}
            </div>
            <div className="bar" style={{ height: 10, margin: '10px 6px 6px' }}>
              <i style={{ width: `${r.income ? Math.max(0, Math.min(100, r.rate)) : 0}%`, background: 'var(--inc)' }} />
            </div>
            <div className="stats">
              <div className="st"><span>{t('income')} <Delta now={r.income} before={r.prev.income} /></span><b className="pos">{fmt(r.income)}</b></div>
              <div className="st"><span>{t('expenses')} <Delta now={r.expense} before={r.prev.expense} invert /></span><b>{fmt(r.expense)}</b></div>
              <div className="st"><span>{t('dailyAvg')}</span><b>{fmt(Math.round(r.daily))}</b></div>
              {r.biggestDay && <div className="st"><span>{t('biggestDay')} · {shortDate(r.biggestDay.date, locale)}</span><b>{fmt(r.biggestDay.v)}</b></div>}
              <div className="st"><span>{t('netWorth')}</span><b>{fmt(r.netWorthStart)} → {fmt(r.netWorthEnd)}</b></div>
            </div>
          </div>

          {r.insights.length > 0 && (
            <>
              <div className="section-title">{t('attention')}</div>
              <div className="paper flush">
                {r.insights.map((i, k) => {
                  const I = iconFor(i.icon);
                  const c = i.tone === 'good' ? 'var(--inc)' : i.tone === 'warn' ? 'var(--exp)' : 'var(--xfer)';
                  const bg = i.tone === 'good' ? 'var(--inc-soft)' : i.tone === 'warn' ? 'var(--exp-soft)' : 'var(--xfer-soft)';
                  return (
                    <div key={k} className="item" style={{ alignItems: 'flex-start' }}>
                      <span className="set-ico" style={{ background: bg, color: c }}><I /></span>
                      <div className="grow">
                        <div className="t">{i.title}</div>
                        <div className="s">{i.text}</div>
                      </div>
                    </div>
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
                  <button key={c.id} className="cat-row" onClick={() => goTx({ cat: c.id, kind: 'expense', gran: 'custom', start: p.start, end: p.end })}>
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
              <div className="paper flush">
                {r.months.map((m) => {
                  const net = m.income - m.expense;
                  return (
                    <div key={m.key} className="item" style={{ alignItems: 'flex-start' }}>
                      <div className="grow">
                        <div className="t">{monthLabel(m.key, locale)}</div>
                        <div className="s"><span className="pos">+{fmt(m.income)}</span>  ·  −{fmt(m.expense)}</div>
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

          {r.nonEssential > 0 && (
            <>
              <div className="section-title">{t('nonEssentialT')}</div>
              <div className="paper">
                <div className="row" style={{ margin: '0 6px 6px', alignItems: 'baseline' }}>
                  <span className="num grow" style={{ fontSize: 24 }}>{fmt(r.nonEssential)}</span>
                  <span className="tag">{Math.round((r.nonEssential / (r.expense || 1)) * 100)}%</span>
                </div>
                {r.nonEssentialCats.map((c) => (
                  <div key={c.id} className="cat-row" style={{ gridTemplateColumns: '36px 1fr auto' }}>
                    <Bubble icon={c.cat?.icon ?? 'question'} color={c.cat?.color ?? '#999'} size={36} />
                    <span className="nm">{c.cat?.name ?? '—'}</span>
                    <span className="v">{fmt(c.v)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {r.fixed.length > 0 && (
            <>
              <div className="section-title">{t('fixedCosts')}</div>
              <div className="paper flush">
                {r.fixed.map((f) => {
                  const c = s.categories.find((x) => x.id === f.categoryId);
                  return (
                    <div key={f.name + f.categoryId} className="item">
                      <Bubble icon={c?.icon ?? 'question'} color={c?.color ?? '#999'} size={38} />
                      <div className="grow"><div className="t">{f.name}</div><div className="s">{c?.name} · {f.months}/4</div></div>
                      <div className="amt">{fmt(f.avg)}<span className="small muted">{t('perMonth')}</span></div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {r.incomeCats.length > 0 && (
            <>
              <div className="section-title">{t('incomeSources')}</div>
              <div className="paper flush">
                {r.incomeCats.map((c) => (
                  <div key={c.id} className="cat-row">
                    <Bubble icon={c.cat?.icon ?? 'question'} color={c.cat?.color ?? '#999'} size={40} />
                    <span className="nm">{c.cat?.name ?? '—'}</span>
                    <span className="v pos">{fmt(c.v)}</span>
                    <div className="meta">
                      <div className="bar grow"><i style={{ width: `${c.share}%`, background: c.cat?.color }} /></div>
                      <span className="pc">{Math.round(c.share)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
