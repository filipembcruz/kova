import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { initKeyboard } from './native';

initKeyboard();

createRoot(document.getElementById('root')!).render(<App />);
