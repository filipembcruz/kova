import { useEffect, useMemo, useState } from 'react';
import { PiBackspaceBold, PiCheckBold, PiTrashBold, PiCalendarBlankBold, PiHashBold, PiArrowDownBold, PiPlusBold, PiPaperclipBold, PiFilePdfDuotone, PiXBold, PiShareNetworkBold, PiBellRingingBold, PiLightningBold, PiLightningFill, PiDotsThreeBold } from 'react-icons/pi';
import type { Attachment, Kind, Repeat, Tx, Transfer } from '../lib/types';
import { getState, setState, useStore } from '../lib/store';
import { accountsSorted, addDays, evalExpr, today, toBase, uid, rate, parseIso } from '../lib/calc';
import { useT, getT } from '../i18n';
import { Bubble, Seg, Sheet, Switch, confirmDialog } from './ui';
import { openOverlay, toast } from '../lib/nav';
import { money } from '../lib/format';
import { tap, pickFile, openBlob, shareBlob, notificationsAllowed } from '../native';
import { pickDate } from './Pickers';
import { addShortcut } from './Shortcuts';
import { putFile, getFile, deleteFile, compressImage } from '../lib/files';
import { fold } from '../lib/calc';

type Mode = Kind | 'transfer';

export function openTxEditor(opts: { tx?: Tx; transfer?: Transfer; kind?: Mode; accountId?: string; categoryId?: string; repeat?: Repeat; date?: string; amount?: number; note?: string } = {}) {
  openOverlay((close) => <TxEditor {...opts} close={close} />);
}

const fmtExpr = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '').replace('.', ',');

export function AttachmentThumb({ att, onRemove }: { att: Attachment; onRemove?: () => void }) {
  const { t } = useT();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    if (att.type.startsWith('image/')) getFile(att.id).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [att.id]);
  return (
    <button className="att" onClick={() => viewAttachment(att)}>
      {url ? <img src={url} alt={att.name} /> : <div className="att-file"><PiFilePdfDuotone /><span>{att.name}</span><b>{t('open')}</b></div>}
      {onRemove && <span className="x" role="button" onClick={(e) => { e.stopPropagation(); onRemove(); }}><PiXBold /></span>}
    </button>
  );
}

export async function viewAttachment(att: Attachment) {
  const blob = await getFile(att.id);
  if (!blob) return;
  if (att.type.startsWith('image/')) {
    const url = URL.createObjectURL(blob);
    openOverlay(() => <ImageViewer att={att} blob={blob} url={url} />);
    return;
  }
  // PDFs and other files open in the phone's own viewer (Drive PDF viewer, etc.)
  if (!(await openBlob(blob, att.name, att.type))) toast(getT()('openFail'));
}

function ImageViewer({ att, blob, url }: { att: Attachment; blob: Blob; url: string }) {
  const { t } = useT();
  return (
    <Sheet title={att.name} actions={<button className="icon-btn" onClick={() => shareBlob(blob, att.name)} aria-label={t('share')}><PiShareNetworkBold /></button>}>
      <div className="sheet-b viewer"><img src={url} alt={att.name} /></div>
    </Sheet>
  );
}

