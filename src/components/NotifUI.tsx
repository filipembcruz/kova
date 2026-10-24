import { useEffect, useMemo, useState } from 'react';
import { PiCheckBold, PiPencilSimpleBold, PiXBold, PiBellRingingDuotone, PiBatteryChargingDuotone, PiShieldCheckDuotone, PiBrainDuotone, PiFlaskDuotone, PiCaretRightBold, PiTrashBold, PiChartLineDuotone, PiLightningDuotone } from 'react-icons/pi';
import type { NotifApp, NotifMode, State } from '../lib/types';
import { getState, setState, useStore } from '../lib/store';
import { useT } from '../i18n';
import { money } from '../lib/format';
import { accountsSorted, fold } from '../lib/calc';
import { Bubble, Sheet, Switch } from './ui';
import { openOverlay, toast } from '../lib/nav';
import { openTxEditor } from './TxEditor';
import { confirmNotif, ignoreNotif, usePendingNotifs, syncNotifs, type NotifItem } from '../lib/notif';
import { notifStatus, openNotifAccess, openBattery, notifSeen, parseTest, notificationsAllowed, isNative } from '../native';
import { updateRates } from '../screens/Settings';

/** Opens the editor pre-filled with a detected transaction; saving confirms it (and teaches Kova). */
export function editNotif(it: NotifItem) {
  openTxEditor({
    kind: it.kind, accountId: it.acc, categoryId: it.cat, amount: it.amt, note: it.note || it.merchant, date: it.date,
    onSaved: (tx) => { const { id: _id, created: _c, ...rest } = tx; confirmNotif(it, rest); },
  });
}

