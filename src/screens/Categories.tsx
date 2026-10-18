import { useMemo, useState } from 'react';
import { PiPlusBold, PiCaretDownBold, PiCaretUpBold } from 'react-icons/pi';
import type { Kind } from '../lib/types';
import { useStore } from '../lib/store';
import { useT } from '../i18n';
import { byCategory, filterTx, periodOf, today } from '../lib/calc';
import { money, monthLabel } from '../lib/format';
import { Bubble, Seg } from '../components/ui';
import { openCategoryEditor } from '../components/Editors';

export function Categories() {
  const s = useStore();
  const { t, locale } = useT();
  const [kind, setKind] = useState<Kind>('expense');
  const [showArch, setShowArch] = useState(false);
  const spent = useMemo(() => new Map(byCategory(filterTx(s, periodOf('month', today()), kind))), [s.txs, kind]);
  const cats = s.categories.filter((c) => c.kind === kind).sort((a, b) => a.order - b.order);
  const active = cats.filter((c) => !c.archived);
  const archived = cats.filter((c) => c.archived);
  const base = s.settings.baseCurrency;
  const hide = s.settings.hideBalance;

  const Grid = ({ list, add }: { list: typeof cats; add?: boolean }) => (
    <div className="cgrid">
      {list.map((c) => {
        const v = spent.get(c.id) ?? 0;
        const pct = c.budget ? Math.min(100, (v / c.budget) * 100) : 0;
        return (
          <button key={c.id} className="c" onClick={() => openCategoryEditor(c, kind)}>
            <div style={{ position: 'relative' }}>
              <Bubble icon={c.icon} color={c.color} size={62} round />
              {c.budget ? (
                <svg width={70} height={70} style={{ position: 'absolute', left: -4, top: -4, transform: 'rotate(-90deg)' }}>
                  <circle cx={35} cy={35} r={33} fill="none" stroke="var(--line)" strokeWidth={3} />
                  <circle cx={35} cy={35} r={33} fill="none" stroke={v > c.budget ? 'var(--red)' : c.color} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${(pct / 100) * 207} 207`} />
                </svg>
              ) : null}
            </div>
            <span className="nm">{c.name}</span>
            {v > 0 && <span className="am">{hide ? '••' : money(v, base, locale, { compact: true, noCents: true })}</span>}
          </button>
        );
      })}
      {add && (
        <button className="c add" onClick={() => openCategoryEditor(undefined, kind)}>
          <div className="bubble round" style={{ width: 62, height: 62 }}><PiPlusBold /></div>
          <span className="nm">{t('create')}</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="topbar">
        <h1>{t('categories')}</h1>
        <button className="round-btn" onClick={() => openCategoryEditor(undefined, kind)} aria-label="add"><PiPlusBold /></button>
      </div>
      <Seg<Kind>
        color
        value={kind}
        onChange={setKind}
        options={[
          { v: 'expense', label: t('expenses'), cls: 'expense' },
          { v: 'income', label: t('income'), cls: 'income' },
        ]}
      />
      <div className="small muted" style={{ margin: '16px 6px 0', fontWeight: 600 }}>{monthLabel(today().slice(0, 7), locale)}</div>
      <div className="card" style={{ marginTop: 10, paddingTop: 22 }}>
        <Grid list={active} add />
      </div>
      {archived.length > 0 && (
        <>
          <button className="section-title" style={{ width: '100%' }} onClick={() => setShowArch(!showArch)}>
            {t('archived')} <span className="tag">{archived.length}</span>
            <span className="link">{showArch ? <PiCaretUpBold /> : <PiCaretDownBold />}</span>
          </button>
          {showArch && <div className="card" style={{ opacity: 0.7 }}><Grid list={archived} /></div>}
        </>
      )}
    </>
  );
}
