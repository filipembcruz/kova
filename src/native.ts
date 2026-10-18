import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { App as CapApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';

export const isNative = () => Capacitor.isNativePlatform();

export async function saveTextFile(name: string, content: string, mime: string, title: string) {
  if (isNative()) {
    const res = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title, files: [res.uri], dialogTitle: title });
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
  getInsets(): Promise<Insets>;
  addListener(ev: 'insets', cb: (i: Insets) => void): Promise<{ remove: () => void }>;
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

export function tap() {
  if (!isNative()) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

// ---------- automatic backups ----------
// Snapshots go to the app's private files dir, which Android's own backup
// (Google Drive) includes, so they survive a phone change / reinstall.
const BK_DIR = 'backups';
const KEEP = 10;

export async function writeAutoBackup(json: string, day: string): Promise<boolean> {
  if (!isNative()) {
    try { localStorage.setItem('kova-autobackup', json); } catch { /* ignore */ }
    return true;
  }
  await Filesystem.writeFile({ path: `${BK_DIR}/kova-${day}.json`, data: json, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  try {
    const list = await Filesystem.readdir({ path: BK_DIR, directory: Directory.Data });
    const names = list.files.map((f: any) => (typeof f === 'string' ? f : f.name)).filter((n: string) => n.startsWith('kova-')).sort();
    for (const old of names.slice(0, Math.max(0, names.length - KEEP))) {
      await Filesystem.deleteFile({ path: `${BK_DIR}/${old}`, directory: Directory.Data });
    }
  } catch { /* ignore */ }
  return true;
}

export async function listAutoBackups(): Promise<string[]> {
  if (!isNative()) {
    try { return localStorage.getItem('kova-autobackup') ? ['kova-latest.json'] : []; } catch { return []; }
  }
  try {
    const list = await Filesystem.readdir({ path: BK_DIR, directory: Directory.Data });
    return list.files.map((f: any) => (typeof f === 'string' ? f : f.name)).filter((n: string) => n.startsWith('kova-')).sort().reverse();
  } catch {
    return [];
  }
}

export async function readAutoBackup(name: string): Promise<string | null> {
  if (!isNative()) {
    try { return localStorage.getItem('kova-autobackup'); } catch { return null; }
  }
  const r = await Filesystem.readFile({ path: `${BK_DIR}/${name}`, directory: Directory.Data, encoding: Encoding.UTF8 });
  return typeof r.data === 'string' ? r.data : await (r.data as Blob).text();
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
export async function openBlob(blob: Blob, name: string, base64: () => Promise<string>) {
  if (isNative()) {
    const res = await Filesystem.writeFile({ path: name, data: await base64(), directory: Directory.Cache });
    await Share.share({ title: name, files: [res.uri] });
    return;
  }
  window.open(URL.createObjectURL(blob), '_blank');
}

// ---------- backups that survive uninstall (public Documents/Kova) ----------
export async function writePublicBackup(json: string) {
  if (!isNative()) return false;
  try {
    await Filesystem.writeFile({ path: 'Kova/kova-backup.json', data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    return true;
  } catch {
    return false;
  }
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
