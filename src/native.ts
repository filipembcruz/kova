import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { App as CapApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';

export const isNative = () => Capacitor.isNativePlatform();

// Large strings are written in slices: one huge message through the native bridge can run the
// phone out of memory and close the app (that was the backup crash).
const CHUNK = 256 * 1024;
async function writeTextChunked(path: string, directory: Directory, text: string) {
  const tmp = `${path}.${Date.now()}.part`;
  let i = 0, first = true;
  while (first || i < text.length) {
    let end = Math.min(i + CHUNK, text.length);
    const c = text.charCodeAt(end - 1);
    if (end < text.length && c >= 0xd800 && c <= 0xdbff) end--; // never split an emoji
    const data = text.slice(i, end);
    if (first) await Filesystem.writeFile({ path: tmp, data, directory, encoding: Encoding.UTF8, recursive: true });
    else await Filesystem.appendFile({ path: tmp, data, directory, encoding: Encoding.UTF8 });
    first = false;
    i = end;
  }
  try { await Filesystem.deleteFile({ path, directory }); } catch { /* not there yet */ }
  await Filesystem.rename({ from: tmp, to: path, directory, toDirectory: directory });
  return (await Filesystem.getUri({ path, directory })).uri;
}

async function writeBlobChunked(path: string, directory: Directory, blob: Blob) {
  const step = 192 * 1024; // multiple of 3 bytes -> clean base64 slices
  for (let i = 0; i === 0 || i < blob.size; i += step) {
    const data = await blobB64(blob.slice(i, i + step));
    if (i === 0) await Filesystem.writeFile({ path, data, directory, recursive: true });
    else await Filesystem.appendFile({ path, data, directory });
  }
  return (await Filesystem.getUri({ path, directory })).uri;
}

function blobB64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(b);
  });
}

/** Reads a file of the app through the WebView (no bridge copy), falling back to the plugin. */
async function readTextFile(path: string, directory: Directory): Promise<string> {
  try {
    const { uri } = await Filesystem.getUri({ path, directory });
    const r = await fetch(Capacitor.convertFileSrc(uri));
    if (r.ok) return await r.text();
  } catch { /* fallback */ }
  const r = await Filesystem.readFile({ path, directory, encoding: Encoding.UTF8 });
  return typeof r.data === 'string' ? r.data : await (r.data as Blob).text();
}

const safeName = (n: string) => n.replace(/[^\w.\-]+/g, '_').slice(-80) || 'file';

