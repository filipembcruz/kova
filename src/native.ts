import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';

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

const SystemColor = registerPlugin<{ set(o: { color: string; dark: boolean }): Promise<void> }>('SystemColor');

/** Matches status bar + navigation bar to the app background (native plugin in android-src/). */
export async function setStatusBar(dark: boolean, color: string) {
  if (!isNative()) return;
  try {
    await SystemColor.set({ color, dark });
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
      root.style.setProperty('--kb', shrunk ? '0px' : `${info.keyboardHeight}px`);
      reveal();
    });
    Keyboard.addListener('keyboardDidShow', () => reveal());
    Keyboard.addListener('keyboardWillHide', () => root.style.setProperty('--kb', '0px'));
  } else if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', reveal);
  }
  document.addEventListener('focusin', () => setTimeout(reveal, 300));
}
