export type Cents = number;
export type Kind = 'expense' | 'income';

export interface Account {
  id: string;
  name: string;
  icon: string;
  color: string;
  currency: string;
  initial: Cents; // opening balance in account currency
  includeInTotal: boolean;
  archived: boolean;
  order: number;
  note?: string;
}

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  icon: string;
  color: string;
  budget?: Cents; // monthly limit in base currency
  essential?: boolean; // undefined = guessed from the name (reports)
  archived: boolean;
  order: number;
}

export interface Tx {
  id: string;
  kind: Kind;
  accountId: string;
  categoryId: string;
  amount: Cents; // in account currency (positive)
  base: Cents; // in base currency at the time of the transaction
  date: string; // YYYY-MM-DD
  note: string;
  tags: string[];
  created: string;
  repeat?: Repeat; // recurring series: next occurrence is created automatically
  series?: string;
  done?: boolean; // future-dated but already paid/received: counts in the balance now
  remind?: number; // days before the due date to notify (recurring bills); undefined = no reminder
  attachments?: Attachment[];
}

export interface Attachment {
  id: string; // key of the file in IndexedDB
  name: string;
  type: string;
  size: number;
}

export type Repeat = 'weekly' | 'monthly' | 'yearly';

export interface Transfer {
  id: string;
  from: string;
  to: string;
  fromAmount: Cents;
  toAmount: Cents;
  date: string;
  note: string;
  created: string;
}

export type Theme = 'system' | 'light' | 'dark';
export type Lang = 'auto' | 'en' | 'pt';

export interface Settings {
  name: string;
  baseCurrency: string;
  rates: Record<string, number>; // 1 unit of currency = N base
  ratesUpdated?: string;
  theme: Theme;
  lang: Lang;
  hideBalance: boolean;
  weekStart: 0 | 1;
  onboarded: boolean;
  autoBackup: boolean;
  lastBackup?: string;
  billReminders: boolean;
  lastBackupTxs?: number;
  pinHash?: string; // app lock: sha-256(salt + pin)
  pinSalt?: string;
  pinLen?: number;
  biometric?: boolean;
  catRows?: number; // category rows shown in the transaction editor (0 = all, default 2)
  shortcutsOn?: boolean; // shortcut chips on Home + ⚡ in the editor (default on)
  haptics?: boolean; // vibrate on taps (default on)
  showTags?: boolean; // tags field in the transaction editor (default on)
}

export interface State {
  version: 1;
  accounts: Account[];
  categories: Category[];
  txs: Tx[];
  transfers: Transfer[];
  shortcuts?: Shortcut[];
  settings: Settings;
}

/** One-tap launch preset ("Padaria · Café · N26"). */
export interface Shortcut {
  id: string;
  kind: Kind;
  categoryId: string;
  accountId: string;
  amount?: Cents; // fixed amount, optional
  note: string;
}
