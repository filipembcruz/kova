import { useSyncExternalStore, useMemo } from 'react';
import type { State } from './types';
import { initialState, detectLang } from './defaults';
import { balances, totalBalance, ensureRecurring, today } from './calc';
import { writeAutoBackup } from '../native';

const DB_NAME = 'kova';
const STORE = 'kv';
const KEY = 'state-v1';

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    tx.onsuccess = () => res(tx.result as T);
    tx.onerror = () => rej(tx.error);
  });
}
async function idbSet(key: string, val: unknown) {
  const db = await idb();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

let state: State = initialState(detectLang());
let loaded = false;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emit() {
  listeners.forEach((l) => l());
}

export async function loadState() {
  try {
    const s = await idbGet<State>(KEY);
    if (s && s.version === 1) state = migrate(s);
    else {
      // fallback for environments without IndexedDB persistence
      const ls = safeLocal();
      if (ls) state = migrate(JSON.parse(ls));
    }
  } catch {
    const ls = safeLocal();
    if (ls) state = migrate(JSON.parse(ls));
  }
  loaded = true;
  emit();
  await maintenance();
}

/** Daily housekeeping: create next occurrences of recurring items and write the automatic backup. */
export async function maintenance() {
  const next = ensureRecurring(state);
  if (next !== state) {
    state = next;
    emit();
    persist();
  }
  const day = today();
  if (state.settings.onboarded && state.settings.autoBackup && (state.settings.lastBackup ?? '').slice(0, 10) !== day) {
    await backupNow();
  }
}

export async function backupNow() {
  try {
    const json = JSON.stringify({ app: 'kova', version: 1, exported: new Date().toISOString(), state });
    await writeAutoBackup(json, today());
    state = { ...state, settings: { ...state.settings, lastBackup: new Date().toISOString() } };
    emit();
    persist();
    return true;
  } catch {
    return false;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && loaded) maintenance();
  });
}

function safeLocal() {
  try { return localStorage.getItem('kova-' + KEY); } catch { return null; }
}

function migrate(s: State): State {
  const d = initialState(detectLang());
  return { ...d, ...s, settings: { ...d.settings, ...s.settings } };
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    idbSet(KEY, state).catch(() => {
      try { localStorage.setItem('kova-' + KEY, JSON.stringify(state)); } catch { /* ignore */ }
    });
  }, 250);
}

export function getState() {
  return state;
}

export function setState(fn: (s: State) => State) {
  state = ensureRecurring(fn(state));
  emit();
  persist();
}

export function replaceState(s: State) {
  state = migrate(s);
  emit();
  persist();
}

export function isLoaded() {
  return loaded;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, () => state);
}

export function useBalances() {
  const s = useStore();
  const day = today();
  return useMemo(() => {
    const b = balances(s);
    return { bal: b, total: totalBalance(s, b) };
  }, [s.accounts, s.txs, s.transfers, s.settings.rates, s.settings.baseCurrency, day]);
}
