import { useEffect, useState } from 'react';
import { PiBackspaceBold, PiFingerprintBold } from 'react-icons/pi';
import { getState, setState, useStore } from '../lib/store';
import { useT } from '../i18n';
import { Sheet } from './ui';
import { toast } from '../lib/nav';
import { biometricAuth, tap } from '../native';
import { uid } from '../lib/calc';

async function hashPin(salt: string, pin: string) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkPin(pin: string) {
  const st = getState().settings;
  if (!st.pinHash || !st.pinSalt) return true;
  return (await hashPin(st.pinSalt, pin)) === st.pinHash;
}

export async function setPin(pin: string | null) {
  if (!pin) {
    setState((s) => ({ ...s, settings: { ...s.settings, pinHash: undefined, pinSalt: undefined, pinLen: undefined, biometric: false } }));
    return;
  }
  const salt = uid() + uid();
  const hash = await hashPin(salt, pin);
  setState((s) => ({ ...s, settings: { ...s.settings, pinHash: hash, pinSalt: salt, pinLen: pin.length } }));
}

/** Number pad with dots. `len` fixed → submits automatically; otherwise shows a ✓ key (4–6 digits). */
function PinPad({ len, onDone, error, reset = 0 }: { len?: number; onDone: (pin: string) => void; error: number; reset?: number }) {
  const [pin, setPinV] = useState('');
  useEffect(() => { if (error || reset) setPinV(''); }, [error, reset]);
  const max = len ?? 6;
  const press = (k: string) => {
    tap();
    if (k === 'back') return setPinV(pin.slice(0, -1));
    if (k === 'ok') { if (pin.length >= 4) onDone(pin); return; }
    if (pin.length >= max) return;
    const next = pin + k;
    setPinV(next);
    if (len && next.length === len) setTimeout(() => onDone(next), 80);
  };
  return (
    <>
      <div className={'dots' + (error ? ' err' : '')} key={error}>
        {Array.from({ length: len ?? Math.max(4, pin.length) }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => <button key={k} onClick={() => press(k)}>{k}</button>)}
        {len ? <span /> : <button className="ghost" onClick={() => press('ok')} style={{ fontSize: 16 }}>OK</button>}
        <button onClick={() => press('0')}>0</button>
        <button className="ghost" onClick={() => press('back')} aria-label="back"><PiBackspaceBold /></button>
      </div>
    </>
  );
}

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const s = useStore();
  const { t } = useT();
  const [err, setErr] = useState(0);
  const [msg, setMsg] = useState('');
  const bio = async () => {
    if (await biometricAuth('Kova', t('usePin'))) onUnlock();
  };
  useEffect(() => { if (s.settings.biometric) bio(); }, []);
  const done = async (pin: string) => {
    if (await checkPin(pin)) onUnlock();
    else { setErr(err + 1); setMsg(t('wrongPin')); }
  };
  return (
    <div className="lock">
      <img src="logo.svg" alt="Kova" />
      <h2>{t('enterPin')}</h2>
      <div className="msg">{msg}</div>
      <PinPad len={s.settings.pinLen} onDone={done} error={err} />
      {s.settings.biometric && <button className="btn ghost" style={{ background: 'rgba(255,255,255,.14)', color: '#fff', boxShadow: 'none', marginTop: 8 }} onClick={bio}><PiFingerprintBold /> {t('useBiometric')}</button>}
      {err >= 3 && <div className="msg" style={{ maxWidth: 300 }}>{t('forgotPin')}</div>}
    </div>
  );
}

/** Sheet to create a PIN (twice) or to confirm the current one. */
export function PinSheet({ mode, close, onOk }: { mode: 'create' | 'verify'; close: () => void; onOk?: () => void }) {
  const { t } = useT();
  const [first, setFirst] = useState<string | null>(null);
  const [err, setErr] = useState(0);
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState('');
  const done = async (pin: string) => {
    if (mode === 'verify') {
      if (await checkPin(pin)) { close(); onOk?.(); } else { setErr(err + 1); setMsg(t('wrongPin')); }
      return;
    }
    if (!first) { setFirst(pin); setStep(step + 1); setMsg(''); return; }
    if (pin !== first) { setFirst(null); setErr(err + 1); setMsg(t('pinMismatch')); return; }
    await setPin(pin);
    toast(t('pinSet'));
    close();
    onOk?.();
  };
  const title = mode === 'verify' ? t('currentPin') : first ? t('confirmPin') : t('newPin');
  return (
    <Sheet title={t('appLock')}>
      <div className="sheet-b pin-sheet" style={{ display: 'grid', justifyItems: 'center', gap: 14, paddingBottom: 24 }}>
        <b style={{ fontSize: 16 }}>{title}</b>
        <div className="small" style={{ color: 'var(--exp)', minHeight: 18 }}>{msg}</div>
        <PinPad len={mode === 'verify' ? getState().settings.pinLen : first ? first.length : undefined} onDone={done} error={err} reset={step} />
      </div>
    </Sheet>
  );
}