function TxEditor({ tx, transfer, kind, accountId, categoryId, repeat, date: date0, amount: amount0, note: note0, close }: { tx?: Tx; transfer?: Transfer; kind?: Mode; accountId?: string; categoryId?: string; repeat?: Repeat; date?: string; amount?: number; note?: string; close: () => void }) {
  const s = useStore();
  const { t, locale } = useT();
  const accounts = accountsSorted(s.accounts).filter((a) => !a.archived || a.id === tx?.accountId || a.id === transfer?.from || a.id === transfer?.to);
  const defaultAcc = accountId ?? accounts[0]?.id ?? '';

  const [mode, setMode] = useState<Mode>(transfer ? 'transfer' : tx?.kind ?? kind ?? 'expense');
  const [expr, setExpr] = useState(tx ? fmtExpr(tx.amount) : transfer ? fmtExpr(transfer.fromAmount) : amount0 ? fmtExpr(amount0) : '');
  const [acc, setAcc] = useState(tx?.accountId ?? transfer?.from ?? defaultAcc);
  const [toAcc, setToAcc] = useState(transfer?.to ?? accounts.find((a) => a.id !== defaultAcc)?.id ?? '');
  const [toExpr, setToExpr] = useState(transfer && transfer.toAmount !== transfer.fromAmount ? fmtExpr(transfer.toAmount) : '');
  const [cat, setCat] = useState(tx?.categoryId ?? categoryId ?? '');
  const [date, setDate] = useState(tx?.date ?? transfer?.date ?? date0 ?? today());
  const [done, setDone] = useState(!!tx?.done);
  const [note, setNote] = useState(tx?.note ?? transfer?.note ?? note0 ?? '');
  const [tags, setTags] = useState<string[]>(tx?.tags ?? []);
  const [rep, setRep] = useState<Repeat | ''>(tx?.repeat ?? repeat ?? '');
  const [remind, setRemind] = useState<number>(tx?.remind ?? (repeat ? 1 : -1));
  const [atts, setAtts] = useState<Attachment[]>(tx?.attachments ?? []);
  const [tagInput, setTagInput] = useState('');
  const [pad, setPad] = useState(true); // our number keypad: only while the amount is being typed
  const [noteFocus, setNoteFocus] = useState(false);
  const [allCats, setAllCats] = useState(false);
  const [editingTo, setEditingTo] = useState(false);

  const account = s.accounts.find((a) => a.id === acc);
  const toAccount = s.accounts.find((a) => a.id === toAcc);
  const cur = account?.currency ?? s.settings.baseCurrency;
  const value = evalExpr(expr) ?? 0;
  const cents = Math.round(value * 100);
  const crossCurrency = mode === 'transfer' && toAccount && account && toAccount.currency !== account.currency;
  const autoTo = crossCurrency ? Math.round((cents * rate(s, cur)) / rate(s, toAccount!.currency)) : cents;
  const toCents = crossCurrency && toExpr ? Math.round((evalExpr(toExpr) ?? 0) * 100) : autoTo;
  const future = date > today();

  const cats = s.categories.filter((c) => c.kind === mode && (!c.archived || c.id === cat)).sort((a, b) => a.order - b.order);
  const rows = s.settings.catRows ?? 2;
  const limit = rows > 0 && !allCats && cats.length > rows * 4 ? rows * 4 - 1 : cats.length;
  let shownCats = cats.slice(0, limit);
  const selCat = cats.find((c) => c.id === cat);
  if (selCat && !shownCats.includes(selCat)) shownCats = [...shownCats.slice(0, limit - 1), selCat];
  const hiddenCount = cats.length - shownCats.length;
  const showTags = mode !== 'transfer' && s.settings.showTags !== false;
  const notes = useMemo(() => {
    const m = new Map<string, { n: number; cats: Map<string, number>; last: string }>();
    const add = (raw: string, catId: string, d: string) => {
      const v = raw.trim();
      if (!v) return;
      const e = m.get(v) ?? { n: 0, cats: new Map(), last: '' };
      e.n++;
      e.cats.set(catId, (e.cats.get(catId) ?? 0) + 1);
      if (d > e.last) e.last = d;
      m.set(v, e);
    };
    for (const x of s.txs) add(x.note, x.categoryId, x.date);
    for (const x of s.transfers) add(x.note, 'transfer', x.date);
    return m;
  }, [s.txs, s.transfers]);
  const noteSuggestions = useMemo(() => {
    if (!noteFocus) return [];
    const key = mode === 'transfer' ? 'transfer' : cat;
    const q = fold(note.trim());
    const list = [...notes.entries()].filter(([v, e]) => (q ? fold(v).includes(q) && v !== note.trim() : e.cats.has(key)));
    const starts = (v: string) => (!q ? 0 : fold(v).startsWith(q) ? 2 : fold(v).split(/\s+/).some((w) => w.startsWith(q)) ? 1 : 0);
    const score = (v: string, e: { n: number; cats: Map<string, number> }) => starts(v) * 1e6 + (e.cats.get(key) ?? 0) * 1000 + e.n;
    return list.sort((a, b) => score(b[0], b[1]) - score(a[0], a[1]) || (a[1].last < b[1].last ? 1 : -1)).slice(0, 8).map((x) => x[0]);
  }, [notes, note, noteFocus, cat, mode]);
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

  const addAttachment = async () => {
    const f = await pickFile('image/*,application/pdf');
    if (!f) return;
    const blob = await compressImage(f);
    const att: Attachment = { id: 'att-' + uid(), name: f.name || 'file', type: blob.type || f.type || 'application/octet-stream', size: blob.size };
    await putFile(att.id, blob);
    setAtts((a) => [...a, att]);
  };

  const save = async () => {
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
      if (future && done) nt.done = true;
      if (atts.length) nt.attachments = atts;
      if (rep) { nt.repeat = rep; nt.series = tx?.series ?? uid(); if (remind >= 0) nt.remind = remind; }
      else if (tx?.series) nt.series = tx.series;
      for (const old of tx?.attachments ?? []) if (!atts.some((a) => a.id === old.id)) deleteFile(old.id);
      if (rep && remind >= 0) notificationsAllowed(true);
      const stopSeries = !rep && tx?.repeat && tx.series;
      setState((st) => {
        let txs = tx ? st.txs.map((x) => (x.id === nt.id ? nt : x)) : [nt, ...st.txs];
        if (stopSeries) {
          const now = today();
          txs = txs.filter((x) => x.id === nt.id || x.series !== tx!.series || x.date <= now).map((x) => (x.series === tx!.series ? { ...x, repeat: undefined, remind: undefined } : x));
        } else if (rep && tx?.series) {
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
    for (const a of tx?.attachments ?? []) deleteFile(a.id);
    setState((st) => {
      let txs = tx ? st.txs.filter((x) => x.id !== tx.id) : st.txs;
      if (tx?.series && !txs.some((x) => x.series === tx.series && x.date >= tx.date)) {
        txs = txs.map((x) => (x.series === tx.series ? { ...x, repeat: undefined } : x));
      }
      return { ...st, txs, transfers: transfer ? st.transfers.filter((x) => x.id !== transfer.id) : st.transfers };
    });
    toast(t('deleted'));
    close();
  };

  const scMatch = (s.shortcuts ?? []).find((x) => x.kind === mode && x.categoryId === cat && x.accountId === acc && x.note.trim() === note.trim());
  const saveShortcut = () => {
    if (mode === 'transfer') return;
    if (scMatch) {
      setState((st) => ({ ...st, shortcuts: (st.shortcuts ?? []).filter((x) => x.id !== scMatch.id) }));
      toast(t('shortcutRemoved'));
      return;
    }
    if (!cat) return toast(t('chooseCategory'));
    addShortcut({ kind: mode, categoryId: cat, accountId: acc, amount: cents > 0 ? cents : undefined, note: note.trim() });
    toast(t('shortcutSaved'));
  };

  const addTag = (g: string) => {
    const v = g.trim().replace(/^#/, '');
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput('');
  };

  const chooseDate = async () => {
    const d = await pickDate(date, t('date'));
    if (d) setDate(d);
  };

  const keys = ['7', '8', '9', 'back', '÷', '4', '5', '6', '+', '×', '1', '2', '3', '-', 'ok', '00', '0', ',', '='];
  const display = editingTo ? toExpr : expr;
  const shownCur = editingTo ? toAccount!.currency : cur;
  const sym = money(0, shownCur, locale).replace(/[\d\s.,\u00a0]/g, '');
  const typed = display.replace(/[+\-×÷]/g, ' $& ');
  const result = money(editingTo ? toCents : cents, shownCur, locale);
  const quick = [addDays(today(), -1), today()];
  const custom = !quick.includes(date);
  const tagSuggestions = allTags.filter((g) => !tags.includes(g) && (!tagInput || g.toLowerCase().includes(tagInput.toLowerCase()))).slice(0, 10);

  return (
    <Sheet
      full
      title={tx || transfer ? t('editTransaction') : t('newTransaction')}
      actions={<>
        {mode !== 'transfer' && s.settings.shortcutsOn !== false && (
          <button className="icon-btn" onClick={saveShortcut} aria-label={t('newShortcut')} title={t('newShortcut')} style={scMatch ? { color: '#FFB020' } : undefined}>
            {scMatch ? <PiLightningFill /> : <PiLightningBold />}
          </button>
        )}
        {(tx || transfer) && <button className="icon-btn" style={{ color: 'var(--exp)' }} onClick={remove} aria-label="delete"><PiTrashBold /></button>}
      </>}
    >
      <div className="sheet-b" style={{ paddingBottom: 12 }} onFocusCapture={(e) => { if ((e.target as HTMLElement).tagName === 'INPUT') setPad(false); }}
        onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('.amount-box, .field-to, .seg')) setPad(false); }}>
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

        <div className={'amount-box' + (pad ? ' on' : '')} onClick={() => { setPad(true); setEditingTo(false); (document.activeElement as HTMLElement)?.blur?.(); }}>
          <div className="cur">{editingTo ? `${t('received')} · ${toAccount?.currency}` : `${t('amount')} · ${cur}`}</div>
          <div className="val" style={{ color: mode === 'income' ? 'var(--inc)' : mode === 'expense' ? 'var(--ink)' : 'var(--xfer)' }}>
            <span className="sym">{sym}</span>{display ? typed : <span className="ph">0</span>}{pad && <i className="caret" />}
          </div>
          <div className="expr">{/[+\-×÷]/.test(display) ? '= ' + result : ' '}</div>
        </div>

        <div className="label">{mode === 'transfer' ? t('fromAccount') : t('account')}</div>
        <div className="pills">
          {accounts.map((a) => (
            <button key={a.id} className={'pill' + (acc === a.id ? ' on' : '')} onClick={() => setAcc(a.id)}>
              <Bubble icon={a.icon} color={a.color} size={26} /> {a.name}
            </button>
          ))}
        </div>

        {mode === 'transfer' ? (
          <>
            <div style={{ display: 'grid', placeItems: 'center', margin: '6px 0 0', color: 'var(--muted)' }}><PiArrowDownBold size={20} /></div>
            <div className="label" style={{ marginTop: 0 }}>{t('toAccount')}</div>
            <div className="pills" style={{ marginBottom: 10 }}>
              {accounts.filter((a) => a.id !== acc).map((a) => (
                <button key={a.id} className={'pill' + (toAcc === a.id ? ' on' : '')} onClick={() => setToAcc(a.id)}>
                  <Bubble icon={a.icon} color={a.color} size={26} /> {a.name}
                </button>
              ))}
            </div>
            {crossCurrency && (
              <button className="field field-to" style={{ width: '100%', textAlign: 'left', outline: editingTo ? '2px solid var(--brand)' : 'none' }} onClick={() => { setEditingTo(true); setPad(true); if (!toExpr) setToExpr(fmtExpr(autoTo)); }}>
                <span>{t('received')} ({toAccount!.currency})</span>
                <b className="num" style={{ fontSize: 20 }}>{money(toCents, toAccount!.currency, locale)}</b>
                <div className="small muted">1 {cur} = {(toCents / Math.max(cents, 1)).toFixed(4)} {toAccount!.currency}</div>
              </button>
            )}
          </>
        ) : (
          <>
            <div className="label">{t('category')}</div>
            <div className="cgrid picker" style={{ marginBottom: 6 }}>
              {shownCats.map((c) => (
                <button key={c.id} className={'c' + (cat === c.id ? ' on' : '')} onClick={() => { tap(); setCat(c.id); }}>
                  <Bubble icon={c.icon} color={c.color} size={50} solid={cat === c.id} />
                  <span className="nm">{c.name}</span>
                </button>
              ))}
              {hiddenCount > 0 && (
                <button className="c" onClick={() => setAllCats(true)}>
                  <span className="bubble more"><PiDotsThreeBold /></span>
                  <span className="nm">{t('moreN', { n: String(hiddenCount) })}</span>
                </button>
              )}
            </div>
          </>
        )}

        <div className="label">{t('date')}</div>
        <div className="pills">
          {quick.map((d, i) => (
            <button key={d} className={'pill text' + (date === d ? ' on' : '')} onClick={() => setDate(d)}>{i === 0 ? t('yesterday') : t('today')}</button>
          ))}
          <button className={'pill text' + (custom ? ' on' : '')} onClick={chooseDate}>
            <PiCalendarBlankBold /> {custom ? parseIso(date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : t('otherDate')}
          </button>
        </div>
        {future && (
          <div className="paper" style={{ padding: '10px 14px', margin: '8px 0 0' }}>
            <div className="row">
              <span className="tag plan">{t('planned')}</span>
              <span className="small muted grow">{done ? t('countsNow') : t('plannedHint')}</span>
            </div>
            {mode !== 'transfer' && (
              <div className="row" style={{ marginTop: 10 }}>
                <b className="grow" style={{ fontWeight: 600 }}>{mode === 'income' ? t('alreadyReceived') : t('alreadyPaid')}</b>
                <Switch on={done} onChange={setDone} />
              </div>
            )}
          </div>
        )}

        {mode !== 'transfer' && (
          <>
            <div className="label">{t('repeat')}</div>
            <div className="pills">
              {(['', 'monthly', 'weekly', 'yearly'] as const).map((r) => (
                <button key={r || 'none'} className={'pill text' + (rep === r ? ' on' : '')} onClick={() => { setRep(r); if (r && remind < 0) setRemind(1); }}>
                  {r === '' ? t('noRepeat') : t(r)}
                </button>
              ))}
            </div>
            {rep && (
              <>
                <div className="label"><PiBellRingingBold style={{ verticalAlign: -2 }} /> {t('reminder')}</div>
                <div className="pills">
                  {[-1, 0, 1, 3, 7].map((d) => (
                    <button key={d} className={'pill text' + (remind === d ? ' on' : '')} onClick={() => setRemind(d)}>
                      {d < 0 ? t('noReminder') : d === 0 ? t('onTheDay') : t('daysBefore', { n: String(d) })}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <div style={{ height: 12 }} />
        <label className="field">
          <span>{t('note')}</span>
          <input value={note} placeholder={t('notePh')} type="text" inputMode="text" autoCapitalize="sentences" autoComplete="off" enterKeyHint="done"
            onFocus={() => setNoteFocus(true)} onBlur={() => setTimeout(() => setNoteFocus(false), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            onChange={(e) => setNote(e.target.value)} />
          {noteSuggestions.length > 0 && (
            <div className="note-sugg">
              {noteSuggestions.map((n) => (
                <button key={n} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setNote(n); (document.activeElement as HTMLElement)?.blur?.(); }}>{n}</button>
              ))}
            </div>
          )}
        </label>

        {showTags && (
          <div className="field">
            <span>{t('tags')}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {tags.map((g) => (
                <button key={g} className="tag lilac" style={{ padding: '5px 10px' }} onClick={() => setTags(tags.filter((x) => x !== g))}><PiHashBold /> {g} <PiXBold /></button>
              ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <input value={tagInput} placeholder={t('addTag')} type="text" inputMode="text" autoComplete="off" enterKeyHint="done" style={{ flex: 1, fontSize: 16 }}
                onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag(tagInput)} />
              {tagInput && <button className="mini-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => addTag(tagInput)}><PiPlusBold /> {t('addTag')}</button>}
            </div>
            {tagSuggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {tagSuggestions.map((g) => (
                  <button key={g} className="tag" style={{ padding: '5px 10px' }} onMouseDown={(e) => e.preventDefault()} onClick={() => addTag(g)}>#{g}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {mode !== 'transfer' && (
          <>
            <div className="label"><PiPaperclipBold style={{ verticalAlign: -2 }} /> {t('attachments')}</div>
            <div className="atts">
              {atts.map((a) => <AttachmentThumb key={a.id} att={a} onRemove={() => setAtts(atts.filter((x) => x.id !== a.id))} />)}
              <button className="att add" onClick={addAttachment}><PiPlusBold /></button>
            </div>
          </>
        )}
      </div>

      {pad && (
        <div className="keypad">
          {keys.map((k) =>
            k === 'ok' ? (
              <button key={k} className="ok" style={{ gridRow: 'span 2' }} onClick={save} aria-label="save"><PiCheckBold /></button>
            ) : (
              <button key={k} className={/[+\-×÷=]/.test(k) || k === 'back' ? 'op' : ''} onClick={() => press(k)}>
                {k === 'back' ? <PiBackspaceBold /> : k === '-' ? '−' : k}
              </button>
            ),
          )}
        </div>
      )}
      {!pad && (
        <div className="sheet-f">
          <button className="btn primary" onMouseDown={(e) => e.preventDefault()} onClick={save}><PiCheckBold /> {t('save')}</button>
        </div>
      )}
    </Sheet>
  );
}
