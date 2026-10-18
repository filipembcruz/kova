import { useEffect, useState } from 'react';
import { PiHouseDuotone, PiWalletDuotone, PiChartPieSliceDuotone, PiSquaresFourDuotone, PiGearSixDuotone, PiPlusBold, PiDownloadSimpleBold, PiSparkleBold } from 'react-icons/pi';
import { isLoaded, loadState, setState, useStore } from './lib/store';
import { useT } from './i18n';
import { goTab, useRoute } from './lib/nav';
import { OverlayHost, Toast } from './components/ui';
import { openTxEditor } from './components/TxEditor';
import { Home } from './screens/Home';
import { Accounts } from './screens/Accounts';
import { Charts } from './screens/Charts';
import { Categories } from './screens/Categories';
import { Settings, runMmImport, updateRates } from './screens/Settings';
import { Transactions } from './screens/Transactions';
import { setStatusBar } from './native';

function useTheme() {
  const s = useStore();
  const [sysDark, setSysDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq?.addEventListener?.('change', fn);
    return () => mq?.removeEventListener?.('change', fn);
  }, []);
  const dark = s.settings.theme === 'dark' || (s.settings.theme === 'system' && sysDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const bg = dark ? '#0e0c16' : '#f4f1fb';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg);
    setStatusBar(dark, bg);
  }, [dark]);
}

export function App() {
  const [ready, setReady] = useState(isLoaded());
  useEffect(() => {
    loadState().then(() => setReady(true));
  }, []);
  useTheme();
  if (!ready) return null;
  return <Shell />;
}

function Shell() {
  const s = useStore();
  useEffect(() => {
    const last = s.settings.ratesUpdated ? new Date(s.settings.ratesUpdated).getTime() : 0;
    if (s.settings.onboarded && Date.now() - last > 12 * 3600e3 && s.accounts.some((a) => a.currency !== s.settings.baseCurrency)) updateRates();
  }, []);
  return (
    <>
      {s.settings.onboarded ? <Main /> : <Welcome />}
      <OverlayHost />
      <Toast />
    </>
  );
}

function Main() {
  const { t } = useT();
  const r = useRoute();
  const path = r.path;
  const isTab = ['/', '/accounts', '/charts', '/categories', '/settings'].includes(path);
  let screen;
  if (path === '/accounts') screen = <Accounts />;
  else if (path === '/charts') screen = <Charts />;
  else if (path === '/categories') screen = <Categories />;
  else if (path === '/settings') screen = <Settings />;
  else if (path === '/tx') screen = <Transactions key={r.query.toString()} />;
  else screen = <Home />;

  const tabs = [
    { p: '/', icon: PiHouseDuotone, l: t('home') },
    { p: '/accounts', icon: PiWalletDuotone, l: t('accounts') },
    { p: '/charts', icon: PiChartPieSliceDuotone, l: t('charts') },
    { p: '/categories', icon: PiSquaresFourDuotone, l: t('categories') },
    { p: '/settings', icon: PiGearSixDuotone, l: t('settings') },
  ];
  const showFab = path === '/' || path === '/accounts' || path === '/tx';
  const accFromRoute = path === '/tx' ? r.query.get('acc') ?? undefined : undefined;

  return (
    <>
      <div className={'app' + (isTab ? '' : ' sub')}>{screen}</div>
      {showFab && (
        <button className="fab" style={!isTab ? { bottom: 'calc(24px + var(--safe-bottom))' } : undefined} onClick={() => openTxEditor({ accountId: accFromRoute })} aria-label="add">
          <PiPlusBold />
        </button>
      )}
      {isTab && (
        <nav className="nav">
          {tabs.map((x) => (
            <button key={x.p} className={path === x.p ? 'on' : ''} onClick={() => goTab(x.p)}>
              <x.icon />
              <span>{x.l}</span>
            </button>
          ))}
        </nav>
      )}
    </>
  );
}

function Welcome() {
  const { t } = useT();
  return (
    <div className="welcome">
      <div className="art">
        <svg viewBox="0 0 300 260" width="300" height="260" aria-hidden>
          <defs>
            <linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7c5cff" /><stop offset="1" stopColor="#ff5fa2" /></linearGradient>
            <linearGradient id="wg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3dd68c" /><stop offset="1" stopColor="#12b886" /></linearGradient>
          </defs>
          <circle cx="150" cy="130" r="118" fill="url(#wg)" opacity=".12" />
          <rect x="62" y="70" width="176" height="112" rx="26" fill="url(#wg)" />
          <rect x="62" y="96" width="176" height="18" fill="#000" opacity=".12" />
          <rect x="84" y="140" width="64" height="12" rx="6" fill="#fff" opacity=".85" />
          <circle cx="206" cy="146" r="14" fill="#ffd36b" />
          <circle cx="226" cy="58" r="26" fill="url(#wg2)" />
          <text x="226" y="66" textAnchor="middle" fontSize="24" fontWeight="700" fill="#fff">$</text>
          <circle cx="70" cy="200" r="20" fill="#ffb020" />
          <text x="70" y="207" textAnchor="middle" fontSize="18" fontWeight="700" fill="#fff">€</text>
          <rect x="196" y="196" width="18" height="34" rx="6" fill="#9b8cff" />
          <rect x="220" y="182" width="18" height="48" rx="6" fill="#ff5fa2" />
          <rect x="244" y="206" width="18" height="24" rx="6" fill="#3d8bff" />
        </svg>
      </div>
      <img className="logo" src="logo.svg" alt="Kova" />
      <h1>{t('welcomeTitle')}</h1>
      <p>{t('welcomeText')}</p>
      <button className="btn grad" style={{ width: '100%', flex: 'none' }} onClick={() => setState((s) => ({ ...s, settings: { ...s.settings, onboarded: true } }))}>
        <PiSparkleBold /> {t('startFresh')}
      </button>
      <button className="btn ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => runMmImport(t)}>
        <PiDownloadSimpleBold /> {t('importOther')}
      </button>
    </div>
  );
}
