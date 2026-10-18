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
}

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
}

export interface State {
  version: 1;
  accounts: Account[];
  categories: Category[];
  txs: Tx[];
  transfers: Transfer[];
  settings: Settings;
}
