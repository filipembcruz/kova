// Automatic entries from bank notifications.
// Native side (android-src/NotifEngine.java) reads the notifications, decides and queues;
// here we send it what it needs to decide (the "brain") and merge the queue into the data.
import { useSyncExternalStore } from 'react';
import type { State, Tx, Transfer, Kind } from './types';
import { getState, setState } from './store';
import { addDays, rate, toBase, today, uid } from './calc';
import { getT, resolveLang } from '../i18n';
import { isNative, getNotifQueue, ackNotif, setNotifBrain, onNotifEvent } from '../native';

export interface NotifItem {
  id: string;
  pkg: string;
  app: string;
  raw: string;
  cents: number; // in the currency of the message
  cur: string;
  amt: number; // in the account's currency
  acc: string;
  kind: Kind;
  merchant: string;
  mkey: string;
  tpl: string;
  cat: string;
  note: string;
  date: string;
  ts: number;
  dup?: boolean;
  curOk?: boolean;
  status: 'pending' | 'auto' | 'confirmed' | 'ignored' | 'undone';
  late?: boolean;
}

export const AUTO_AFTER = 3;

export function defaultCategory(s: State, kind: Kind) {
  const list = s.categories.filter((c) => c.kind === kind && !c.archived).sort((a, b) => a.order - b.order);
  return (list.find((c) => c.icon === 'question') ?? list[list.length - 1])?.id ?? '';
}

/** Everything the native reader needs to decide without the app open. */
export function buildBrain(s: State) {
  const t = getT();
  const n = s.settings.notif;
  const curs = new Set<string>([s.settings.baseCurrency, ...s.accounts.map((a) => a.currency), ...Object.keys(s.settings.rates)]);
  const rates: Record<string, number> = {};
  for (const c of curs) rates[c] = rate(s, c);
  const since = addDays(today(), -4);
  return {
    on: !!n?.on,
    locale: resolveLang(s.settings.lang) === 'pt' ? 'pt-BR' : 'en-US',
    autoAfter: AUTO_AFTER,
    apps: n?.apps ?? {},
    accounts: Object.fromEntries(s.accounts.filter((a) => !a.archived).map((a) => [a.id, { name: a.name, cur: a.currency }])),
    cats: Object.fromEntries(s.categories.map((c) => [c.id, { name: c.name }])),
    merchants: s.merchants ?? {},
    blocked: s.notifBlocked ?? {},
    rates,
    defaultCat: { expense: defaultCategory(s, 'expense'), income: defaultCategory(s, 'income') },
    recent: s.txs.filter((x) => x.date >= since).map((x) => `${x.accountId}|${x.amount}|${x.date}`),
    labels: {
      confirm: t('nConfirm'), edit: t('nEdit'), notTx: t('nNotTx'), undo: t('nUndo'), added: t('nAdded'),
      question: t('nQuestion'), dup: t('nDup'), from: t('nFrom'), chTx: t('nChTx'), chStatus: t('nChStatus'),
    },
  };
}

let brainTimer: ReturnType<typeof setTimeout> | undefined;
export function pushBrain(s: State) {
  if (!isNative()) return;
  clearTimeout(brainTimer);
  brainTimer = setTimeout(() => { setNotifBrain(JSON.stringify(buildBrain(s))); }, 800);
}

// ---------- pending items (for the "To confirm" card) ----------
let pending: NotifItem[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export function usePendingNotifs() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => pending);
}

// Browser preview: a fake queue in localStorage (lets the flow be tested without a phone)
const MOCK = 'kova-notif-mock';
async function readQueue(): Promise<NotifItem[]> {
  if (isNative()) {
    try { return JSON.parse((await getNotifQueue()) || '[]'); } catch { return []; }
  }
  try { return JSON.parse(localStorage.getItem(MOCK) || '[]'); } catch { return []; }
}
async function ack(ids: string[]) {
  if (!ids.length) return;
  if (isNative()) return ackNotif(JSON.stringify(ids));
  try {
    const q = JSON.parse(localStorage.getItem(MOCK) || '[]') as NotifItem[];
    localStorage.setItem(MOCK, JSON.stringify(q.filter((x) => !ids.includes(x.id))));
  } catch { /* ignore */ }
}

const mKey = (kind: Kind, mkey: string) => `${kind}|${mkey}`;

/** Remember what the user did with this merchant: same choice again → more confidence. */
function learn(st: State, it: NotifItem, tx: { categoryId: string; note: string; accountId: string } | null, how: 'confirm' | 'edit' | 'undo'): State {
  if (!it.mkey) return st;
  const k = mKey(it.kind, it.mkey);
  const merchants = { ...(st.merchants ?? {}) };
  const cur = merchants[k];
  if (how === 'undo') {
    if (cur) merchants[k] = { ...cur, n: 0 };
  } else if (tx) {
    const same = cur && cur.cat === tx.categoryId && cur.note === tx.note && cur.acc === tx.accountId;
    merchants[k] = { cat: tx.categoryId, note: tx.note, acc: tx.accountId, n: same ? (cur?.n ?? 0) + 1 : 1, name: it.merchant };
  }
  return { ...st, merchants };
}

