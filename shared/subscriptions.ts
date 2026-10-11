export const cycles = ['monthly', 'yearly', 'quarterly', 'weekly'] as const;
export const categories = [
  'Entertainment',
  'Productivity',
  'Lifestyle',
  'Other',
] as const;
export const colors = [
  'violet',
  'green',
  'rose',
  'blue',
  'orange',
  'gray',
] as const;
export const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const;
export type Currency = (typeof currencies)[number];
export type Subscription = {
  id: string;
  name: string;
  priceCents: number;
  lastCharge: string;
  // Legacy entries anchor on a recorded charge; next-renewal entries invent no history.
  dateKind?: 'last-charge' | 'next-renewal';
  cycle: (typeof cycles)[number];
  category: (typeof categories)[number];
  color: (typeof colors)[number];
  url: string;
  notes: string;
  active: boolean;
};
export type Charge = {
  subscription: Subscription;
  date: string;
  recorded: boolean;
};

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
export function isDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= '2000-01-01' &&
    value <= '2100-12-31' &&
    dateKey(parseDate(value)) === value
  );
}
export function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
export function daysBetween(from: string, to: string): number {
  const utc = (key: string) => {
    const [year, month, day] = key.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86400000);
}

// Always calculate from the original anchor, so Jan 31 -> Feb 28 -> Mar 31.
export function occurrence(subscription: Subscription, index: number): string {
  if (subscription.cycle === 'weekly')
    return addDays(subscription.lastCharge, index * 7);
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[subscription.cycle];
  const anchor = parseDate(subscription.lastCharge);
  const result = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + index * months,
    1,
    12,
  );
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(anchor.getDate(), lastDay));
  return dateKey(result);
}

function indexNear(subscription: Subscription, from: string): number {
  if (from <= subscription.lastCharge) return 0;
  if (subscription.cycle === 'weekly')
    return Math.max(
      0,
      Math.floor(daysBetween(subscription.lastCharge, from) / 7) - 1,
    );
  const anchor = parseDate(subscription.lastCharge);
  const start = parseDate(from);
  const monthDiff =
    (start.getFullYear() - anchor.getFullYear()) * 12 +
    start.getMonth() -
    anchor.getMonth();
  const interval = { monthly: 1, quarterly: 3, yearly: 12 }[subscription.cycle];
  return Math.max(0, Math.floor(monthDiff / interval) - 1);
}

export function chargesBetween(
  subscriptions: Subscription[],
  from: string,
  to: string,
): Charge[] {
  const charges: Charge[] = [];
  for (const subscription of subscriptions) {
    if (!subscription.active) {
      if (
        subscription.dateKind !== 'next-renewal' &&
        subscription.lastCharge >= from &&
        subscription.lastCharge <= to
      ) {
        charges.push({
          subscription,
          date: subscription.lastCharge,
          recorded: true,
        });
      }
      continue;
    }
    for (let index = indexNear(subscription, from); ; index++) {
      const date = occurrence(subscription, index);
      if (date > to) break;
      if (date >= from)
        charges.push({
          subscription,
          date,
          recorded: index === 0 && subscription.dateKind !== 'next-renewal',
        });
    }
  }
  return charges.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.subscription.name.localeCompare(b.subscription.name),
  );
}

export function nextRenewal(
  subscription: Subscription,
  today = dateKey(new Date()),
): string | null {
  if (!subscription.active) return null;
  for (
    let index = Math.max(
      subscription.dateKind === 'next-renewal' ? 0 : 1,
      indexNear(subscription, today),
    );
    ;
    index++
  ) {
    const date = occurrence(subscription, index);
    if (date >= today) return date;
  }
}
export function upcomingRenewals(
  subscriptions: Subscription[],
  today = dateKey(new Date()),
): Charge[] {
  return subscriptions
    .filter((s) => s.active)
    .map((subscription) => ({
      subscription,
      date: nextRenewal(subscription, today)!,
      recorded: false,
    }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.subscription.name.localeCompare(b.subscription.name),
    );
}
export function monthlyTotal(subscriptions: Subscription[]): number {
  const multiplier = {
    monthly: 1,
    yearly: 1 / 12,
    quarterly: 1 / 3,
    weekly: 52 / 12,
  };
  return Math.round(
    subscriptions
      .filter((s) => s.active)
      .reduce((sum, s) => sum + s.priceCents * multiplier[s.cycle], 0),
  );
}
export function money(cents: number, currency: Currency): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    cents / 100,
  );
}
export function validateSubscription(value: unknown): value is Subscription {
  if (!value || typeof value !== 'object') return false;
  const s = value as Subscription;
  return (
    typeof s.id === 'string' &&
    /^[\w-]{1,80}$/.test(s.id) &&
    typeof s.name === 'string' &&
    s.name.trim().length > 0 &&
    s.name.length <= 80 &&
    Number.isInteger(s.priceCents) &&
    s.priceCents >= 0 &&
    s.priceCents <= 100000000 &&
    isDate(s.lastCharge) &&
    (s.dateKind === undefined ||
      s.dateKind === 'last-charge' ||
      s.dateKind === 'next-renewal') &&
    cycles.includes(s.cycle) &&
    categories.includes(s.category) &&
    colors.includes(s.color) &&
    typeof s.active === 'boolean' &&
    typeof s.notes === 'string' &&
    s.notes.length <= 1000 &&
    typeof s.url === 'string' &&
    s.url.length <= 500 &&
    (!s.url ||
      (/^https?:\/\//.test(s.url) &&
        (() => {
          try {
            return !!new URL(s.url).hostname;
          } catch {
            return false;
          }
        })()))
  );
}

export function sampleSubscriptions(today = new Date()): Subscription[] {
  const monthStart = dateKey(
    new Date(today.getFullYear(), today.getMonth(), 1, 12),
  );
  const names = [
    'Spotify',
    'Netflix',
    'Notion',
    'iCloud+',
    'YouTube Premium',
    'Adobe Creative Cloud',
    'Figma',
    'Headspace',
  ];
  const prices = [1199, 1549, 1000, 299, 1399, 5999, 1500, 1299];
  const offsets = [2, 5, 8, 11, 15, 19, 23, 27];
  return names.map((name, i) => {
    const day = addDays(monthStart, offsets[i]);
    const previous = parseDate(day);
    previous.setMonth(previous.getMonth() - 1);
    return {
      id: `sample-${i}`,
      name,
      priceCents: prices[i],
      lastCharge: dateKey(previous),
      cycle: 'monthly',
      category:
        i === 2 || i === 5 || i === 6
          ? 'Productivity'
          : i === 7
            ? 'Lifestyle'
            : 'Entertainment',
      color: (
        [
          'green',
          'rose',
          'gray',
          'blue',
          'rose',
          'orange',
          'violet',
          'orange',
        ] as const
      )[i],
      url: '',
      notes: '',
      active: true,
    };
  });
}
