// Home-screen widget: the app sends a small summary to the native widget after every change.
import type { State } from './types';
import { addDays, byCategory, filterTx, isPlanned, periodOf, shiftPeriod, sum, today } from './calc';
import { money } from './format';
import { getT, resolveLang } from '../i18n';
import { updateWidget, setStatusNotif } from '../native';

export function buildWidgetPayload(s: State) {
  const t = getT();
  const locale = resolveLang(s.settings.lang) === 'pt' ? 'pt-BR' : 'en-US';
  const base = s.settings.baseCurrency;
  const now = today();
  const m = periodOf('month', now);
  const exp = filterTx(s, m, 'expense').filter((x) => !isPlanned(x));
  const spent = sum(exp);
  // last month, running total per day (to compare "same day" fairly)
  const pm = shiftPeriod(m, -1);
  const prevByDay: number[] = [];
  let acc = 0;
  const prevTx = filterTx(s, pm, 'expense');
  for (let d = pm.start; d <= pm.end; d = addDays(d, 1)) {
    acc += sum(prevTx.filter((x) => x.date === d));
    prevByDay.push(acc);
  }
  const curCum: number[] = [];
  let run = 0;
  for (let d = m.start; d <= now; d = addDays(d, 1)) { run += sum(exp.filter((x) => x.date === d)); curCum.push(run); }
  const cats = byCategory(exp);
  const top = cats.slice(0, 3).map(([id, v]) => {
    const c = s.categories.find((x) => x.id === id);
    return { name: c?.name ?? '—', color: c?.color ?? '#999999', value: v, fmt: money(v, base, locale, { compact: true, noCents: true }) };
  });
  const other = cats.slice(3).reduce((a, [, v]) => a + v, 0);
  const prevName = new Date(pm.start + 'T12:00').toLocaleDateString(locale, { month: 'short' }).replace('.', '');
  const shortcuts = s.settings.shortcutsOn === false ? [] : (s.shortcuts ?? []).filter((x) => x.kind === 'expense').slice(0, 2).map((x) => ({
    id: x.id,
    label: x.note.trim() || s.categories.find((c) => c.id === x.categoryId)?.name || '—',
  }));
  return {
    month: now.slice(0, 7),
    spent,
    spentFmt: money(spent, base, locale),
    zeroFmt: money(0, base, locale),
    prevCum: prevByDay,
    curCum,
    vsLabel: t('widgetVs', { m: prevName }),
    curName: new Date(m.start + 'T12:00').toLocaleDateString(locale, { month: 'short' }).replace('.', ''),
    prevName,
    spentWord: t('widgetSpent'),
    addLabel: '+ ' + t('expense'),
    cats: top,
    other,
    otherLabel: t('widgetOther'),
    hide: s.settings.widgetHide === true,
    base,
    locale,
    shortcuts,
  };
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function syncWidget(s: State) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      const p = buildWidgetPayload(s);
      (globalThis as any).__kovaWidget = p;
      updateWidget(JSON.stringify(p));
      const day = Number(today().slice(8, 10));
      const prev = p.prevCum[Math.min(day, p.prevCum.length) - 1] ?? 0;
      const pct = prev > 0 ? Math.round(((p.spent - prev) / prev) * 100) : null;
      const vs = p.vsLabel.replace('%d', String(Math.min(day, p.prevCum.length)));
      const month = new Date().toLocaleDateString(p.locale, { month: 'long' });
      setStatusNotif(!!s.settings.statusNotif, `${month[0].toUpperCase()}${month.slice(1)} · ${s.settings.widgetHide ? '••••' : p.spentFmt} ${p.spentWord}`,
        pct === null || s.settings.widgetHide ? '' : `${pct > 0 ? '+' : ''}${pct}% ${vs}`, p.addLabel);
    } catch { /* ignore */ }
  }, 1200);
}
