import type { Account, Category, Settings, State } from './types';

export function detectLang(): 'en' | 'pt' {
  const l = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
  return l.startsWith('pt') ? 'pt' : 'en';
}

export function guessCurrency(): string {
  const l = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  const region = (l.split('-')[1] || '').toUpperCase();
  const map: Record<string, string> = {
    BR: 'BRL', PT: 'EUR', US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', IN: 'INR', JP: 'JPY', MX: 'MXN',
    DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', AO: 'AOA', MZ: 'MZN', CH: 'CHF',
  };
  if (map[region]) return map[region];
  return l.toLowerCase().startsWith('pt') ? 'BRL' : 'USD';
}

export function defaultSettings(): Settings {
  return {
    name: '',
    baseCurrency: guessCurrency(),
    rates: {},
    theme: 'system',
    lang: 'auto',
    hideBalance: false,
    weekStart: 1,
    onboarded: false,
    autoBackup: true,
    billReminders: true,
    haptics: true,
    showTags: true,
  };
}

const CAT_SEED: [string, string, string, string, string][] = [
  // id, en, pt, icon, color
  ['home', 'Home', 'Casa', 'house', '#3D8BFF'],
  ['groceries', 'Groceries', 'Mercado', 'basket', '#14C2B8'],
  ['food', 'Restaurants', 'Restaurantes', 'fork-knife', '#FFB020'],
  ['cafe', 'Coffee', 'Café', 'coffee', '#8D6E63'],
  ['transport', 'Transport', 'Transporte', 'bus', '#22B8E6'],
  ['car', 'Car', 'Carro', 'car', '#FF5FA2'],
  ['health', 'Health', 'Saúde', 'heartbeat', '#FF6B6B'],
  ['sport', 'Fitness', 'Exercício', 'barbell', '#3DD68C'],
  ['leisure', 'Leisure', 'Lazer', 'game-controller', '#B57BFF'],
  ['education', 'Education', 'Educação', 'graduation-cap', '#4C6EF5'],
  ['family', 'Family', 'Família', 'users-three', '#E8590C'],
  ['gifts', 'Gifts', 'Presentes', 'gift', '#E056FD'],
  ['shopping', 'Shopping', 'Compras', 'shopping-bag', '#C2255C'],
  ['travel', 'Travel', 'Viagens', 'airplane-tilt', '#F5C400'],
  ['bills', 'Bills', 'Contas fixas', 'receipt', '#5B4BDB'],
  ['other_expense', 'Other', 'Outros', 'question', '#495057'],
];
const INC_SEED: [string, string, string, string, string][] = [
  ['salary', 'Salary', 'Salário', 'hand-coins', '#3D8BFF'],
  ['interest', 'Interest', 'Juros', 'bank', '#3DD68C'],
  ['gift_in', 'Gifts', 'Presentes', 'gift', '#E056FD'],
  ['freelance', 'Freelance', 'Freelance', 'laptop', '#7C5CFF'],
  ['other_income', 'Other', 'Outros', 'question', '#495057'],
];

export function initialState(lang: 'en' | 'pt'): State {
  const s = defaultSettings();
  const pick = (r: [string, string, string, string, string]) => (lang === 'pt' ? r[2] : r[1]);
  const categories: Category[] = [
    ...CAT_SEED.map((r, i) => ({ id: r[0], name: pick(r), kind: 'expense' as const, icon: r[3], color: r[4], archived: false, order: i })),
    ...INC_SEED.map((r, i) => ({ id: r[0], name: pick(r), kind: 'income' as const, icon: r[3], color: r[4], archived: false, order: i })),
  ];
  const accounts: Account[] = [
    { id: 'wallet', name: lang === 'pt' ? 'Carteira' : 'Wallet', icon: 'wallet', color: '#7C5CFF', currency: s.baseCurrency, initial: 0, includeInTotal: true, archived: false, order: 0 },
    { id: 'bank', name: lang === 'pt' ? 'Conta bancária' : 'Bank account', icon: 'bank', color: '#3D8BFF', currency: s.baseCurrency, initial: 0, includeInTotal: true, archived: false, order: 1 },
  ];
  return { version: 1, accounts, categories, txs: [], transfers: [], settings: s };
}

export const CURRENCIES = ['BRL', 'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'MXN', 'ARS', 'CLP', 'COP', 'AOA', 'MZN', 'INR', 'CNY', 'BTC'];