export async function saveTextFile(name: string, content: string, mime: string, title: string, text?: string) {
  if (isNative()) {
    const uri = await writeTextChunked(`share/${safeName(name)}`, Directory.Cache, content);
    try {
      await Share.share({ title, text, files: [uri], dialogTitle: title });
    } catch { /* user closed the share sheet */ }
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept = '*/*'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}

type Insets = { top?: number; bottom?: number; ime?: number };
const SystemColor = registerPlugin<{
  set(o: { color: string; dark: boolean; navDark?: boolean }): Promise<void>;
  openFile(o: { path: string; mime: string }): Promise<void>;
  biometricAvailable(): Promise<{ available: boolean }>;
  setWidget(o: { data: string }): Promise<void>;
  notifStatus(): Promise<{ access: boolean; post: boolean; battery: boolean }>;
  openNotifAccess(): Promise<void>;
  openBattery(): Promise<void>;
  notifSeen(): Promise<{ data: string }>;
  setNotifBrain(o: { data: string }): Promise<void>;
  getNotifQueue(): Promise<{ data: string }>;
  ackNotif(o: { ids: string }): Promise<void>;
  parseTest(o: { title: string; text: string; cur: string }): Promise<{ tx: boolean; cents: number; cur: string; kind: string; merchant: string; reason: string }>;
  setStatusNotif(o: { show: boolean; title: string; text: string; add: string }): Promise<void>;
  notifLog(): Promise<{ data: string }>;
  reprocessNotif(o: { pkg: string; brain: string }): Promise<void>;
  installedApps(o: { pkgs: string }): Promise<{ data: string }>;
  authenticate(o: { title: string; cancel: string }): Promise<void>;
  getInsets(): Promise<Insets>;
  addListener(ev: string, cb: (i: any) => void): Promise<{ remove: () => void }>;
}>('SystemColor');

let nativeInsets = false;
function applyInsets(i: Insets) {
  if (i.top === undefined) return;
  nativeInsets = true;
  const r = document.documentElement.style;
  r.setProperty('--safe-top', `${i.top}px`);
  r.setProperty('--safe-bottom', `${i.bottom ?? 0}px`);
  r.setProperty('--kb', `${i.ime ?? 0}px`);
  if ((i.ime ?? 0) > 0) setTimeout(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 80);
}

/** Edge-to-edge: real system bar insets become CSS variables (native plugin in android-src/). */
export function initInsets() {
  if (!isNative()) return;
  SystemColor.getInsets().then(applyInsets).catch(() => {});
  SystemColor.addListener('insets', applyInsets).catch(() => {});
}

/** Status bar icons light/dark to match the screen behind them. */
export async function setStatusBar(dark: boolean, color: string, navDark?: boolean) {
  if (!isNative()) return;
  try {
    await SystemColor.set({ color, dark, navDark });
  } catch { /* plugin missing */ }
}

let hapticsOn = true;
export function setHaptics(on: boolean) { hapticsOn = on; }
export function tap() {
  if (!isNative() || !hapticsOn) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

// ---------- automatic backups ----------
// Snapshots go to the app's private files dir, which Android's own backup
// (Google Drive) includes, so they survive a phone change / reinstall.
const BK_DIR = 'backups';
const KEEP = 12; // months

export async function writeAutoBackup(json: string, day: string, keepPrevious = false): Promise<boolean> {
  if (!isNative()) {
    try { localStorage.setItem('kova-autobackup', json); } catch { /* ignore */ }
    return true;
  }
  const month = day.slice(0, 7);
  const path = `${BK_DIR}/kova-${month}.json`;
  if (keepPrevious) {
    try { await Filesystem.copy({ from: path, to: `${BK_DIR}/kova-${day}-safety.json`, directory: Directory.Data, toDirectory: Directory.Data }); } catch { /* none yet */ }
  }
  await writeTextChunked(path, Directory.Data, json);
  try {
    const list = await Filesystem.readdir({ path: BK_DIR, directory: Directory.Data });
    const names = list.files.map((f: any) => (typeof f === 'string' ? f : f.name)) as string[];
    // older daily copies from previous versions: the monthly file replaces them
    const daily = names.filter((n) => /^kova-\d{4}-\d{2}-\d{2}\.json$/.test(n));
    const monthly = names.filter((n) => /^kova-\d{4}-\d{2}\.json$/.test(n)).sort();
    const safety = names.filter((n) => n.endsWith('-safety.json')).sort();
    const drop = [...daily, ...monthly.slice(0, Math.max(0, monthly.length - KEEP)), ...safety.slice(0, Math.max(0, safety.length - 3))];
    for (const n of drop) await Filesystem.deleteFile({ path: `${BK_DIR}/${n}`, directory: Directory.Data });
    for (const n of names.filter((x) => x.endsWith('.part'))) await Filesystem.deleteFile({ path: `${BK_DIR}/${n}`, directory: Directory.Data }).catch(() => {});
  } catch { /* ignore */ }
  return true;
}

export interface BackupEntry { name: string; path: string; where: 'app' | 'docs'; size?: number; mtime?: number }

/** Automatic backups: the app's own copies plus the ones in Documents/Kova (those survive a reinstall). */
export async function listAutoBackups(): Promise<BackupEntry[]> {
  if (!isNative()) {
    try { return localStorage.getItem('kova-autobackup') ? [{ name: 'kova-latest.json', path: '', where: 'app' }] : []; } catch { return []; }
  }
  const out: BackupEntry[] = [];
  const scan = async (dir: string, directory: Directory, where: BackupEntry['where']) => {
    try {
      const list = await Filesystem.readdir({ path: dir, directory });
      for (const f of list.files as any[]) {
        const name = typeof f === 'string' ? f : f.name;
        if (!/^kova-.*\.json$/.test(name)) continue;
        out.push({ name, path: `${dir}/${name}`, where, size: f.size, mtime: Number(f.mtime) || undefined });
      }
    } catch { /* folder missing */ }
  };
  await scan(BK_DIR, Directory.Data, 'app');
  await scan('Kova', Directory.Documents, 'docs');
  const key = (e: BackupEntry) => e.mtime ?? Date.parse(e.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '') ?? 0;
  return out.sort((a, b) => key(b) - key(a));
}

export async function readAutoBackup(e: BackupEntry): Promise<string | null> {
  if (!isNative()) {
    try { return localStorage.getItem('kova-autobackup'); } catch { return null; }
  }
  return readTextFile(e.path, e.where === 'app' ? Directory.Data : Directory.Documents);
}

// ---------- keyboard ----------
// Keeps the focused field visible above the on-screen keyboard (edge-to-edge WebViews don't always resize).
export function initKeyboard() {
  const root = document.documentElement;
  const reveal = () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  };
  if (isNative()) {
    Keyboard.addListener('keyboardWillShow', (info: { keyboardHeight: number }) => {
      // only pad if the WebView itself did not shrink
      const shrunk = window.innerHeight < screen.height * 0.75;
      if (!nativeInsets) root.style.setProperty('--kb', shrunk ? '0px' : `${info.keyboardHeight}px`);
      reveal();
    });
    Keyboard.addListener('keyboardDidShow', () => reveal());
    Keyboard.addListener('keyboardWillHide', () => { if (!nativeInsets) root.style.setProperty('--kb', '0px'); });
  } else if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', reveal);
  }
  document.addEventListener('focusin', () => setTimeout(reveal, 300));
}

