import { useMemo, useState } from 'react';
import { PiBackspaceBold, PiCheckBold, PiTrashBold, PiCalendarBlankBold, PiHashBold, PiArrowDownBold, PiPlusBold } from 'react-icons/pi';
import type { Kind, Repeat, Tx, Transfer } from '../lib/types';
import { getState, setState, useStore } from '../lib/store';
import { accountsSorted, addDays, evalExpr, today, toBase, uid, rate } from '../lib/calc';
import { useT } from '../i18n';
import { Bubble, Seg, Sheet, confirmDialog } from './ui';
import { openOverlay, toast } from '../lib/nav';
import { money } from '../lib/format';
import { tap } from '../native';

type Mode = Kind | 'transfer';

export function openTxEditor(opts: { tx?: Tx; transfer?: Transfer; kind?: Mode; accountId?: string; categoryId?: string } = {}) {
  openOverlay((close) => <TxEditor {...opts} close={close} />);
}

const fmtExpr = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '').replace('.', ',');

function TxEditor({ tx, transfer, kind, accountId, categoryId, close }: { tx?: Tx; transfer?: Transfer; kind?: Mode; accountId?: string; categoryId?: string; close: () => void }) {
  const s = useStore();
  const { t, locale } = useT();
  const accounts = accountsSorted(s.accounts).filter((a) => !a.archived || a.id === tx?.accountId || a.id === transfer?.from || a.id === transfer?.to);
  const defaultAcc = accountId ?? accounts[0]?.id ?? '';

  const [mode, setMode] = useState<Mode>(transfer ? 'transfer' : tx?.kind ?? kind ?? 'expense');
  const [expr, setExpr] = useState(tx ? fmtExpr(tx.amount) : transfer ? fmtExpr(transfer.fromAmount) : '');
  const [acc, setAcc] = useState(tx?.accountId ?? transfer?.from ?? defaultAcc);
  const [toAcc, setToAcc] = useState(transfer?.to ?? accounts.find((a) => a.id !== defaultAcc)?.id ?? '');
  const [toExpr, setToExpr] = useState(transfer && transfer.toAmount !== transfer.fromAmount ? fmtExpr(transfer.toAmount) : '');
  const [cat, setCat] = useState(tx?.categoryId ?? categoryId ?? '');
  const [date, setDate] = useState(tx?.date ?? transfer?.date ?? today());
  const [note, setNote] = useState(tx?.note ?? transfer?.note ?? '');
  const [tags, setTags] = useState<string[]>(tx?.tags ?? []);
  const [rep, setRep] = useState<Repeat | ''>(tx?.repeat ?? '');
  const [tagInput, setTagInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [editingTo, setEditingTo] = useState(false);

  const account = s.accounts.find((a) => a.id === acc);
  const toAccount = s.accounts.find((a) => a.id === toAcc);
  const cur = account?.currency ?? s.settings.baseCurrency;
  const value = evalExpr(expr) ?? 0;
  const cents = Math.round(value * 100);
  const crossCurrency = mode === 'transfer' && toAccount && account && toAccount.currency !== account.currency;
  const autoTo = crossCurrency ? Math.round((cents * rate(s, cur)) / rate(s, toAccount!.currency)) : cents;
  const toCents = crossCurrency && toExpr ? Math.round((evalExpr(toExpr) ?? 0) * 100) : autoTo;

  const cats = s.categories.filter((c) => c.kind === mode && (!c.archived || c.id === cat)).sort((a, b) => a.order - b.order);
  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of s.txs) for (const g of x.tags) m.set(g, (m.get(g) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  }, [s.txs]);

  const press = (k: string) => {
    tap();
    const setter = editingTo ? setToExpr : setExpr;
    const curExpr = editingTo ? toExpr : expr;
    if (k === 'back') return setter(curExpr.slice(0, -1));
    if (k === '=') {
      const v = evalExpr(curExpr);
      if (v !== null) setter(fmtExpr(Math.round(v * 100)));
      return;
    }
    if (/[+\-×÷]/.test(k)) {
      if (!curExpr) return;
      if (/[+\-×÷]$/.test(curExpr)) return setter(curExpr.slice(0, -1) + k);
      return setter(curExpr + k);
    }
    if (k === ',') {
      const lastNum = curExpr.split(/[+\-×÷]/).pop() ?? '';
      if (lastNum.includes(',')) return;
      return setter(curExpr + (lastNum ? ',' : '0,'));
    }
    const lastNum = curExpr.split(/[+\-×÷]/).pop() ?? '';
    if (lastNum.includes(',') && lastNum.split(',')[1].length >= 2) return;
    if (curExpr.length > 18) return;
    setter(curExpr === '0' ? k : curExpr + k);
  };

  const save = () => {
    if (!cents || cents <= 0) return toast(t('enterAmount'));
    if (mode === 'transfer') {
      if (!toAcc || toAcc === acc) return toast(t('sameAccount'));
      const tr: Transfer = {
        id: transfer?.id ?? uid(), from: acc, to: toAcc, fromAmount: cents, toAmount: toCents || cents,
        date, note: note.trim(), created: transfer?.created ?? new Date().toISOString(),
      };
      setState((st) => ({
        ...st,
        txs: tx ? st.txs.filter((x) => x.id !== tx.id) : st.txs,
        transfers: transfer ? st.transfers.map((x) => (x.id === tr.id ? tr : x)) : [tr, ...st.transfers],
      }));
    } else {
      if (!cat) return toast(t('chooseCategory'));
      const st0 = getState();
      const sameAmount = tx && tx.amount === cents && tx.accountId === acc;
      const base = sameAmount ? tx!.base : toBase(st0, cents, cur);
      const nt: Tx = {
        id: tx?.id ?? uid(), kind: mode, accountId: acc, categoryId: cat, amount: cents, base,
        date, note: note.trim(), tags, created: tx?.created ?? new Date().toISOString(),
      };
      if (rep) { nt.repeat = rep; nt.series = tx?.series ?? uid(); }
      else if (tx?.series) nt.series = tx.series;
      const stopSeries = !rep && tx?.repeat && tx.series;
      setState((st) => {
        let txs = tx ? st.txs.map((x) => (x.id === nt.id ? nt : x)) : [nt, ...st.txs];
        if (stopSeries) {
          const now = today();
          txs = txs.filter((x) => x.id === nt.id || x.series !== tx!.series || x.date <= now).map((x) => (x.series === tx!.series ? { ...x, repeat: undefined } : x));
        } else if (rep && tx?.series) {
          // newer planned occurrences follow the edited one
          txs = txs.filter((x) => x.id === nt.id || x.series !== tx.series || x.date <= nt.date || x.date <= today());
        }
        txs = [...txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.created < b.created ? 1 : -1));
        return { ...st, txs, transfers: transfer ? st.transfers.filter((x) => x.id !== transfer.id) : st.transfers };
      });
    }
    toast(t('savedOk'));
    close();
  };

  const remove = async () => {
    if (!(await confirmDialog(t('confirmDelete'), t('delete'), t('cancel')))) return;
    setState((st) => {
      let txs = tx ? st.txs.filter((x) => x.id !== tx.id) : st.txs;
      // deleting the latest occurrence of a recurring item stops the series
      if (tx?.series && !txs.some((x) => x.series === tx.series && x.date >= tx.date)) {
        txs = txs.map((x) => (x.series === tx.series ? { ...x, repeat: undefined } : x));
      }
      return { ...st, txs, transfers: transfer ? st.transfers.filter((x) => x.id !== transfer.id) : st.transfers };
    });
    toast(t('deleted'));
    close();
  };

  const addTag = (g: string) => {
    const v = g.trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput('');
  };

  const keys = ['7', '8', '9', 'back', '÷', '4', '5', '6', '+', '×', '1', '2', '3', '-', 'ok', '00', '0', ',', '='];
  const display = editingTo ? toExpr : expr;
  const shown = money(editingTo ? toCents : cents, editingTo ? toAccount!.currency : cur, locale);

  return (
    <Sheet
      full
      title={tx || transfer ? t('editTransaction') : t('newTransaction')}
      actions={(tx || transfer) && (
        <button className="icon-btn" style={{ color: 'var(--exp)' }} onClick={remove} aria-label="delete">
          <PiTrashBold />
        </button>
      )}
    >
      <div className="sheet-b" style={{ paddingBottom: 12 }}>
        <Seg<Mode>
          color
          value={mode}
          onChange={(v) => { setMode(v); setCat(''); setEditingTo(false); }}
          options={[
            { v: 'expense', label: t('expense'), cls: 'expense' },
            { v: 'income', label: t('income'), cls: 'income' },
            { v: 'transfer', label: t('transfer'), cls: 'transfer' },
          ]}
        />

        <div className="amount-box" onClick={() => { setTyping(false); setEditingTo(false); (document.activeElement as HTMLElement)?.blur?.(); }}>
          <div className="cur">{editingTo ? `${t('received')} · ${toAccount?.currency}` : `${t('amount')} · ${cur}`}</div>
          <div className="val" style={{ color: mode === 'income' ? 'var(--inc)' : mode === 'expense' ? 'var(--ink)' : 'var(--blue)' }}>{shown}</div>
          <div className="expr">{/[+\-×÷]/.test(display) ? display : ' '}</div>
        </div>

        <div className="small muted" style={{ fontWeight: 600, margin: '0 4px 8px' }}>{mode === 'transfer' ? t('fromAccount') : t('account')}</div>
        <div className="pills" style={{ marginBottom: 14 }}>
          {accounts.map((a) => (
            <button key={a.id} className={'pill' + (acc === a.id ? ' on' : '')} onClick={() => setAcc(a.id)}>
              <Bubble icon={a.icon} color={a.color} size={26} round /> {a.name}
            </button>
          ))}
        </div>

        {mode === 'transfer' ? (
          <>
            <div style={{ display: 'grid', placeItems: 'center', margin: '-4px 0 6px', color: 'var(--muted)' }}><PiArrowDownBold size={20} /></div>
            <div className="small muted" style={{ fontWeight: 600, margin: '0 4px 8px' }}>{t('toAccount')}</div>
            <div className="pills" style={{ marginBottom: 14 }}>
              {accounts.filter((a) => a.id !== acc).map((a) => (
                <button key={a.id} className={'pill' + (toAcc === a.id ? ' on' : '')} onClick={() => setToAcc(a.id)}>
                  <Bubble icon={a.icon} color={a.color} size={26} round /> {a.name}
                </button>
              ))}
            </div>
            {crossCurrency && (
              <button className="field" style={{ width: '100%', textAlign: 'left', outline: editingTo ? '2px solid var(--primary)' : 'none' }} onClick={() => { setEditingTo(true); if (!toExpr) setToExpr(fmtExpr(autoTo)); }}>
                <span>{t('received')} ({toAccount!.currency})</span>
                <b style={{ fontSize: 18 }}>{money(toCents, toAccount!.currency, locale)}</b>
                <div className="small muted">1 {cur} = {(toCents / Math.max(cents, 1)).toFixed(4)} {toAccount!.currency}</div>
              </button>
            )}
          </>
        ) : (
          <>
            <div className="small muted" style={{ fontWeight: 600, margin: '0 4px 10px' }}>{t('category')}</div>
            <div className="cgrid" style={{ marginBottom: 18 }}>
              {cats.map((c) => (
                <button key={c.id} className={'c' + (cat === c.id ? ' on' : '')} onClick={() => { tap(); setCat(c.id); }}>
                  <Bubble icon={c.icon} color={c.color} size={54} round />
                  <span className="nm">{c.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="pills" style={{ marginBottom: 12 }}>
          {[today(), addDays(today(), -1)].map((d, i) => (
            <button key={d} className={'pill' + (date === d ? ' on' : '')} onClick={() => setDate(d)}>{i === 0 ? t('today') : t('yesterday')}</button>
          ))}
          <label className={'pill' + (date !== today() && date !== addDays(today(), -1) ? ' on' : '')} style={{ position: 'relative' }}>
            <PiCalendarBlankBold />
            {new Date(date + 'T12:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
          </label>
        </div>

        {date > today() && (
          <div className="row" style={{ margin: '-4px 4px 12px', gap: 8 }}>
            <span className="tag plan">{t('planned')}</span>
            <span className="small muted grow">{t('plannedHint')}</span>
            {tx && <button className="mini-btn" onClick={() => setDate(today())}>{t('confirmNow')}</button>}
          </div>
        )}
        {mode !== 'transfer' && (
          <div className="pills" style={{ marginBottom: 12 }}>
            {(['', 'monthly', 'weekly', 'yearly'] as const).map((r) => (
              <button key={r || 'none'} className={'pill text' + (rep === r ? ' on' : '')} onClick={() => setRep(r)}>
                {r === '' ? t('noRepeat') : t(r)}
              </button>
            ))}
          </div>
        )}
        <label className="field">
          <span>{t('note')}</span>
          <input value={note} placeholder={t('notePh')} onFocus={() => setTyping(true)} onBlur={() => setTimeout(() => setTyping(false), 120)} onChange={(e) => setNote(e.target.value)} />
        </label>

        {mode !== 'transfer' && (
          <div className="field">
            <span>{t('tags')}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {tags.map((g) => (
                <button key={g} className="tag lilac" onClick={() => setTags(tags.filter((x) => x !== g))}><PiHashBold /> {g} ✕</button>
              ))}
              <input
                value={tagInput}
                placeholder={t('addTag')}
                style={{ flex: 1, minWidth: 100, fontSize: 14 }}
                onFocus={() => setTyping(true)}
                onBlur={() => setTimeout(() => setTyping(false), 120)}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag(tagInput)}
              />
              {tagInput && <button className="tag" onClick={() => addTag(tagInput)}><PiPlusBold /> {tagInput}</button>}
            </div>
            {allTags.filter((g) => !tags.includes(g) && (!tagInput || g.toLowerCase().includes(tagInput.toLowerCase()))).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {allTags.filter((g) => !tags.includes(g) && (!tagInput || g.toLowerCase().includes(tagInput.toLowerCase()))).slice(0, 8).map((g) => (
                  <button key={g} className="tag" onMouseDown={(e) => e.preventDefault()} onClick={() => addTag(g)}>#{g}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!typing && (
        <div className="keypad" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {keys.map((k) =>
            k === 'ok' ? (
              <button key={k} className="ok" style={{ gridRow: 'span 2' }} onClick={save} aria-label="save"><PiCheckBold /></button>
            ) : (
              <button key={k} className={/[+\-×÷=]/.test(k) || k === 'back' ? 'op' : ''} onClick={() => press(k === '-' ? '-' : k)}>
                {k === 'back' ? <PiBackspaceBold /> : k === '-' ? '−' : k}
              </button>
            ),
          )}
        </div>
      )}
      {typing && (
        <div className="sheet-f">
          <button className="btn grad" onMouseDown={(e) => e.preventDefault()} onClick={save}><PiCheckBold /> {t('save')}</button>
        </div>
      )}
    </Sheet>
  );
}

