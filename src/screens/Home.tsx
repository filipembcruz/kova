import { useMemo } from 'react';
import { PiEyeBold, PiEyeSlashBold, PiArrowUpRightBold, PiArrowDownRightBold, PiCaretRightBold, PiPlusBold, PiTrendUpBold, PiPiggyBankDuotone, PiShieldCheckDuotone, PiCalendarCheckDuotone, PiTargetDuotone, PiSunDuotone } from 'react-icons/pi';
import { setState, useBalances, useStore } from '../lib/store';
import { useT } from '../i18n';
import { addDays, byCategory, filterTx, lastMonths, parseIso, periodOf, sum, today } from '../lib/calc';
import { money } from '../lib/format';
import { Bubble, Money, Empty } from '../components/ui';
import { PaceBars } from '../components/charts';
import { navigate } from '../lib/nav';
import { openTxEditor } from '../components/TxEditor';
import { TxRow } from './Transactions';

export function Home() {
  const s = useStore();
  const { t, locale } = useT();
  const { total } = useBalances();
  const base = s.settings.baseCurrency;
  const hide = s.settings.hideBalance;
  const now = today();

  const d = useMemo(() => {
    const p = periodOf('month', now);
    const prev = periodOf('month', addDays(p.start, -1));
    const exp = filterTx(s, p, 'expense');
    const inc = filterTx(s, p, 'income');
    const expSum = sum(exp);
    const incSum = sum(inc);
    const prevExp = sum(filterTx(s, prev, 'expense'));
    // same-day-of-month comparison for fairness
    const dom = parseIso(now).getDate();
    const prevToDate = sum(filterTx(s, { start: prev.start, end: addDays(prev.start, dom - 1) }, 'expense'));
    const daysInMonth = parseIso(p.end).getDate();
    const daily = expSum / dom;
    const projected = Math.round(daily * daysInMonth);
    const week = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6)).map((day) => ({
      label: parseIso(day).toLocaleDateString(locale, { weekday: 'short' }).replace('.', '').slice(0, 3),
      value: sum(filterTx(s, { start: day, end: day }, 'expense')),
      today: day === now,
    }));
    const weekAvg = week.reduce((a, x) => a + x.value, 0) / 7;
    const cats = byCategory(exp).slice(0, 4).map(([id, v]) => {
      const pv = sum(filterTx(s, prev, 'expense').filter((x) => x.categoryId === id));
      return { cat: s.categories.find((c) => c.id === id), v, change: pv ? ((v - pv) / pv) * 100 : null };
    });
    // achievements
    const months = lastMonths(6, now).slice(0, 5);
    const avgMonthly = months.reduce((a, m) => a + sum(filterTx(s, periodOf('month', m + '-01'), 'expense')), 0) / months.length || 1;
    const loggedDays = new Set(s.txs.filter((x) => x.date >= p.start && x.date <= p.end).map((x) => x.date)).size;
    const budgets = s.categories.filter((c) => c.budget && !c.archived);
    const budgetsOk = budgets.length > 0 && budgets.every((c) => sum(exp.filter((x) => x.categoryId === c.id)) <= (c.budget ?? 0));
    const rateSaved = incSum ? ((incSum - expSum) / incSum) * 100 : 0;
    return { expSum, incSum, prevExp, prevToDate, daily, projected, week, weekAvg, cats, avgMonthly, loggedDays, budgetsOk, budgets, rateSaved };
  }, [s.txs, s.categories, now, locale]);

  const net = d.incSum - d.expSum;
  const badges = [
    { on: net > 0, icon: PiSunDuotone, c: ['#FFB020', '#FF8A4C'], t: t('badgeGreen'), d: t('badgeGreenD') },
    { on: d.rateSaved >= 30, icon: PiPiggyBankDuotone, c: ['#FF5FA2', '#B57BFF'], t: t('badgeSaver'), d: t('badgeSaverD') },
    { on: total >= d.avgMonthly * 6, icon: PiShieldCheckDuotone, c: ['#3DD68C', '#12B886'], t: t('badgeReserve'), d: t('badgeReserveD') },
    { on: d.loggedDays >= 20, icon: PiCalendarCheckDuotone, c: ['#22B8E6', '#3D8BFF'], t: t('badgeStreak'), d: t('badgeStreakD') },
    { on: d.budgetsOk, icon: PiTargetDuotone, c: ['#7C5CFF', '#5B4BDB'], t: t('badgeBudget'), d: t('badgeBudgetD') },
  ];
  const level = 1 + badges.filter((b) => b.on).length;
  const paceDelta = d.prevToDate ? ((d.expSum - d.prevToDate) / d.prevToDate) * 100 : null;
  const recent = s.txs.slice(0, 6);
  const name = s.settings.name;
  const fmtC = (v: number) => (hide ? '••' : money(v, base, locale, { compact: true, noCents: true }));

  return (
    <>
      <div className="topbar">
        <div className="avatar">{(name || 'K').charAt(0).toUpperCase()}</div>
        <div className="greet">
          <b>{t('hi')}{name ? `, ${name}` : ''} 👋</b>
          <span>{new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
        <button className="round-btn" onClick={() => openTxEditor()} aria-label="add"><PiPlusBold /></button>
      </div>

      <div className="hero">
        <div className="label">{t('totalBalance')}</div>
        <button className="eye" onClick={() => setState((st) => ({ ...st, settings: { ...st.settings, hideBalance: !st.settings.hideBalance } }))} aria-label="toggle">
          {hide ? <PiEyeSlashBold /> : <PiEyeBold />}
        </button>
        <div className="big"><Money cents={total} /></div>
        <div className="chips">
          <div className="chip"><PiArrowDownRightBold /> <Money cents={d.incSum} compact /></div>
          <div className="chip"><PiArrowUpRightBold /> <Money cents={d.expSum} compact /></div>
          <div className="chip"><PiTrendUpBold /> {d.incSum ? `${Math.round(d.rateSaved)}%` : '—'}</div>
        </div>
      </div>

      <div className="card">
        <h3>
          {t('spendingPace')}
          {paceDelta !== null && (
            <span className={'tag ' + (paceDelta > 0 ? 'red' : 'green')} style={{ marginLeft: 'auto' }}>
              {paceDelta > 0 ? '+' : ''}{Math.round(paceDelta)}% {t('vsLastMonth')}
            </span>
          )}
        </h3>
        <PaceBars days={d.week} avg={d.weekAvg} fmt={fmtC} />
        <div className="stat-row" style={{ marginTop: 12 }}>
          <div className="stat"><span>{t('expenses')}</span><b><Money cents={d.expSum} compact /></b></div>
          <div className="stat" style={{ background: 'var(--lilac)' }}><span style={{ color: 'var(--lilac-ink)' }}>{t('projected')}</span><b style={{ color: 'var(--lilac-ink)' }}><Money cents={d.projected} compact /></b></div>
          <div className="stat"><span>{t('dailyAvg')}</span><b><Money cents={Math.round(d.daily)} compact /></b></div>
        </div>
      </div>

      <div className="card">
        <h3>
          {t('topCategories')}
          <button className="link" onClick={() => navigate('/charts')}>{t('seeAll')} <PiCaretRightBold /></button>
        </h3>
        {d.cats.length === 0 && <div className="muted small">{t('noData')}</div>}
        {d.cats.map(({ cat, v, change }) => cat && (
          <button key={cat.id} className="item" style={{ padding: '10px 4px' }} onClick={() => navigate(`/tx?cat=${cat.id}&kind=expense`)}>
            <Bubble icon={cat.icon} color={cat.color} size={42} />
            <div className="grow">
              <div className="row" style={{ gap: 8 }}>
                <span className="t grow ellipsis">{cat.name}</span>
                {change !== null && <span className={'tag ' + (change > 0 ? 'red' : 'green')}>{change > 0 ? '+' : ''}{Math.round(change)}%</span>}
                <Money className="amt" cents={v} />
              </div>
              <div className="bar" style={{ marginTop: 8 }}>
                <i style={{ width: `${Math.min(100, (v / (cat.budget || d.expSum || 1)) * 100)}%`, background: cat.color }} />
              </div>
              {cat.budget ? <div className="s">{money(v, base, locale)} {t('of')} {money(cat.budget, base, locale)}</div> : null}
            </div>
          </button>
        ))}
      </div>

      <div className="card">
        <h3>{t('achievements')} <span className="tag lilac" style={{ marginLeft: 'auto' }}>{t('level')} {level}</span></h3>
        <div className="badges">
          {badges.map((b, i) => (
            <div key={i} className={'badge' + (b.on ? '' : ' off')}>
              <div className="medal" style={{ background: `linear-gradient(145deg, ${b.c[0]}, ${b.c[1]})`, boxShadow: b.on ? `0 10px 24px ${b.c[1]}55` : 'none' }}>
                <b.icon />
              </div>
              <b>{b.t}</b>
              <span>{b.d}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section-title">
        {t('recent')}
        <button className="link" onClick={() => navigate('/tx')}>{t('seeAll')} <PiCaretRightBold /></button>
      </div>
      <div className="card tight">
        {recent.length === 0 ? <Empty title={t('noData')} hint={t('noDataHint')} /> : recent.map((x) => <TxRow key={x.id} tx={x} showDate />)}
      </div>
    </>
  );
}
