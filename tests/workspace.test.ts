import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE,
  emptyWorkspace,
  readWorkspace,
  updateWorkspace,
  changeSubscription,
} from '../src/workspace.ts';
import type { Subscription } from '../shared/subscriptions.ts';

const subscription: Subscription = {
  id: 'first',
  name: 'First',
  priceCents: 100,
  lastCharge: '2026-01-31',
  cycle: 'monthly',
  category: 'Other',
  color: 'violet',
  active: true,
  notes: '',
  url: '',
};

test('concurrent workspace edits merge latest data and stale edits cannot overwrite or resurrect subscriptions', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  );
  const previousStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );
  const values = new Map<string, string>();
  let queue = Promise.resolve();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      locks: {
        request: (_name: string, work: () => unknown) => {
          const result = queue.then(work);
          queue = result.then(
            () => {},
            () => {},
          );
          return result;
        },
      },
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    const second = { ...subscription, id: 'second', name: 'Second' };
    await Promise.all([
      updateWorkspace((s) => changeSubscription(s, subscription)),
      updateWorkspace((s) => changeSubscription(s, second)),
      updateWorkspace((s) => ({ ...s, currency: 'EUR' })),
    ]);
    assert.deepEqual(readWorkspace().subscriptions, [subscription, second]);
    assert.equal(readWorkspace().currency, 'EUR');
    const updated = { ...subscription, priceCents: 200 };
    await updateWorkspace((s) => changeSubscription(s, updated, subscription));
    await assert.rejects(
      updateWorkspace((s) =>
        changeSubscription(
          s,
          { ...subscription, priceCents: 300 },
          subscription,
        ),
      ),
      /changed in another tab/,
    );
    await assert.rejects(
      updateWorkspace((s) => changeSubscription(s, null, subscription)),
      /changed in another tab/,
    );
    await updateWorkspace((s) => changeSubscription(s, null, updated));
    await assert.rejects(
      updateWorkspace((s) => changeSubscription(s, updated, updated)),
      /changed in another tab/,
    );
    assert.deepEqual(readWorkspace().subscriptions, [second]);
    values.set(STORAGE, '{broken');
    await assert.rejects(updateWorkspace(() => emptyWorkspace()));
    assert.equal(values.get(STORAGE), '{broken');
    values.set(STORAGE, JSON.stringify(emptyWorkspace()));
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: () => {
          throw new Error('Quota exceeded');
        },
      },
    });
    await assert.rejects(
      updateWorkspace((s) => changeSubscription(s, subscription)),
      /could not save/,
    );
    assert.deepEqual(readWorkspace(), emptyWorkspace());
  } finally {
    if (previousNavigator)
      Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
    if (previousStorage)
      Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
