import type { State } from './types';
import { addDays, parseIso, today } from './calc';
import { scheduleReminders, Reminder } from '../native';
import { detectLang } from './defaults';

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

/** Upcoming bills: the next planned occurrence of each recurring series. */
export function upcomingBills(s: State) {
  const now = today();
  const next = new Map<string, State['txs'][number]>();
  for (const t of s.txs) {
    if (!t.series || t.date <= now || t.done) continue;
    const cur = next.get(t.series);
    if (!cur || t.date < cur.date) next.set(t.series, t);
  }
  return [...next.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function syncReminders(s: State) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!s.settings.billReminders) { scheduleReminders([]); return; }
    const pt = (s.settings.lang === 'auto' ? detectLang() : s.settings.lang) === 'pt';
    const out: Reminder[] = [];
    const now = Date.now();
    for (const t of upcomingBills(s)) {
      if (t.remind === undefined || t.remind < 0) continue;
      const day = addDays(t.date, -t.remind);
      const at = parseIso(day);
      at.setHours(9, 0, 0, 0);
      if (at.getTime() <= now) continue;
      const cat = s.categories.find((c) => c.id === t.categoryId);
      const acc = s.accounts.find((a) => a.id === t.accountId);
      const amount = new Intl.NumberFormat(pt ? 'pt-BR' : 'en-US', { style: 'currency', currency: acc?.currency ?? s.settings.baseCurrency }).format(t.amount / 100);
      const when = t.remind === 0 ? (pt ? 'hoje' : 'today') : t.remind === 1 ? (pt ? 'amanhã' : 'tomorrow') : (pt ? `em ${t.remind} dias` : `in ${t.remind} days`);
      const name = t.note || cat?.name || '';
      out.push({
        id: hash(t.id),
        title: t.kind === 'income' ? (pt ? `A receber ${when}: ${name}` : `Coming in ${when}: ${name}`) : (pt ? `Conta vence ${when}: ${name}` : `Bill due ${when}: ${name}`),
        body: `${amount} · ${acc?.name ?? ''}`,
        at,
      });
    }
    scheduleReminders(out);
  }, 1200);
}
