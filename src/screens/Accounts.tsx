import { useState } from 'react';
import { PiPlusBold, PiClockCounterClockwiseDuotone, PiArrowsLeftRightDuotone, PiCaretDownBold, PiCaretUpBold, PiPencilSimpleBold } from 'react-icons/pi';
import { setState, useBalances, useStore } from '../lib/store';
import { useT } from '../i18n';
import { accountsSorted, toBase } from '../lib/calc';
import { money } from '../lib/format';
import { Bubble, Money } from '../components/ui';
import { openAccountEditor } from '../components/Editors';
import { openTxEditor } from '../components/TxEditor';
import { navigate } from '../lib/nav';

export function Accounts() {
  const s = useStore();
  const { t, locale } = useT();
  const { bal, total } = useBalances();
  const [showArch, setShowArch] = useState(false);
  const list = accountsSorted(s.accounts);
  const active = list.filter((a) => !a.archived);
  const archived = list.filter((a) => a.archived);
  const hide = s.settings.hideBalance;

  const positive = active.filter((a) => a.includeInTotal).map((a) => ({ a, v: Math.max(toBase(s, bal.get(a.id) ?? 0, a.currency), 0) }));
  const posTotal = positive.reduce((x, p) => x + p.v, 0) || 1;

  const move = (id: string, dir: -1 | 1) => {
    const ids = active.map((a) => a.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setState((st) => ({ ...st, accounts: st.accounts.map((a) => (ids.includes(a.id) ? { ...a, order: ids.indexOf(a.id) } : a)) }));
  };
  const [edit, setEdit] = useState(false);

  const Row = ({ id }: { id: string }) => {
    const a = s.accounts.find((x) => x.id === id)!;
    const v = bal.get(a.id) ?? 0;
    const foreign = a.currency !== s.settings.baseCurrency;
    return (
      <div className="row">
        <button className="item grow" onClick={() => (edit ? openAccountEditor(a) : navigate(`/tx?acc=${a.id}`))}>
          <Bubble icon={a.icon} color={a.color} size={48} round />
          <div className="grow">
            <div className="t ellipsis">{a.name}</div>
            <div className="s">{a.currency}{!a.includeInTotal ? ' · ' + t('includeInTotal') + ' ✕' : ''}</div>
          </div>
          <div className="right">
            <div className="amt" style={v < 0 ? { color: 'var(--red)' } : undefined}>{hide ? '••••' : money(v, a.currency, locale)}</div>
            {foreign && !hide && <div className="amt2">≈ {money(toBase(s, v, a.currency), s.settings.baseCurrency, locale)}</div>}
          </div>
        </button>
        {edit && !a.archived && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button className="round-btn" style={{ width: 32, height: 32 }} onClick={() => move(a.id, -1)}><PiCaretUpBold /></button>
            <button className="round-btn" style={{ width: 32, height: 32 }} onClick={() => move(a.id, 1)}><PiCaretDownBold /></button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="topbar">
        <h1>{t('accounts')}</h1>
        <button className={'round-btn' + (edit ? ' primary' : '')} onClick={() => setEdit(!edit)} aria-label="edit"><PiPencilSimpleBold /></button>
        <button className="round-btn" onClick={() => openAccountEditor()} aria-label="add"><PiPlusBold /></button>
      </div>

      <div className="card">
        <div className="acc-total">
          <span>{t('totalBalance')}</span>
          <b><Money cents={total} /></b>
        </div>
        {!hide && (
          <div style={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', gap: 3, margin: '14px 0 4px' }}>
            {positive.filter((p) => p.v > 0).map((p) => (
              <i key={p.a.id} style={{ width: `${(p.v / posTotal) * 100}%`, background: p.a.color, minWidth: 4, borderRadius: 99 }} />
            ))}
          </div>
        )}
        {!hide && (
          <div className="legend" style={{ marginTop: 10 }}>
            {positive.filter((p) => p.v > 0).sort((x, y) => y.v - x.v).map((p) => (
              <span key={p.a.id}><i style={{ background: p.a.color }} />{p.a.name} {Math.round((p.v / posTotal) * 100)}%</span>
            ))}
          </div>
        )}
      </div>

      <div className="qa">
        <button onClick={() => navigate('/tx?kind=transfer&gran=year')}>
          <div className="bubble round" style={{ width: 40, height: 40, background: 'linear-gradient(145deg,#a996ff,#7c5cff)' }}><PiClockCounterClockwiseDuotone /></div>
          <span>{t('transferHistory')}</span>
        </button>
        <button onClick={() => openTxEditor({ kind: 'transfer' })}>
          <div className="bubble round" style={{ width: 40, height: 40, background: 'linear-gradient(145deg,#ff8fc0,#ff5fa2)' }}><PiArrowsLeftRightDuotone /></div>
          <span>{t('newTransfer')}</span>
        </button>
      </div>

      <div className="card tight">
        {active.map((a) => <Row key={a.id} id={a.id} />)}
      </div>

      {archived.length > 0 && (
        <>
          <button className="section-title" style={{ width: '100%' }} onClick={() => setShowArch(!showArch)}>
            {t('archivedAccounts')} <span className="tag">{archived.length}</span>
            <span className="link">{showArch ? <PiCaretUpBold /> : <PiCaretDownBold />}</span>
          </button>
          {showArch && <div className="card tight" style={{ opacity: 0.75 }}>{archived.map((a) => <Row key={a.id} id={a.id} />)}</div>}
        </>
      )}
    </>
  );
}

