import { parseIso, today, addDays } from './calc';

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, currency: string, frac: number) {
  const k = `${locale}|${currency}|${frac}`;
  let f = nfCache.get(k);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: frac, maximumFractionDigits: frac });
    } catch {
      f = new Intl.NumberFormat(locale, { minimumFractionDigits: frac, maximumFractionDigits: frac });
    }
    nfCache.set(k, f);
  }
  return f;
}

export function money(cents: number, currency: string, locale: string, opts: { sign?: boolean; compact?: boolean; noCents?: boolean } = {}) {
  const v = cents / 100;
  if (opts.compact && Math.abs(v) >= 10000) {
    const f = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
    return (opts.sign && v > 0 ? '+' : '') + f.format(v);
  }
  const frac = opts.noCents || (opts.compact && Number.isInteger(v)) ? 0 : 2;
  const s = nf(locale, currency, frac).format(v);
  return (opts.sign && v > 0 ? '+' : '') + s;
}

export function moneyParts(cents: number, currency: string, locale: string) {
  const parts = nf(locale, currency, 2).formatToParts(cents / 100);
  let main = '', dec = '', sym = '';
  let afterDec = false;
  for (const p of parts) {
    if (p.type === 'currency') sym = p.value;
    else if (p.type === 'decimal') { afterDec = true; dec += p.value; }
    else if (p.type === 'fraction') dec += p.value;
    else if (p.type === 'literal') { if (!afterDec) main += ''; }
    else if (!afterDec) main += p.value;
  }
  return { sym, main, dec };
}

export function dayLabel(date: string, locale: string, t: (k: 'today' | 'yesterday') => string) {
  if (date === today()) return t('today');
  if (date === addDays(today(), -1)) return t('yesterday');
  const d = parseIso(date);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function monthLabel(ym: string, locale: string, style: 'long' | 'short' = 'long', withYear = true) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString(locale, { month: style, ...(withYear ? { year: 'numeric' } : {}) });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shortDate(date: string, locale: string) {
  return parseIso(date).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function pct(v: number) {
  if (!Number.isFinite(v)) return '—';
  return `${Math.round(v)}%`;
}
