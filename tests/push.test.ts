import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disableReminders, syncReminders } from '../src/push.ts';
import type { Subscription } from '../shared/subscriptions.ts';
import { STORAGE } from '../src/workspace.ts';

test('browser sync orders edits and disabling, so old writes cannot recreate deleted reminders', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  );
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );
  const originalFetch = globalThis.fetch;
  let subscribed = true;
  const registration = {
    pushManager: {
      getSubscription: async () =>
        subscribed
          ? {
              toJSON: () => ({}),
              unsubscribe: async () => {
                subscribed = false;
              },
            }
          : null,
    },
  };
  const values = new Map();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      locks: { request: async (_name: string, work: () => unknown) => work() },
      serviceWorker: {
        register: async () => {},
        ready: Promise.resolve(registration),
      },
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  const calls: string[] = [];
  const schedules: unknown[] = [];
  let releaseFirst!: () => void;
  const blocked = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    firstStarted = resolve;
  });
  globalThis.fetch = async (_url, options) => {
    const data = options?.body ? JSON.parse(String(options.body)) : null;
    if (data) schedules.push(data.reminders);
    calls.push(`${options?.method}:${data?.subscriptions[0]?.name || ''}`);
    if (calls.length === 1) {
      firstStarted();
      await blocked;
    }
    return Response.json({ enabled: options?.method !== 'DELETE' });
  };
  try {
    const s: Subscription = {
      id: 'test',
      name: 'First edit',
      priceCents: 100,
      lastCharge: '2026-01-01',
      cycle: 'monthly',
      active: true,
      category: 'Other',
      color: 'violet',
      url: '',
      notes: '',
    };
    values.set(
      STORAGE,
      JSON.stringify({ version: 1, currency: 'USD', subscriptions: [s] }),
    );
    const first = syncReminders();
    await started;
    values.set(
      STORAGE,
      JSON.stringify({
        version: 1,
        currency: 'USD',
        subscriptions: [{ ...s, name: 'Latest edit from another tab' }],
        reminders: { daysBefore: 7, hour: 20 },
      }),
    );
    const second = syncReminders();
    const disable = disableReminders();
    assert.deepEqual(calls, ['PUT:First edit']);
    releaseFirst();
    await Promise.all([first, second, disable]);
    assert.deepEqual(schedules, [undefined, { daysBefore: 7, hour: 20 }]);
    assert.deepEqual(calls, [
      'PUT:First edit',
      'PUT:Latest edit from another tab',
      'DELETE:',
    ]);
    await assert.rejects(syncReminders(), /enabled again/);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNavigator)
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
    if (originalStorage)
      Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