// ---------- Android back button ----------
export function initBackButton(handler: () => void) {
  if (!isNative()) return;
  CapApp.addListener('backButton', () => handler());
}
export function minimizeApp() {
  if (isNative()) CapApp.minimizeApp().catch(() => {});
}

// ---------- open / share a stored file ----------
async function cacheBlob(blob: Blob, name: string) {
  return writeBlobChunked(`open/${safeName(name)}`, Directory.Cache, blob);
}

/** Opens a PDF / image in the phone's viewer app (Drive PDF viewer, Gallery…). */
export async function openBlob(blob: Blob, name: string, mime: string): Promise<boolean> {
  if (isNative()) {
    const uri = await cacheBlob(blob, name);
    try {
      await SystemColor.openFile({ path: uri, mime: mime || blob.type || '*/*' });
      return true;
    } catch {
      try { await Share.share({ title: name, files: [uri] }); return true; } catch { return false; }
    }
  }
  window.open(URL.createObjectURL(blob), '_blank');
  return true;
}

export async function shareBlob(blob: Blob, name: string) {
  if (isNative()) {
    const uri = await cacheBlob(blob, name);
    try { await Share.share({ title: name, files: [uri], dialogTitle: name }); } catch { /* closed */ }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

// ---------- crash notes written by MainActivity ----------
export async function takeCrashNote(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const txt = await readTextFile('crash.txt', Directory.Data);
    await Filesystem.deleteFile({ path: 'crash.txt', directory: Directory.Data });
    return txt || null;
  } catch {
    return null;
  }
}

// ---------- backups that survive uninstall (public Documents/Kova) ----------
export async function writePublicBackup(json: string, day: string) {
  if (!isNative()) return false;
  const month = day.slice(0, 7);
  // A file left by a previous install can't be overwritten on Android 11+, so fall back to a second name.
  for (const name of [`Kova/kova-${month}.json`, `Kova/kova-${month}-b.json`, `Kova/kova-${day}.json`]) {
    try {
      await writeTextChunked(name, Directory.Documents, json);
      return true;
    } catch { /* try next */ }
  }
  return false;
}

// ---------- bill reminders ----------
export interface Reminder { id: number; title: string; body: string; at: Date }

export async function notificationsAllowed(ask: boolean) {
  if (!isNative()) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && ask) p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  } catch {
    return false;
  }
}

export async function scheduleReminders(list: Reminder[]) {
  if (!isNative()) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!list.length) return;
    if (!(await notificationsAllowed(false))) return;
    await LocalNotifications.schedule({
      notifications: list.slice(0, 60).map((r) => ({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at, allowWhileIdle: true } })),
    });
  } catch { /* ignore */ }
}

