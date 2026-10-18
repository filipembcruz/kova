import { ICONS, ICON_GROUPS } from './icons.generated';
export { ICONS, ICON_GROUPS };

// Icon names used by the imported .mmbackup format → our icon keys
export const LEGACY_ICON: Record<string, string> = {
  bank: 'bank',
  boat1: 'sailboat',
  boy: 'baby',
  building: 'buildings',
  burger: 'hamburger',
  cafe: 'fork-knife',
  car: 'car',
  cards: 'cards',
  cash: 'money',
  children: 'users',
  coffee_cup: 'coffee',
  coins: 'coins',
  console: 'game-controller',
  deposit: 'seal-percent',
  education: 'graduation-cap',
  euro: 'currency-eur',
  family: 'users-three',
  haircut: 'scissors',
  heart: 'heartbeat',
  home: 'house',
  other: 'question',
  payment: 'hand-coins',
  piggy_bank: 'piggy-bank',
  prepaid: 'hand-deposit',
  present: 'gift',
  products: 'basket',
  purse: 'wallet',
  sport: 'barbell',
  transport: 'bus',
  usd_coin: 'currency-circle-dollar',
  dollar: 'currency-dollar',
  wallet: 'wallet',
  gift: 'gift',
  restaurant: 'fork-knife',
  pets: 'paw-print',
  clothes: 't-shirt',
  travel: 'airplane-tilt',
  taxi: 'taxi',
  phone: 'device-mobile',
  internet: 'wifi-high',
  medicine: 'pill',
};

export function iconFor(key: string) {
  return ICONS[key] ?? ICONS[LEGACY_ICON[key] ?? ''] ?? ICONS['question'];
}

export const PALETTE = [
  '#7C5CFF', '#9B8CFF', '#B57BFF', '#E056FD', '#FF5FA2', '#FF6B6B',
  '#FF8A4C', '#FFB020', '#F5C400', '#A3D93B', '#3DD68C', '#12B886',
  '#14C2B8', '#22B8E6', '#3D8BFF', '#4C6EF5', '#5B4BDB', '#0B5345',
  '#2E7D32', '#8D6E63', '#E8590C', '#C2255C', '#495057', '#1F2937',
];
