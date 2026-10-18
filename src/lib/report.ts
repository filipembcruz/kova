import type { Category, State, Tx } from './types';
import { addDays, balances, fold, iso, pad, parseIso, today, totalBalance } from './calc';

export type RGran = 'month' | 'quarter' | 'year';
export interface RPeriod { gran: RGran; start: string; end: string }

export function rPeriod(gran: RGran, anchor = today()): RPeriod {
  const d = parseIso(anchor);
  if (gran === 'month') return { gran, start: iso(new Date(d.getFullYear(), d.getMonth(), 1)), end: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  if (gran === 'quarter') {
    const q = Math.floor(d.getMonth() / 3) * 3;
    return { gran, start: iso(new Date(d.getFullYear(), q, 1)), end: iso(new Date(d.getFullYear(), q + 3, 0)) };
  }
  return { gran, start: `${d.getFullYear()}-01-01`, end: `${d.getFullYear()}-12-31` };
}

export function rShift(p: RPeriod, dir: number): RPeriod {
  const d = parseIso(p.start);
  const months = p.gran === 'month' ? 1 : p.gran === 'quarter' ? 3 : 12;
  return rPeriod(p.gran, iso(new Date(d.getFullYear(), d.getMonth() + months * dir, 1)));
}

const NON_ESSENTIAL = ['superfluo', 'lazer', 'restaurante', 'cafe', 'entretenimento', 'delivery', 'bar', 'hamburguer', 'lanche', 'ferias', 'viagem', 'viagens', 'presente', 'compras', 'shopping', 'games', 'jogos', 'streaming', 'assinatura', 'leisure', 'restaurants', 'restaurant', 'coffee', 'gifts', 'travel', 'vacation', 'fun', 'entertainment', 'takeout'];
const NON_ESSENTIAL_NOTE = ['ifood', 'uber eats', 'rappi', 'hamburguer', 'pizza', 'cerveja', 'chopp', 'bar ', 'sorvete', 'doce', 'netflix', 'spotify', 'disney', 'hbo', 'prime video', 'cinema', 'show', 'steam', 'playstation', 'xbox', 'lanche', 'mcdonald', 'burger', 'starbucks'];

export function isEssential(c?: Category) {
  if (!c) return true;
  if (c.essential !== undefined) return c.essential;
  const n = fold(c.name);
  return !NON_ESSENTIAL.some((w) => n.includes(w));
}

function sumBy<T>(arr: T[], f: (x: T) => number) {
  return arr.reduce((a, x) => a + f(x), 0);
}

export interface Insight { tone: 'good' | 'warn' | 'info'; icon: string; title: string; text: string }

export interface Report {
  period: RPeriod;
  income: number;
  expense: number;
  saved: number;
  rate: number; // % of income saved
  prev: { income: number; expense: number; saved: number };
  netWorthStart: number;
  netWorthEnd: number;
  cats: { id: string; cat?: Category; v: number; share: number; prev: number; avg: number; count: number }[];
  incomeCats: { id: string; cat?: Category; v: number; share: number }[];
  topTx: Tx[];
  nonEssential: number;
  nonEssentialCats: { id: string; cat?: Category; v: number }[];
  fixed: { name: string; avg: number; months: number; categoryId: string }[];
  months: { key: string; income: number; expense: number }[];
  daily: number;
  biggestDay: { date: string; v: number } | null;
  projection: number | null;
  days: number;
  insights: Insight[];
}

export function buildReport(s: State, p: RPeriod, t: (k: any, v?: Record<string, string>) => string, fmt: (c: number) => string): Report {
  const inP = (x: Tx, q: { start: string; end: string }) => x.date >= q.start && x.date <= q.end;
  const catById = new Map(s.categories.map((c) => [c.id, c]));
  const txs = s.txs.filter((x) => inP(x, p));
  const exp = txs.filter((x) => x.kind === 'expense');
  const inc = txs.filter((x) => x.kind === 'income');
  const income = sumBy(inc, (x) => x.base);
  const expense = sumBy(exp, (x) => x.base);
  const pp = rShift(p, -1);
  const ptx = s.txs.filter((x) => inP(x, pp));
  const prev = { income: sumBy(ptx.filter((x) => x.kind === 'income'), (x) => x.base), expense: sumBy(ptx.filter((x) => x.kind === 'expense'), (x) => x.base), saved: 0 };
  prev.saved = prev.income - prev.expense;

  // average of the 6 previous periods, per category
  const hist: Map<string, number>[] = [];
  let hp = p;
  for (let i = 0; i < 6; i++) {
    hp = rShift(hp, -1);
    const m = new Map<string, number>();
    for (const x of s.txs) if (x.kind === 'expense' && inP(x, hp)) m.set(x.categoryId, (m.get(x.categoryId) ?? 0) + x.base);
    hist.push(m);
  }
  const histActive = hist.filter((m) => m.size > 0);
  const avgOf = (id: string) => (histActive.length ? sumBy(histActive, (m) => m.get(id) ?? 0) / histActive.length : 0);
  const prevMap = hist[0];

  const cm = new Map<string, { v: number; count: number }>();
  for (const x of exp) {
    const e = cm.get(x.categoryId) ?? { v: 0, count: 0 };
    e.v += x.base; e.count++;
    cm.set(x.categoryId, e);
  }
  const cats = [...cm.entries()].map(([id, e]) => ({ id, cat: catById.get(id), v: e.v, count: e.count, share: expense ? (e.v / expense) * 100 : 0, prev: prevMap.get(id) ?? 0, avg: avgOf(id) })).sort((a, b) => b.v - a.v);
  const im = new Map<string, number>();
  for (const x of inc) im.set(x.categoryId, (im.get(x.categoryId) ?? 0) + x.base);
  const incomeCats = [...im.entries()].map(([id, v]) => ({ id, cat: catById.get(id), v, share: income ? (v / income) * 100 : 0 })).sort((a, b) => b.v - a.v);

  const topTx = [...exp].sort((a, b) => b.base - a.base).slice(0, 8);

  // non-essential spending: by category flag, plus clearly discretionary notes in essential categories
  const neCats = new Map<string, number>();
  let nonEssential = 0;
  for (const x of exp) {
    const c = catById.get(x.categoryId);
    const note = fold(' ' + x.note + ' ');
    if (!isEssential(c) || NON_ESSENTIAL_NOTE.some((w) => note.includes(w))) {
      nonEssential += x.base;
      neCats.set(x.categoryId, (neCats.get(x.categoryId) ?? 0) + x.base);
    }
  }
  const nonEssentialCats = [...neCats.entries()].map(([id, v]) => ({ id, cat: catById.get(id), v })).sort((a, b) => b.v - a.v);

  // fixed costs / subscriptions: same note & category in >= 3 of the last 4 months with similar value
  const endMonth = parseIso(p.end > today() ? today() : p.end);
  const last4: string[] = [];
  for (let i = 0; i < 4; i++) { const d = new Date(endMonth.getFullYear(), endMonth.getMonth() - i, 1); last4.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }
  const groups = new Map<string, { months: Set<string>; vals: number[]; name: string; categoryId: string }>();
  for (const x of s.txs) {
    if (x.kind !== 'expense' || !x.note.trim() || !last4.includes(x.date.slice(0, 7))) continue;
    const k = x.categoryId + '|' + fold(x.note.trim());
    const g = groups.get(k) ?? { months: new Set(), vals: [], name: x.note.trim(), categoryId: x.categoryId };
    g.months.add(x.date.slice(0, 7)); g.vals.push(x.base);
    groups.set(k, g);
  }
  const fixed = [...groups.values()].filter((g) => {
    if (g.months.size < 3) return false;
    const avg = sumBy(g.vals, (v) => v) / g.vals.length;
    return g.vals.every((v) => Math.abs(v - avg) <= avg * 0.35) && g.vals.length <= g.months.size * 2;
  }).map((g) => ({ name: g.name, categoryId: g.categoryId, months: g.months.size, avg: Math.round(sumBy(g.vals, (v) => v) / g.vals.length) })).sort((a, b) => b.avg - a.avg).slice(0, 8);

  // monthly breakdown (quarter / year)
  const months: Report['months'] = [];
  if (p.gran !== 'month') {
    const d = parseIso(p.start);
    const n = p.gran === 'quarter' ? 3 : 12;
    for (let i = 0; i < n; i++) {
      const m = new Date(d.getFullYear(), d.getMonth() + i, 1);
      const key = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
      const mt = txs.filter((x) => x.date.startsWith(key));
      months.push({ key, income: sumBy(mt.filter((x) => x.kind === 'income'), (x) => x.base), expense: sumBy(mt.filter((x) => x.kind === 'expense'), (x) => x.base) });
    }
  }

  const now = today();
  const elapsedEnd = p.end < now ? p.end : now;
  const days = Math.max(1, Math.round((parseIso(elapsedEnd).getTime() - parseIso(p.start).getTime()) / 864e5) + 1);
  const totalDays = Math.round((parseIso(p.end).getTime() - parseIso(p.start).getTime()) / 864e5) + 1;
  const expPast = sumBy(exp.filter((x) => x.date <= now), (x) => x.base);
  const daily = expPast / days;
  const dm = new Map<string, number>();
  for (const x of exp) dm.set(x.date, (dm.get(x.date) ?? 0) + x.base);
  const bd = [...dm.entries()].sort((a, b) => b[1] - a[1])[0];
  const isCurrent = p.start <= now && now <= p.end;
  const projection = isCurrent ? Math.round(daily * totalDays) : null;

  const netWorthEnd = totalBalance(s, balances(s, elapsedEnd));
  const netWorthStart = totalBalance(s, balances(s, addDays(p.start, -1)));

  const saved = income - expense;
  const rate = income ? (saved / income) * 100 : 0;

  // ---------- insights ----------
  const ins: Insight[] = [];
  if (income || expense) {
    if (saved >= 0) ins.push({ tone: 'good', icon: 'piggy-bank', title: t('rSavedTitle', { v: fmt(saved) }), text: t('rSavedText', { r: String(Math.round(rate)) }) });
    else ins.push({ tone: 'warn', icon: 'trend-down', title: t('rDeficitTitle', { v: fmt(-saved) }), text: t('rDeficitText') });
  }
  if (prev.expense > 0 && expense > 0 && !isCurrent) {
    const ch = ((expense - prev.expense) / prev.expense) * 100;
    if (Math.abs(ch) >= 10) ins.push({ tone: ch > 0 ? 'warn' : 'good', icon: ch > 0 ? 'trend-up' : 'trend-down', title: t(ch > 0 ? 'rSpentMore' : 'rSpentLess', { p: String(Math.abs(Math.round(ch))) }), text: t('rVsPrev', { v: fmt(prev.expense) }) });
  }
  if (projection !== null && prev.expense > 0 && days >= 5) {
    ins.push({ tone: projection > prev.expense * 1.1 ? 'warn' : 'info', icon: 'chart-line-up', title: t('rProjection', { v: fmt(projection) }), text: t('rProjectionText', { d: fmt(Math.round(daily)) }) });
  }
  for (const c of cats.slice(0, 12)) {
    if (c.avg > 0 && c.v > c.avg * 1.3 && c.v - c.avg > Math.max(expense * 0.03, 5000)) {
      ins.push({ tone: 'warn', icon: c.cat?.icon ?? 'warning', title: t('rCatUp', { c: c.cat?.name ?? '—', p: ((c.v - c.avg) / c.avg) * 100 > 300 ? '300+' : String(Math.round(((c.v - c.avg) / c.avg) * 100)) }), text: t('rCatUpText', { v: fmt(c.v), a: fmt(Math.round(c.avg)) }) });
    }
  }
  if (p.gran === 'month') {
    for (const c of s.categories) {
      if (!c.budget) continue;
      const v = cm.get(c.id)?.v ?? 0;
      if (v > c.budget) ins.push({ tone: 'warn', icon: c.icon, title: t('rOverBudget', { c: c.name }), text: t('rOverBudgetText', { v: fmt(v - c.budget), b: fmt(c.budget) }) });
    }
  }
  if (nonEssential > 0 && expense > 0) {
    const share = (nonEssential / expense) * 100;
    ins.push({ tone: share > 30 ? 'warn' : 'info', icon: 'hamburger', title: t('rNonEss', { v: fmt(nonEssential), p: String(Math.round(share)) }), text: share > 30 ? t('rNonEssHigh') : t('rNonEssOk') });
  }
  if (cats[0] && cats[0].share >= 25) ins.push({ tone: 'info', icon: cats[0].cat?.icon ?? 'info', title: t('rConcentration', { c: cats[0].cat?.name ?? '—', p: String(Math.round(cats[0].share)) }), text: t('rConcentrationText') });
  if (fixed.length) ins.push({ tone: 'info', icon: 'repeat', title: t('rFixed', { n: String(fixed.length), v: fmt(sumBy(fixed, (f) => f.avg)) }), text: t('rFixedText') });
  if (netWorthEnd !== netWorthStart) ins.push({ tone: netWorthEnd >= netWorthStart ? 'good' : 'warn', icon: 'bank', title: t(netWorthEnd >= netWorthStart ? 'rWorthUp' : 'rWorthDown', { v: fmt(Math.abs(netWorthEnd - netWorthStart)) }), text: t('rWorthText', { v: fmt(netWorthEnd) }) });

  return { period: p, income, expense, saved, rate, prev, netWorthStart, netWorthEnd, cats, incomeCats, topTx, nonEssential, nonEssentialCats, fixed, months, daily, biggestDay: bd ? { date: bd[0], v: bd[1] } : null, projection, days, insights: ins };
}