function block(st: State, it: NotifItem): State {
  const b = { ...(st.notifBlocked ?? {}) };
  const list = new Set(b[it.pkg] ?? []);
  if (it.tpl) list.add(it.tpl);
  b[it.pkg] = [...list].slice(-150);
  return { ...st, notifBlocked: b };
}

function txFrom(st: State, it: NotifItem, override?: Partial<Tx>): Tx {
  const acc = st.accounts.find((a) => a.id === it.acc);
  const cur = acc?.currency ?? st.settings.baseCurrency;
  const foreign = it.cur && it.cur !== cur;
  const t = getT();
  const note = (it.note || it.merchant || '') + (foreign ? ` (${t('nOrig')} ${it.cur} ${(it.cents / 100).toFixed(2)})` : '');
  return {
    id: uid(), kind: it.kind, accountId: it.acc, categoryId: it.cat || defaultCategory(st, it.kind), amount: it.amt,
    base: toBase(st, it.amt, cur), date: it.date, note: note.trim(), tags: [], created: new Date(it.ts || Date.now()).toISOString(),
    src: 'notif', nid: it.id, ...override,
  };
}

/** Money leaving one of your accounts and arriving in another a few minutes later is a transfer. */
function pairTransfer(st: State, tx: Tx): State {
  const other = st.txs.find((x) => x.src === 'notif' && x.id !== tx.id && x.kind !== tx.kind && x.accountId !== tx.accountId
    && x.date === tx.date && Math.abs(x.base - tx.base) <= Math.max(2, tx.base * 0.01)
    && Math.abs(new Date(x.created).getTime() - new Date(tx.created).getTime()) < 60 * 60_000);
  if (!other) return st;
  const out = tx.kind === 'expense' ? tx : other;
  const inn = tx.kind === 'expense' ? other : tx;
  const tr: Transfer = { id: uid(), from: out.accountId, to: inn.accountId, fromAmount: out.amount, toAmount: inn.amount, date: out.date, note: '', created: out.created };
  return { ...st, txs: st.txs.filter((x) => x.id !== out.id && x.id !== inn.id), transfers: [tr, ...st.transfers] };
}

function addTx(st: State, tx: Tx): State {
  let next = { ...st, txs: [tx, ...st.txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.created < b.created ? 1 : -1)) };
  next = pairTransfer(next, tx);
  return next;
}

/** Merge what the native reader queued. Pending items stay for the user to decide. */
export async function syncNotifs() {
  const q = await readQueue();
  const done: string[] = [];
  const keep: NotifItem[] = [];
  let changed = false;
  let st = getState();
  for (const it of q) {
    if (it.status === 'pending') {
      if (st.accounts.some((a) => a.id === it.acc)) keep.push(it); else done.push(it.id);
      continue;
    }
    done.push(it.id);
    if (it.status === 'auto' || it.status === 'confirmed') {
      if (st.txs.some((x) => x.nid === it.id)) continue;
      if (!st.accounts.some((a) => a.id === it.acc)) continue;
      const tx = txFrom(st, it);
      st = addTx(st, tx);
      if (it.status === 'confirmed') st = learn(st, it, tx, 'confirm');
      changed = true;
    } else if (it.status === 'ignored') {
      st = block(st, it);
      changed = true;
    } else if (it.status === 'undone') {
      const tx = st.txs.find((x) => x.nid === it.id);
      if (tx) {
        st = { ...st, txs: st.txs.filter((x) => x.id !== tx.id) };
        st = learn(st, { ...it, kind: tx.kind, mkey: it.mkey || '' }, null, 'undo');
        changed = true;
      }
    }
  }
  if (changed) {
    const final = st;
    setState(() => final);
  }
  pending = keep.sort((a, b) => b.ts - a.ts);
  emit();
  await ack(done);
}

/** In-app decisions on a pending item. */
export async function confirmNotif(it: NotifItem, override?: Partial<Tx>) {
  let st = getState();
  const tx = txFrom(st, it, override);
  st = addTx(st, tx);
  st = learn(st, it, tx, override ? 'edit' : 'confirm');
  const final = st;
  setState(() => final);
  pending = pending.filter((x) => x.id !== it.id);
  emit();
  await ack([it.id]);
}

export async function ignoreNotif(it: NotifItem) {
  const final = block(getState(), it);
  setState(() => final);
  pending = pending.filter((x) => x.id !== it.id);
  emit();
  await ack([it.id]);
}

export function findPending(id: string) {
  return pending.find((x) => x.id === id);
}

let started = false;
export function startNotifSync() {
  if (started) return;
  started = true;
  syncNotifs();
  onNotifEvent(() => syncNotifs());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNotifs(); });
}

/** Browser preview only: put a fake detection in the queue. */
export function mockNotif(item: Partial<NotifItem>) {
  const q = JSON.parse(localStorage.getItem(MOCK) || '[]');
  q.push({ id: uid(), pkg: 'com.nu.production', app: 'Nubank', raw: '', cents: 0, cur: 'BRL', amt: 0, acc: '', kind: 'expense', merchant: '', mkey: '', tpl: '', cat: '', note: '', date: today(), ts: Date.now(), status: 'pending', ...item });
  localStorage.setItem(MOCK, JSON.stringify(q));
}
if (typeof window !== 'undefined' && !isNative()) (window as any).__kovaMockNotif = mockNotif;
