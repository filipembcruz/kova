import { useSyncExternalStore, type ReactNode } from 'react';

// ---------- hash router ----------
export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

function readRoute(): Route {
  const h = location.hash.replace(/^#/, '') || '/';
  const [p, q] = h.split('?');
  const path = p || '/';
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(q || '') };
}

let route = readRoute();
const routeListeners = new Set<() => void>();
const emitRoute = () => {
  const r = readRoute();
  if (r.path + r.query.toString() !== route.path + route.query.toString()) {
    route = r;
    routeListeners.forEach((l) => l());
    window.scrollTo(0, 0);
  }
};

export function useRoute() {
  return useSyncExternalStore(
    (l) => {
      routeListeners.add(l);
      return () => routeListeners.delete(l);
    },
    () => route,
  );
}

export function navigate(to: string, replace = false) {
  const url = '#' + to;
  if (replace) history.replaceState(history.state, '', url);
  else history.pushState({ d: depth() + 1 }, '', url);
  emitRoute();
}

const depth = (): number => (history.state && typeof history.state.d === 'number' ? history.state.d : 0);

export const TABS = ['/', '/accounts', '/charts', '/categories', '/settings'];

export function goTab(path: string) {
  if (route.path === path) return;
  // Back from any tab returns to Home, back from Home exits.
  if (route.path === '/') navigate(path);
  else if (path === '/') {
    const d = depth();
    if (d > 0) history.go(-d);
    else navigate('/', true);
  }
  else navigate(path, TABS.includes(route.path));
}

// ---------- overlays (bottom sheets / dialogs) ----------
export interface Overlay {
  id: number;
  render: (close: () => void) => ReactNode;
  closing?: boolean;
}

let overlays: Overlay[] = [];
let seq = 1;
const ovListeners = new Set<() => void>();
const emitOv = () => ovListeners.forEach((l) => l());

export function useOverlays() {
  return useSyncExternalStore(
    (l) => {
      ovListeners.add(l);
      return () => ovListeners.delete(l);
    },
    () => overlays,
  );
}

export function openOverlay(render: Overlay['render']) {
  const id = seq++;
  overlays = [...overlays, { id, render }];
  history.pushState({ ov: id, d: depth() }, '', location.href);
  emitOv();
  return id;
}

/** Close the top overlay (goes through history so Android back button stays consistent). */
export function closeOverlay() {
  if (overlays.length) history.back();
}

window.addEventListener('popstate', () => {
  const live = overlays.filter((o) => !o.closing);
  if (live.length) {
    const top = live[live.length - 1];
    overlays = overlays.map((o) => (o.id === top.id ? { ...o, closing: true } : o));
    emitOv();
    setTimeout(() => {
      overlays = overlays.filter((o) => o.id !== top.id);
      emitOv();
    }, 220);
    return;
  }
  emitRoute();
});
window.addEventListener('hashchange', emitRoute);

// ---------- toast ----------
let toastMsg: { text: string; id: number } | null = null;
const toastListeners = new Set<() => void>();
export function toast(text: string) {
  toastMsg = { text, id: Date.now() };
  toastListeners.forEach((l) => l());
  const id = toastMsg.id;
  setTimeout(() => {
    if (toastMsg?.id === id) {
      toastMsg = null;
      toastListeners.forEach((l) => l());
    }
  }, 2600);
}
export function useToast() {
  return useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toastMsg,
  );
}
