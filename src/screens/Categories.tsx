import { useMemo, useState } from 'react';
import { PiPlusBold, PiCaretDownBold, PiCaretUpBold, PiArrowsDownUpBold, PiCheckBold, PiHandGrabbingBold } from 'react-icons/pi';
import type { Kind } from '../lib/types';
import { setState, useStore } from '../lib/store';
import { useT } from '../i18n';
import { byCategory, filterTx, periodOf, today } from '../lib/calc';
import { money, monthLabel } from '../lib/format';
import { Bubble } from '../components/ui';
import { openCategoryEditor } from '../components/Editors';
import { Sortable } from '../components/Sortable';
import { goTx } from './Transactions';

export function Categories() {
  const s = useStore();
  const { t, locale } = useT();
  const [kind, setKind] = useState<Kind>('expense');
  const [showArch, setShowArch] = useState(false);
  const [sorting, setSorting] = useState(false);
  const spent = useMemo(() => new Map(byCategory(filterTx(s, periodOf('month', today()), kind))), [s.txs, kind]);
  const cats = s.categories.filter((c) => c.kind === kind).sort((a, b) => a.order - b.order);
  const active = cats.filter((c) => !c.archived);
  const archived = cats.filter((c) => c.archived);
  const base = s.settings.baseCurrency;
  const total = [...spent.values()].reduce((a, v) => a + v, 0);

  const commit = (ids: string[]) =>
    setState((st) => ({ ...st, categories: st.categories.map((c) => (ids.includes(c.id) ? { ...c, order: ids.indexOf(c.id) } : c)) }));

  const tile = (c: (typeof cats)[number]) => {
    const v = spent.get(c.id) ?? 0;
    const pct = c.budget ? Math.min(100, (v / c.budget) * 100) : 0;
    return (
      <button className="c" style={{ width: '100%' }} onClick={() => !sorting && openCategoryEditor(c, kind)}>
        <div style={{ position: 'relative' }}>
          <Bubble icon={c.icon} color={c.color} size={56} />
          {c.budget ? (
            <svg width={66} height={66} style={{ position: 'absolute', left: -5, top: -5 }}>
              <rect x={2} y={2} width={62} height={62} rx={20} fill="none" stroke="var(--line)" strokeWidth={2.5} />
              <rect x={2} y={2} width={62} height={62} rx={20} fill="none" stroke={v > c.budget ? 'var(--exp)' : c.color} strokeWidth={2.5} pathLength={100} strokeDasharray={`${pct} 100`} />
            </svg>
          ) : null}
        </div>
        <span className="nm">{c.name}</span>
        <span className="am">{v > 0 ? money(v, base, locale) : ' '}</span>
      </button>
    );
  };

  return (
    <>
      <div className="topbar">
        <h1>{t('categories')}</h1>
        <button className={'icon-btn' + (sorting ? ' on' : ' solid')} onClick={() => setSorting(!sorting)} aria-label="reorder">{sorting ? <PiCheckBold /> : <PiArrowsDownUpBold />}</button>
        {!sorting && <button className="icon-btn solid" onClick={() => openCategoryEditor(undefined, kind)} aria-label="add"><PiPlusBold /></button>}
      </div>

      <div className="tabs-center">
        <div className="track">
          <span className="thumb" style={{ width: 'calc(50% - 4px)', transform: `translateX(${kind === 'expense' ? 0 : 100}%)` }} />
          <button className={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}><span className="dot" style={{ background: 'var(--exp)' }} />{t('expenses')}</button>
          <button className={kind === 'income' ? 'on' : ''} onClick={() => setKind('income')}><span className="dot" style={{ background: 'var(--inc)' }} />{t('income')}</button>
        </div>
      </div>

      {sorting ? (
        <div className="hint"><PiHandGrabbingBold /> {t('dragHint')}</div>
      ) : (
        <div className="row" style={{ margin: '0 8px 10px' }}>
          <span className="small muted grow" style={{ fontWeight: 600 }}>{monthLabel(today().slice(0, 7), locale)}</span>
          <span className="num" style={{ fontSize: 15 }}>{money(total, base, locale)}</span>
        </div>
      )}

      <div className="paper" style={{ padding: '14px 10px' }}>
        <Sortable items={active} enabled={sorting} onCommit={commit} className="cgrid" itemClass="cwrap" render={(c) => tile(c)} />
        {!sorting && (
          <div className="cgrid" style={{ marginTop: 10 }}>
            <button className="c add" onClick={() => openCategoryEditor(undefined, kind)}>
              <div className="bubble" style={{ width: 56, height: 56 }}><PiPlusBold /></div>
              <span className="nm">{t('create')}</span>
              <span className="am">&nbsp;</span>
            </button>
          </div>
        )}
      </div>

      {!sorting && total > 0 && (
        <button className="btn soft" style={{ width: '100%' }} onClick={() => goTx({ kind, gran: 'month', view: 'group' })}>{t('seeByCategory')}</button>
      )}

      {archived.length > 0 && !sorting && (
        <>
          <button className="section-title" style={{ width: 'calc(100% - 16px)' }} onClick={() => setShowArch(!showArch)}>
            {t('archived')} <span className="tag">{archived.length}</span>
            <span className="link">{showArch ? <PiCaretUpBold /> : <PiCaretDownBold />}</span>
          </button>
          {showArch && <div className="paper" style={{ opacity: 0.7, padding: '14px 10px' }}><div className="cgrid">{archived.map((c) => <div key={c.id} className="cwrap">{tile(c)}</div>)}</div></div>}
        </>
      )}
    </>
  );
}
