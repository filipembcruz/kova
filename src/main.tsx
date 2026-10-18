import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { initKeyboard, initBackButton, minimizeApp, initInsets } from './native';
import { handleBack } from './lib/nav';

initInsets();
initKeyboard();
initBackButton(() => handleBack(minimizeApp));

createRoot(document.getElementById('root')!).render(<App />);
