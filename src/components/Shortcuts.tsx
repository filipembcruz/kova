import { useMemo, type ReactNode } from 'react';
import { PiLightningFill, PiPlusBold, PiTrashBold, PiPencilSimpleBold } from 'react-icons/pi';
import type { Shortcut, State } from '../lib/types';
import { setState, useStore } from '../lib/store';
import { useT } from '../i18n';
import { addDays, today, uid } from '../lib/calc';
import { money } from '../lib/format';
import { Bubble, Sheet } from './ui';
import { openOverlay, toast } from '../lib/nav';
import { openTxEditor } from './TxEditor';

export function launchShortcut(sc: Shortcut) {
  openTxEditor({ kind: sc.kind, categoryId: sc.categoryId, accountId: sc.accountId, amount: sc.amount, note: sc.note });
}

export function addShortcut(sc: Omit<Shortcut, 'id'>) {
  setState((st) => {
    const list = st.shortcuts ?? [];
    const same = list.find((x) => x.kind === sc.kind && x.categoryId === sc.categoryId && x.accountId === sc.accountId && x.note.trim() === sc.note.trim());
    return { ...st, shortcuts: same ? list.map((x) => (x === same ? { ...x, amount: sc.amount } : x)) : [...list, { ...sc, id: uid() }] };
  });
}

const label = (s: State, sc: Shortcut) => sc.note.trim() || s.categories.find((c) => c.id === sc.categoryId)?.name || '—';

/** Frequent (category, account, note) combos of the last 6 months that are not shortcuts yet. */
export function suggestShortcuts(s: State, max = 6) {
  const since = addDays(today(), -183);
  const m = new Map<string, { kind: Shortcut['kind']; categoryId: string; accountId: string; note: string; n: number; amounts: Map<number, number> }>();
  for (const x of s.txs) {
    if (x.date < since || x.date > today() || x.repeat || x.series) continue;
    const note = x.note.trim();
    const k = [x.kind, x.categoryId, x.accountId, note.toLowerCase()].join('|');
    const e = m.get(k) ?? { kind: x.kind, categoryId: x.categoryId, accountId: x.accountId, note, n: 0, amounts: new Map() };
    e.n++;
    e.amounts.set(x.amount, (e.amounts.get(x.amount) ?? 0) + 1);
    m.set(k, e);
  }
  const have = new Set((s.shortcuts ?? []).map((x) => [x.kind, x.categoryId, x.accountId, x.note.trim().toLowerCase()].join('|')));
  return [...m.entries()]
    .filter(([k, e]) => e.n >= 3 && !have.has(k) && s.categories.some((c) => c.id === e.categoryId && !c.archived) && s.accounts.some((a) => a.id === e.accountId && !a.archived))
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, max)
    .map(([, e]) => {
      const [amt, cnt] = [...e.amounts.entries()].sort((a, b) => b[1] - a[1])[0];
      return { sc: { kind: e.kind, categoryId: e.categoryId, accountId: e.accountId, note: e.note, amount: cnt / e.n >= 0.7 ? amt : undefined }, n: e.n };
    });
}

/** Glass chips inside the Home hero. */
export function ShortcutStrip() {
  const s = useStore();
  const { t, locale } = useT();
  const list = s.shortcuts ?? [];
  const cur = (sc: Shortcut) => s.accounts.find((a) => a.id === sc.accountId)?.currency ?? s.settings.baseCurrency;
  return (
    <div className="sc-strip">
      {list.map((sc) => {
        const c = s.categories.find((x) => x.id === sc.categoryId);
        return (
          <button key={sc.id} className="sc glass" onClick={() => launchShortcut(sc)}>
            <Bubble icon={c?.icon ?? 'lightning'} color={c?.color ?? '#fff'} size={26} solid />
            <span>{label(s, sc)}</span>
            {sc.amount ? <b>{money(sc.amount, cur(sc), locale, { noCents: sc.amount % 100 === 0 })}</b> : null}
          </button>
        );
      })}
      <button className="sc glass add" onClick={() => openOverlay(() => <ShortcutsSheet />)} aria-label={t('shortcuts')}>
        {list.length ? <PiPencilSimpleBold /> : <><PiLightningFill /> <span>{t('createShortcuts')}</span></>}
      </button>
    </div>
  );
}

export function ShortcutsSheet() {
  const s = useStore();
  const { t, locale } = useT();
  const list = s.shortcuts ?? [];
  const sugg = useMemo(() => suggestShortcuts(s), [s.txs, s.shortcuts]);
  const row = (sc: Omit<Shortcut, 'id'>, right: ReactNode, sub?: string) => {
    const c = s.categories.find((x) => x.id === sc.categoryId);
    const a = s.accounts.find((x) => x.id === sc.accountId);
    return (
      <div className="item" style={{ cursor: 'default' }}>
        <Bubble icon={c?.icon ?? 'question'} color={c?.color ?? '#999'} size={42} />
        <div className="grow">
          <div className="t">{sc.note.trim() || c?.name}</div>
          <div className="s">{[sc.note.trim() ? c?.name : '', a?.name, sc.amount ? money(sc.amount, a?.currency ?? s.settings.baseCurrency, locale) : t('anyAmount'), sub].filter(Boolean).join(' · ')}</div>
        </div>
        {right}
      </div>
    );
  };
  return (
    <Sheet title={t('shortcuts')}>
      <div className="sheet-b">
        <div className="small muted" style={{ margin: '0 4px 12px' }}>{t('shortcutsD')}</div>
        {list.length === 0 ? <div className="empty" style={{ padding: 12 }}>{t('noShortcuts')}</div> : (
          <div className="paper flush">
            {list.map((sc) => (
              <div key={sc.id}>
                {row(sc, <button className="icon-btn" style={{ color: 'var(--exp)' }} aria-label="delete" onClick={() => setState((st) => ({ ...st, shortcuts: (st.shortcuts ?? []).filter((x) => x.id !== sc.id) }))}><PiTrashBold /></button>)}
              </div>
            ))}
          </div>
        )}
        {sugg.length > 0 && (
          <>
            <div className="label" style={{ marginTop: 16 }}>{t('suggested')}</div>
            <div className="paper flush">
              {sugg.map(({ sc, n }) => (
                <div key={sc.categoryId + sc.accountId + sc.note}>
                  {row(sc, <button className="mini-btn" onClick={() => { addShortcut(sc); toast(t('shortcutSaved')); }}><PiPlusBold /> {t('addFixed')}</button>, t('timesUsed', { n: String(n) }))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