/** "To confirm" card on Home. */
export function PendingCard() {
  const s = useStore();
  const { t, locale } = useT();
  const items = usePendingNotifs();
  if (!items.length) return null;
  return (
    <>
      <div className="section-title">{t('toConfirm')} <span className="tag">{items.length}</span></div>
      <div className="paper flush">
        {items.slice(0, 6).map((it) => {
          const c = s.categories.find((x) => x.id === it.cat);
          const a = s.accounts.find((x) => x.id === it.acc);
          return (
            <div key={it.id} className="item pend" style={{ cursor: 'default' }}>
              <Bubble icon={c?.icon ?? 'question'} color={c?.color ?? '#999'} size={42} />
              <button className="grow" style={{ textAlign: 'left' }} onClick={() => editNotif(it)}>
                <div className="t">{it.note || it.merchant || c?.name}</div>
                <div className="s">
                  {it.dup && <span className="tag red" style={{ marginRight: 6 }}>{t('nDupTag')}</span>}
                  {[c?.name, a?.name, t('viaApp', { a: it.app })].filter(Boolean).join(' · ')}
                </div>
                <div className={'amt ' + (it.kind === 'income' ? 'pos' : '')} style={{ marginTop: 2 }}>
                  {it.kind === 'income' ? '+' : '−'}{money(it.cents, it.cur || a?.currency || s.settings.baseCurrency, locale)}
                </div>
              </button>
              <div className="pend-act">
                <button className="ok" onClick={() => { confirmNotif(it); toast(t('savedOk')); }} aria-label={t('nConfirm')}><PiCheckBold /></button>
                <button onClick={() => editNotif(it)} aria-label={t('nEdit')}><PiPencilSimpleBold /></button>
                <button onClick={() => ignoreNotif(it)} aria-label={t('nNotTx')}><PiXBold /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function guessAccount(s: State, label: string) {
  const f = fold(label).split(/\s+/)[0];
  const list = accountsSorted(s.accounts).filter((a) => !a.archived);
  return (list.find((a) => fold(a.name).includes(f) || f.includes(fold(a.name).split(/\s+/)[0])) ?? list[0])?.id ?? '';
}

export function NotifSettingsSheet() {
  const s = useStore();
  const { t, locale } = useT();
  const n = s.settings.notif ?? { on: false, apps: {} };
  const [st, setSt] = useState({ access: false, post: false, battery: true });
  const [seen, setSeen] = useState<Record<string, { label: string; last: number; n: number; sample?: string }>>({});
  const refresh = () => { notifStatus().then(setSt); notifSeen().then(setSeen); };
  useEffect(() => {
    refresh();
    const fn = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, []);
  const save = (next: { on: boolean; apps: Record<string, NotifApp> }) => setState((x) => ({ ...x, settings: { ...x.settings, notif: next } }));
  const setApp = (pkg: string, patch: Partial<NotifApp>) => {
    const cur = n.apps[pkg] ?? { on: false, acc: guessAccount(getState(), seen[pkg]?.label ?? pkg), mode: 'smart' as NotifMode, label: seen[pkg]?.label ?? pkg };
    save({ ...n, apps: { ...n.apps, [pkg]: { ...cur, ...patch } } });
  };
  const turnOn = async (v: boolean) => {
    save({ ...n, on: v });
    if (v) {
      await notificationsAllowed(true);
      if (!st.access) openNotifAccess();
      updateRates();
    }
  };
  const apps = useMemo(() => {
    const keys = new Set([...Object.keys(seen), ...Object.keys(n.apps)]);
    return [...keys].map((pkg) => ({ pkg, label: n.apps[pkg]?.label ?? seen[pkg]?.label ?? pkg, info: seen[pkg], cfg: n.apps[pkg] }))
      .sort((a, b) => Number(!!b.cfg?.on) - Number(!!a.cfg?.on) || (b.info?.last ?? 0) - (a.info?.last ?? 0));
  }, [seen, n.apps]);
  const accounts = accountsSorted(s.accounts).filter((a) => !a.archived);
  const learned = Object.keys(s.merchants ?? {}).length;

  return (
    <Sheet title={t('autoEntry')} full>
      <div className="sheet-b">
        <div className="paper flush">
          <div className="setting">
            <div className="set-ico"><PiLightningDuotone /></div>
            <div className="grow"><div className="t">{t('nOn')}</div><div className="s">{t('autoEntryD')}</div></div>
            <Switch on={n.on} onChange={turnOn} />
          </div>
          {n.on && (
            <>
              <button className="setting" onClick={() => openNotifAccess()}>
                <div className="set-ico" style={st.access ? { color: 'var(--inc)' } : undefined}><PiShieldCheckDuotone /></div>
                <div className="grow"><div className="t">{st.access ? t('nAccessOk') : t('nAccess')}</div><div className="s">{t('nAccessD')}</div></div>
                {!st.access && <PiCaretRightBold className="muted" />}
              </button>
              {!st.post && isNative() && (
                <button className="setting" onClick={async () => { await notificationsAllowed(true); refresh(); }}>
                  <div className="set-ico"><PiBellRingingDuotone /></div>
                  <div className="grow"><div className="t">{t('nPost')}</div><div className="s">{t('nPostD')}</div></div>
                  <PiCaretRightBold className="muted" />
                </button>
              )}
              {!st.battery && (
                <button className="setting" onClick={() => openBattery()}>
                  <div className="set-ico"><PiBatteryChargingDuotone /></div>
                  <div className="grow"><div className="t">{t('nBattery')}</div><div className="s">{t('nBatteryD')}</div></div>
                  <PiCaretRightBold className="muted" />
                </button>
              )}
            </>
          )}
        </div>

        {n.on && (
          <>
            <div className="label" style={{ marginTop: 16 }}>{t('nApps')}</div>
            <div className="small muted" style={{ margin: '0 4px 8px' }}>{t('nAppsD')}</div>
            {apps.length === 0 && <div className="empty" style={{ padding: 16 }}>{t('nNoApps')}</div>}
            <div className="paper flush">
              {apps.map(({ pkg, label, info, cfg }) => (
                <div key={pkg} className="napp">
                  <div className="setting" style={{ borderTop: 0 }}>
                    <div className="grow">
                      <div className="t">{label}</div>
                      {info?.sample && <div className="s" style={{ whiteSpace: 'normal' }}>{info.sample}</div>}
                    </div>
                    <Switch on={!!cfg?.on} onChange={(v) => setApp(pkg, { on: v })} />
                  </div>
                  {cfg?.on && (
                    <div style={{ padding: '0 14px 14px' }}>
                      <div className="label" style={{ marginTop: 0 }}>{t('nAccount')}</div>
                      <div className="pills">
                        {accounts.map((a) => (
                          <button key={a.id} className={'pill' + (cfg.acc === a.id ? ' on' : '')} onClick={() => setApp(pkg, { acc: a.id })}>
                            <Bubble icon={a.icon} color={a.color} size={24} /> {a.name} <span className="muted small">{a.currency}</span>
                          </button>
                        ))}
                      </div>
                      <div className="label">{t('nMode')}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {([['ask', t('modeAsk')], ['smart', t('modeSmart')], ['auto', t('modeAuto')]] as [NotifMode, string][]).map(([v, l]) => (
                          <button key={v} className={'pill text' + (cfg.mode === v ? ' on' : '')} onClick={() => setApp(pkg, { mode: v })}>{l}</button>
                        ))}
                      </div>
                      {cfg.mode === 'smart' && <div className="small muted" style={{ margin: '8px 4px 0' }}>{t('modeSmartD')}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="paper flush" style={{ marginTop: 16 }}>
              <button className="setting" onClick={() => openOverlay(() => <LearnedSheet />)}>
                <div className="set-ico"><PiBrainDuotone /></div>
                <div className="grow"><div className="t">{t('nLearned')}</div><div className="s">{t('nLearnedD', { n: String(learned) })}</div></div>
                <PiCaretRightBold className="muted" />
              </button>
              <button className="setting" onClick={() => openOverlay(() => <TestSheet />)}>
                <div className="set-ico"><PiFlaskDuotone /></div>
                <div className="grow"><div className="t">{t('nTest')}</div><div className="s">{t('nTestD')}</div></div>
                <PiCaretRightBold className="muted" />
              </button>
            </div>
          </>
        )}

        <div className="paper flush" style={{ marginTop: 16 }}>
          <div className="setting">
            <div className="set-ico"><PiChartLineDuotone /></div>
            <div className="grow"><div className="t">{t('statusNotif')}</div><div className="s">{t('statusNotifD')}</div></div>
            <Switch on={!!s.settings.statusNotif} onChange={async (v) => { if (v) await notificationsAllowed(true); setState((x) => ({ ...x, settings: { ...x.settings, statusNotif: v } })); }} />
          </div>
        </div>
        <div style={{ height: 8 }} />
        <span hidden>{locale}</span>
      </div>
    </Sheet>
  );
}

function LearnedSheet() {
  const s = useStore();
  const { t } = useT();
  const list = Object.entries(s.merchants ?? {}).sort((a, b) => b[1].n - a[1].n);
  return (
    <Sheet title={t('nLearned')}>
      <div className="sheet-b">
        {list.length === 0 && <div className="empty">—</div>}
        <div className="paper flush">
          {list.map(([k, m]) => {
            const c = s.categories.find((x) => x.id === m.cat);
            const a = s.accounts.find((x) => x.id === m.acc);
            return (
              <div key={k} className="item" style={{ cursor: 'default' }}>
                <Bubble icon={c?.icon ?? 'question'} color={c?.color ?? '#999'} size={40} />
                <div className="grow">
                  <div className="t">{m.name || k.split('|')[1]}</div>
                  <div className="s">{[c?.name, m.note, a?.name, `${m.n}×`].filter(Boolean).join(' · ')}</div>
                </div>
                <button className="icon-btn" style={{ color: 'var(--exp)' }} aria-label={t('nForget')}
                  onClick={() => setState((x) => { const mm = { ...(x.merchants ?? {}) }; delete mm[k]; return { ...x, merchants: mm }; })}><PiTrashBold /></button>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

function TestSheet() {
  const { t, locale } = useT();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [res, setRes] = useState<Awaited<ReturnType<typeof parseTest>> | undefined>(undefined);
  const run = async () => setRes(await parseTest(title, text, getState().settings.baseCurrency));
  return (
    <Sheet title={t('nTest')} footer={<button className="btn primary" onClick={run}>{t('nTest')}</button>}>
      <div className="sheet-b">
        <label className="field"><span>Título</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Compra aprovada" /></label>
        <label className="field"><span>Texto</span><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Compra de R$ 35,57 APROVADA em SUPERMERCADO BH" style={{ width: '100%', border: 0, background: 'transparent', font: 'inherit', resize: 'vertical', color: 'inherit' }} /></label>
        {res === null && <div className="small muted">{t('nTestNative')}</div>}
        {res && (
          <div className="paper">
            <b>{t('nResult')}</b>
            <div style={{ marginTop: 6 }}>
              {res.tx ? `${res.kind === 'income' ? '+' : '−'}${money(res.cents, res.cur || getState().settings.baseCurrency, locale)} · ${res.merchant || '—'} · ${res.kind}` : `${t('nNotRecognized')} (${res.reason})`}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export const refreshNotifs = syncNotifs;
