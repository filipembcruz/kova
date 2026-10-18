import type { Account, Kind, State, Tx } from './types';

export function balances(s: State): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of s.accounts) m.set(a.id, a.initial);
  for (const t of s.txs) m.set(t.accountId, (m.get(t.accountId) ?? 0) + (t.kind === 'income' ? t.amount : -t.amount));
  for (const t of s.transfers) {
    m.set(t.from, (m.get(t.from) ?? 0) - t.fromAmount);
    m.set(t.to, (m.get(t.to) ?? 0) + t.toAmount);
  }
  return m;
}

export function rate(s: State, cur: string) {
  if (cur === s.settings.baseCurrency) return 1;
  return s.settings.rates[cur] ?? 1;
}

export const toBase = (s: State, amount: number, cur: string) => Math.round(amount * rate(s, cur));
export const fromBase = (s: State, amount: number, cur: string) => Math.round(amount / rate(s, cur));

export function totalBalance(s: State, bal = balances(s)) {
  let t = 0;
  for (const a of s.accounts) if (a.includeInTotal && !a.archived) t += toBase(s, bal.get(a.id) ?? 0, a.currency);
  return t;
}

// ---------- dates ----------
export const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => iso(new Date());
export const addDays = (s: string, n: number) => {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};

export type Gran = 'day' | 'week' | 'month' | 'year' | 'custom';
export interface Period {
  gran: Gran;
  start: string; // inclusive
  end: string; // inclusive
}

export function periodOf(gran: Gran, anchor: string, weekStart: 0 | 1 = 1): Period {
  const d = parseIso(anchor);
  if (gran === 'day') return { gran, start: anchor, end: anchor };
  if (gran === 'week') {
    const diff = (d.getDay() - weekStart + 7) % 7;
    const st = addDays(anchor, -diff);
    return { gran, start: st, end: addDays(st, 6) };
  }
  if (gran === 'month') {
    const st = new Date(d.getFullYear(), d.getMonth(), 1);
    const en = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { gran, start: iso(st), end: iso(en) };
  }
  if (gran === 'year') return { gran, start: `${d.getFullYear()}-01-01`, end: `${d.getFullYear()}-12-31` };
  return { gran, start: anchor, end: anchor };
}

export function shiftPeriod(p: Period, dir: number, weekStart: 0 | 1 = 1): Period {
  if (p.gran === 'day') return periodOf('day', addDays(p.start, dir));
  if (p.gran === 'week') return periodOf('week', addDays(p.start, 7 * dir), weekStart);
  if (p.gran === 'month') {
    const d = parseIso(p.start);
    return periodOf('month', iso(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
  }
  if (p.gran === 'year') {
    const d = parseIso(p.start);
    return periodOf('year', `${d.getFullYear() + dir}-01-01`);
  }
  const len = Math.round((parseIso(p.end).getTime() - parseIso(p.start).getTime()) / 864e5) + 1;
  return { gran: 'custom', start: addDays(p.start, len * dir), end: addDays(p.end, len * dir) };
}

export const inPeriod = (date: string, p: { start: string; end: string }) => date >= p.start && date <= p.end;

export function filterTx(s: State, p: { start: string; end: string }, kind?: Kind, accountId?: string) {
  return s.txs.filter((t) => inPeriod(t.date, p) && (!kind || t.kind === kind) && (!accountId || t.accountId === accountId));
}

/** Value of a tx for reports: base currency amount */
export const txValue = (t: Tx) => t.base;

export function sum(txs: Tx[]) {
  return txs.reduce((a, t) => a + t.base, 0);
}

export function byCategory(txs: Tx[]) {
  const m = new Map<string, number>();
  for (const t of txs) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.base);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function lastMonths(n: number, endIso = today()) {
  const d = parseIso(endIso);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${pad(x.getMonth() + 1)}`);
  }
  return out;
}

export function accountsSorted(accs: Account[]) {
  return [...accs].sort((a, b) => Number(a.archived) - Number(b.archived) || a.order - b.order);
}

export function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Simple calculator expression evaluator for the keypad: supports + - × ÷ and decimals */
export function evalExpr(expr: string): number | null {
  const s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/\s/g, '');
  if (!s) return 0;
  if (!/^[0-9.+\-*/]+$/.test(s)) return null;
  const tokens = s.match(/(\d+\.?\d*|\.\d+|[+\-*/])/g);
  if (!tokens) return null;
  // shunting-yard light: handle * / first
  const nums: number[] = [];
  const ops: string[] = [];
  let expectNum = true;
  for (const tk of tokens) {
    if (/[+\-*/]/.test(tk)) {
      if (expectNum) return null;
      ops.push(tk);
      expectNum = true;
    } else {
      let v = parseFloat(tk);
      if (ops.length && (ops[ops.length - 1] === '*' || ops[ops.length - 1] === '/')) {
        const op = ops.pop()!;
        const a = nums.pop()!;
        v = op === '*' ? a * v : v === 0 ? NaN : a / v;
      }
      nums.push(v);
      expectNum = false;
    }
  }
  if (expectNum && ops.length) ops.pop();
  let r = nums[0] ?? 0;
  for (let i = 0; i < ops.length; i++) r = ops[i] === '+' ? r + nums[i + 1] : r - nums[i + 1];
  return Number.isFinite(r) ? Math.round(r * 100) / 100 : null;
}