// ---------- fingerprint (native plugin in android-src/) ----------
export async function biometricAvailable() {
  if (!isNative()) return false;
  try { return (await SystemColor.biometricAvailable()).available; } catch { return false; }
}
export async function biometricAuth(title: string, cancel: string) {
  if (!isNative()) return false;
  try { await SystemColor.authenticate({ title, cancel }); return true; } catch { return false; }
}

// ---------- home-screen widget + links from it (kova://add?kind=expense, kova://add?sc=ID, kova://home) ----------
export function updateWidget(data: string) {
  if (!isNative()) return;
  SystemColor.setWidget({ data }).catch(() => {});
}
export function initDeepLinks(handler: (url: string) => void) {
  if (!isNative()) return;
  CapApp.addListener('appUrlOpen', (e: { url: string }) => handler(e.url));
  CapApp.getLaunchUrl().then((r: { url?: string } | undefined) => { if (r?.url) handler(r.url); }).catch(() => {});
}

// ---------- bank notifications ----------
export async function notifStatus() {
  if (!isNative()) return { access: false, post: false, battery: true };
  try { return await SystemColor.notifStatus(); } catch { return { access: false, post: false, battery: true }; }
}
export const openNotifAccess = () => { if (isNative()) SystemColor.openNotifAccess().catch(() => {}); };
export const openBattery = () => { if (isNative()) SystemColor.openBattery().catch(() => {}); };
export async function notifSeen(): Promise<Record<string, { label: string; last: number; n: number; sample?: string }>> {
  if (!isNative()) return { 'com.nu.production': { label: 'Nubank', last: Date.now(), n: 12, sample: 'Compra de R$ 35,57 APROVADA em SUPERMERCADO BH' }, 'de.number26.android': { label: 'N26', last: Date.now(), n: 5, sample: 'Pagamento de 6,25 € em Pingo Doce' }, 'com.whatsapp': { label: 'WhatsApp', last: Date.now(), n: 80 } };
  try { return JSON.parse((await SystemColor.notifSeen()).data || '{}'); } catch { return {}; }
}
export function setNotifBrain(data: string) { if (isNative()) SystemColor.setNotifBrain({ data }).catch(() => {}); }
export async function getNotifQueue() { return (await SystemColor.getNotifQueue()).data; }
export async function ackNotif(ids: string) { await SystemColor.ackNotif({ ids }).catch(() => {}); }
export async function parseTest(title: string, text: string, cur: string) {
  if (!isNative()) return null;
  try { return await SystemColor.parseTest({ title, text, cur }); } catch { return null; }
}
export function onNotifEvent(cb: () => void) { if (isNative()) SystemColor.addListener('notif', () => cb()).catch(() => {}); }
export function setStatusNotif(show: boolean, title: string, text: string, add: string) {
  if (isNative()) SystemColor.setStatusNotif({ show, title, text, add }).catch(() => {});
}

export interface NotifLogEntry { pkg: string; app: string; ts: number; text: string; result: string }
export async function notifLog(): Promise<NotifLogEntry[]> {
  if (!isNative()) return [{ pkg: 'de.number26.android', app: 'N26', ts: Date.now() - 60000, text: 'Your payment of €6.76 to CDComercioDe has been successfully processed.', result: 'pending:€ 6,76 · CDComercioDe' }, { pkg: 'com.nu.production', app: 'Nubank', ts: Date.now() - 3600000, text: 'Aproveite: 20% off', result: 'not-tx:promo' }];
  try { return JSON.parse((await SystemColor.notifLog()).data || '[]'); } catch { return []; }
}
export async function reprocessNotif(pkg: string, brain: string) {
  if (isNative()) await SystemColor.reprocessNotif({ pkg, brain }).catch(() => {});
}
export async function installedApps(pkgs: string[]): Promise<Record<string, string>> {
  if (!isNative()) return { 'de.number26.android': 'N26', 'com.revolut.revolut': 'Revolut' };
  try { return JSON.parse((await SystemColor.installedApps({ pkgs: JSON.stringify(pkgs) })).data || '{}'); } catch { return {}; }
}
