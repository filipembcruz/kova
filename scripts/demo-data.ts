// Generates a demo backup (fake data) used for README screenshots: npx tsx scripts/demo-data.ts > demo.json
import { initialState } from '../src/lib/defaults';
import { addDays, today, uid } from '../src/lib/calc';
const lang = (process.argv[2] as 'en' | 'pt') || 'en';
const s = initialState(lang);
s.settings.name = 'Alex';
s.settings.baseCurrency = 'USD';
s.settings.onboarded = true;
s.settings.rates = { EUR: 1.08 };
s.accounts = [
  { id: 'wallet', name: lang === 'pt' ? 'Carteira' : 'Wallet', icon: 'wallet', color: '#7C5CFF', currency: 'USD', initial: 32000, includeInTotal: true, archived: false, order: 0 },
  { id: 'bank', name: 'Main Bank', icon: 'bank', color: '#3D8BFF', currency: 'USD', initial: 520000, includeInTotal: true, archived: false, order: 1 },
  { id: 'savings', name: lang === 'pt' ? 'Reserva' : 'Savings', icon: 'piggy-bank', color: '#FF5FA2', currency: 'USD', initial: 1250000, includeInTotal: true, archived: false, order: 2 },
  { id: 'euro', name: 'Euro card', icon: 'currency-eur', color: '#3DD68C', currency: 'EUR', initial: 180000, includeInTotal: true, archived: false, order: 3 },
];
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const notes: Record<string, string[]> = {
  groceries: ['Supermarket', 'Farmers market'], food: ['Sushi night', 'Pizza', 'Lunch'], cafe: ['Latte', 'Espresso'], transport: ['Metro', 'Uber'],
  home: ['Rent', 'Electricity'], health: ['Pharmacy'], leisure: ['Cinema', 'Concert'], shopping: ['Sneakers'], bills: ['Internet', 'Phone'], travel: ['Flight'],
};
const cats = Object.keys(notes);
for (let d = 0; d < 200; d++) {
  const date = addDays(today(), -d);
  const n = Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const c = cats[Math.floor(rnd() * cats.length)];
    const amt = Math.round((c === 'home' ? 40000 + rnd() * 60000 : c === 'travel' ? 20000 + rnd() * 30000 : 500 + rnd() * 9000));
    const acc = rnd() < 0.15 ? 'euro' : rnd() < 0.5 ? 'wallet' : 'bank';
    const base = acc === 'euro' ? Math.round(amt * 1.08) : amt;
    s.txs.push({ id: uid(), kind: 'expense', accountId: acc, categoryId: c, amount: amt, base, date, note: notes[c][Math.floor(rnd() * notes[c].length)], tags: [], created: date + 'T12:00:00Z' });
  }
  if (date.endsWith('-01')) s.txs.push({ id: uid(), kind: 'income', accountId: 'bank', categoryId: 'salary', amount: 620000, base: 620000, date, note: 'Salary', tags: [], created: date + 'T09:00:00Z' });
  if (date.endsWith('-05')) s.txs.push({ id: uid(), kind: 'income', accountId: 'savings', categoryId: 'interest', amount: 9000 + Math.round(rnd() * 3000), base: 9500, date, note: '', tags: [], created: date + 'T09:00:00Z' });
}
s.categories = s.categories.map((c) => (c.id === 'food' ? { ...c, budget: 45000 } : c.id === 'groceries' ? { ...c, budget: 60000 } : c));
s.txs.sort((a, b) => (a.date < b.date ? 1 : -1));
console.log(JSON.stringify({ app: 'kova', version: 1, state: s }));
