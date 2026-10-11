import {
  currencies,
  validateSubscription,
  type Currency,
  type Subscription,
} from '../shared/subscriptions';
import { browserLock } from './browser-lock';
import {
  validReminderPreferences,
  type ReminderPreferences,
} from '../shared/reminder-preferences';

export type Saved = {
  version: 1;
  subscriptions: Subscription[];
  currency: Currency;
  reminders?: ReminderPreferences;
};
export const STORAGE = 'renew-workspace-v1';
export const emptyWorkspace = (): Saved => ({
  version: 1,
  subscriptions: [],
  currency: 'USD',
});

export function validBackup(value: unknown): value is Saved {
  const data = value as Saved;
  return (
    !!data &&
    data.version === 1 &&
    currencies.includes(data.currency) &&
    (data.reminders === undefined ||
      validReminderPreferences(data.reminders)) &&
    Array.isArray(data.subscriptions) &&
    data.subscriptions.length <= 200 &&
    data.subscriptions.every(validateSubscription) &&
    new Set(data.subscriptions.map((s) => s.id)).size ===
      data.subscriptions.length
  );
}

export function readWorkspace(): Saved {
  const raw = localStorage.getItem(STORAGE);
  if (!raw) return emptyWorkspace();
  const data: unknown = JSON.parse(raw);
  if (!validBackup(data))
    throw new Error(
      'Saved data could not be read. Your original data is preserved. Export a backup in Settings before starting fresh.',
    );
  return data;
}

export function readSaved(): { data: Saved; error: string } {
  try {
    return { data: readWorkspace(), error: '' };
  } catch {
    return {
      data: emptyWorkspace(),
      error:
        'Saved data could not be read. Your original data is preserved. Export a backup in Settings before starting fresh.',
    };
  }
}

export function updateWorkspace(
  change: (latest: Saved) => Saved,
): Promise<Saved> {
  return browserLock('workspace', () => {
    const next = change(readWorkspace());
    if (!validBackup(next))
      throw new Error('This workspace supports up to 200 valid subscriptions.');
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
    } catch {
      throw new Error(
        'This browser could not save your changes. Keep this window open and try again.',
      );
    }
    return next;
  });
}

export function changeSubscription(
  latest: Saved,
  next: Subscription | null,
  expected?: Subscription,
): Saved {
  const id = next?.id ?? expected!.id;
  const current = latest.subscriptions.find((s) => s.id === id);
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error(
      'This subscription changed in another tab. Close this dialog and reopen it to review the latest version.',
    );
  return {
    ...latest,
    subscriptions: next
      ? current
        ? latest.subscriptions.map((s) => (s.id === id ? next : s))
        : [...latest.subscriptions, next]
      : latest.subscriptions.filter((s) => s.id !== id),
  };
}
