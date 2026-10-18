import { useEffect, useState, type ReactNode } from 'react';
import { iconFor } from '../lib/icons';
import { closeOverlay, openOverlay, useOverlays, useToast } from '../lib/nav';
import { useStore } from '../lib/store';
import { money } from '../lib/format';
import { useT } from '../i18n';
import { PiXBold, PiCaretLeftBold, PiCaretRightBold } from 'react-icons/pi';

export function lighten(hex: string, amt = 0.25) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
  return `rgb(${r},${g},${b})`;
}

export function Bubble({ icon, color, size = 46, round = false }: { icon: string; color: string; size?: number; round?: boolean }) {
  const I = iconFor(icon);
  return (
    <div
      className={'bubble' + (round ? ' round' : '')}
      style={{ width: size, height: size, borderRadius: round ? '50%' : size * 0.36, background: `linear-gradient(145deg, ${lighten(color, 0.28)}, ${color})`, boxShadow: `0 8px 18px ${color}40` }}
    >
      <I />
    </div>
  );
}

export function Money({ cents, currency, sign, compact, className, hide }: { cents: number; currency?: string; sign?: boolean; compact?: boolean; className?: string; hide?: boolean }) {
  const s = useStore();
  const { locale } = useT();
  const cur = currency ?? s.settings.baseCurrency;
  const hidden = hide ?? s.settings.hideBalance;
  if (hidden) return <span className={className}>••••</span>;
  return <span className={className}>{money(cents, cur, locale, { sign, compact })}</span>;
}

export function Seg<T extends string>({ value, options, onChange, color, small }: { value: T; options: { v: T; label: ReactNode; cls?: string }[]; onChange: (v: T) => void; color?: boolean; small?: boolean }) {
  return (
    <div className={'seg' + (color ? ' color' : '') + (small ? ' small' : '')}>
      {options.map((o) => (
        <button key={o.v} className={(value === o.v ? 'on ' : '') + (o.cls ?? '')} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)} role="switch" aria-checked={on} />;
}

export function Sheet({ title, children, footer, full, onClose, actions }: { title?: ReactNode; children: ReactNode; footer?: ReactNode; full?: boolean; onClose?: () => void; actions?: ReactNode }) {
  return (
    <>
      <div className={'sheet' + (full ? ' full' : '')} onClick={(e) => e.stopPropagation()}>
        {!full && <div className="grab" />}
        {(title || actions) && (
          <div className="sheet-h">
            <h2>{title}</h2>
            {actions}
            <button className="round-btn" style={{ width: 40, height: 40, boxShadow: 'none', background: 'var(--card2)' }} onClick={onClose ?? closeOverlay} aria-label="close">
              <PiXBold />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="sheet-f">{footer}</div>}
      </div>
    </>
  );
}

export function OverlayHost() {
  const ovs = useOverlays();
  useEffect(() => {
    document.body.style.overflow = ovs.length ? 'hidden' : '';
  }, [ovs.length]);
  return (
    <>
      {ovs.map((o) => (
        <div key={o.id} className={o.closing ? 'closing-wrap' : ''}>
          <div className={'scrim' + (o.closing ? ' closing' : '')} onClick={closeOverlay} />
          <div className={o.closing ? 'closing-inner' : ''}>{o.render(closeOverlay)}</div>
        </div>
      ))}
    </>
  );
}

export function Toast() {
  const t = useToast();
  if (!t) return null;
  return <div className="toast" key={t.id}>{t.text}</div>;
}

export function confirmDialog(text: string, okLabel: string, cancelLabel: string, danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    openOverlay((close) => (
      <ConfirmBody
        text={text}
        okLabel={okLabel}
        cancelLabel={cancelLabel}
        danger={danger}
        onDone={(v) => {
          if (done) return;
          done = true;
          resolve(v);
          close();
        }}
      />
    ));
  });
}

function ConfirmBody({ text, okLabel, cancelLabel, danger, onDone }: { text: string; okLabel: string; cancelLabel: string; danger: boolean; onDone: (v: boolean) => void }) {
  useEffect(() => () => onDone(false), []);
  return (
    <div className="sheet">
      <div className="grab" />
      <div className="sheet-b" style={{ paddingTop: 18, fontSize: 17, fontWeight: 600, lineHeight: 1.4 }}>{text}</div>
      <div className="sheet-f">
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => onDone(false)}>{cancelLabel}</button>
        <button className={'btn ' + (danger ? 'danger' : 'primary')} style={{ flex: 1 }} onClick={() => onDone(true)}>{okLabel}</button>
      </div>
    </div>
  );
}

export function PeriodNav({ label, onPrev, onNext, nextDisabled, onLabel }: { label: string; onPrev: () => void; onNext: () => void; nextDisabled?: boolean; onLabel?: () => void }) {
  return (
    <div className="period-nav">
      <button className="arrow" onClick={onPrev} aria-label="prev"><PiCaretLeftBold /></button>
      <b onClick={onLabel}>{label}</b>
      <button className="arrow" onClick={onNext} disabled={nextDisabled} aria-label="next"><PiCaretRightBold /></button>
    </div>
  );
}

export function Empty({ icon = 'sparkle', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <Bubble icon={icon} color="#9B8CFF" size={64} round />
      <b>{title}</b>
      {hint && <span className="small">{hint}</span>}
    </div>
  );
}

export function useDelayed<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
