import { useState } from 'react';
import { PiPlusBold, PiClockCounterClockwiseBold, PiArrowsLeftRightBold, PiCaretDownBold, PiCaretUpBold, PiPencilSimpleBold } from 'react-icons/pi';
import { setState, useBalances, useStore } from '../lib/store';
import { useT } from '../i18n';
import { accountsSorted, toBase } from '../lib/calc';
import { money } from '../lib/format';
import { Bubble } from '../components/ui';
import { openAccountEditor } from '../components/Editors';
import { openTxEditor } from '../components/TxEditor';
import { navigate } from '../lib/nav';

export function Accounts() {
  const s = useStore();
  const { t, locale } = useT();
  const { bal, total } = useBalances();
  const [showArch, setShowArch] = useState(false);
  const [edit, setEdit] = useState(false);
  const list = accountsSorted(s.accounts);
  const active = list.filter((a) => !a.archived);
  const archived = list.filter((a) => a.archived);
  const hide = s.settings.hideBalance;
  const base = s.settings.baseCurrency;

  const positive = active.filter((a) => a.includeInTotal).map((a) => ({ a, v: Math.max(toBase(s, bal.get(a.id) ?? 0, a.currency), 0) })).filter((p) => p.v > 0).sort((x, y) => y.v - x.v);
  const posTotal = positive.reduce((x, p) => x + p.v, 0) || 1;

  const move = (id: string, dir: -1 | 1) => {
    const ids = active.map((a) => a.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setState((st) => ({ ...st, accounts: st.accounts.map((a) => (ids.includes(a.id) ? { ...a, order: ids.indexOf(a.id) } : a)) }));
  };

  const row = (id: string) => {
    const a = s.accounts.find((x) => x.id === id)!;
    const v = bal.get(a.id) ?? 0;
    const foreign = a.currency !== base;
    return (
      <div className="row" key={a.id} style={{ gap: 4 }}>
        <button className="item grow" onClick={() => (edit ? openAccountEditor(a) : navigate(`/tx?acc=${a.id}`))}>
          <Bubble icon={a.icon} color={a.color} size={44} />
          <div className="grow">
            <div className="t">{a.name}</div>
            <div className="s">{a.currency}{!a.includeInTotal ? ' · ' + t('includeInTotal') + ' ✕' : ''}</div>
          </div>
          <div className="right">
            <div className="amt" style={v < 0 ? { color: 'var(--exp)' } : undefined}>{hide ? '••••••' : money(v, a.currency, locale)}</div>
            {foreign && !hide && <div className="amt2">≈ {money(toBase(s, v, a.currency), base, locale)}</div>}
          </div>
        </button>
        {edit && !a.archived && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => move(a.id, -1)} aria-label="up"><PiCaretUpBold /></button>
            <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => move(a.id, 1)} aria-label="down"><PiCaretDownBold /></button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="topbar">
        <h1>{t('accounts')}</h1>
        <button className={'icon-btn' + (edit ? ' on' : '')} onClick={() => setEdit(!edit)} aria-label="edit"><PiPencilSimpleBold /></button>
        <button className="icon-btn solid" onClick={() => openAccountEditor()} aria-label="add"><PiPlusBold /></button>
      </div>

      <div className="balance">
        <div className="lbl">{t('totalBalance')}</div>
        <div className={'val' + (hide ? ' hidden' : '')}>{hide ? '••••••' : money(total, base, locale)}</div>
        {!hide && positive.length > 0 && (
          <>
            <div className="dist">
              {positive.map((p) => <i key={p.a.id} style={{ width: `${(p.v / posTotal) * 100}%`, background: p.a.color, minWidth: 3 }} />)}
            </div>
            <div className="legend">
              {positive.map((p) => (
                <span key={p.a.id}><i style={{ background: p.a.color }} />{p.a.name} {Math.round((p.v / posTotal) * 100)}%</span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="qa">
        <button onClick={() => navigate('/tx?kind=transfer&gran=year')}>
          <span className="set-ico"><PiClockCounterClockwiseBold /></span>
          <span>{t('transferHistory')}</span>
        </button>
        <button onClick={() => openTxEditor({ kind: 'transfer' })}>
          <span className="set-ico" style={{ background: 'var(--xfer-soft)', color: 'var(--xfer)' }}><PiArrowsLeftRightBold /></span>
          <span>{t('newTransfer')}</span>
        </button>
      </div>

      <div className="paper flush">{active.map((a) => row(a.id))}</div>

      {archived.length > 0 && (
        <>
          <button className="section-title" style={{ width: 'calc(100% - 16px)' }} onClick={() => setShowArch(!showArch)}>
            {t('archivedAccounts')} <span className="tag">{archived.length}</span>
            <span className="link">{showArch ? <PiCaretUpBold /> : <PiCaretDownBold />}</span>
          </button>
          {showArch && <div className="paper flush" style={{ opacity: 0.7 }}>{archived.map((a) => row(a.id))}</div>}
        </>
      )}
    </>
  );
}
