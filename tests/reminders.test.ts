import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deliverReminders,
  localClock,
  pendingReminders,
  validPush,
  validToken,
  validDeviceInput,
  type Device,
  type DeviceStore,
} from '../server/reminders.ts';
import type { Subscription } from '../shared/subscriptions.ts';

const subscription: Subscription = {
  id: 'test',
  name: 'Example',
  priceCents: 1299,
  lastCharge: '2026-09-12',
  cycle: 'monthly',
  category: 'Other',
  color: 'violet',
  active: true,
  notes: '',
  url: '',
};
function device(): Device {
  return {
    push: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: {
        p256dh: Buffer.alloc(65, 4).toString('base64url'),
        auth: Buffer.alloc(16, 2).toString('base64url'),
      },
    },
    subscriptions: [subscription],
    currency: 'USD',
    timeZone: 'America/Chicago',
    sent: [],
    updatedAt: '',
  };
}
test('reminders are sent at 9 a.m. in the device time zone three days before renewal', () => {
  assert.equal(
    pendingReminders(device(), new Date('2026-10-09T13:59:00Z')).length,
    0,
  );
  const reminders = pendingReminders(
    device(),
    new Date('2026-10-09T14:00:00Z'),
  );
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].title, 'Example renews in 3 days');
  assert.ok(reminders[0].body.includes('$12.99'));
  assert.equal(
    localClock(new Date('2026-10-10T02:00:00Z'), 'America/Chicago').today,
    '2026-10-09',
  );
});
test('late startup catches up until renewal, sent and inactive subscriptions are suppressed', () => {
  assert.equal(
    pendingReminders(device(), new Date('2026-10-10T15:00:00Z')).length,
    1,
  );
  assert.equal(
    pendingReminders(device(), new Date('2026-10-13T15:00:00Z')).length,
    0,
  );
  const sent = device();
  sent.sent = ['test:2026-10-12'];
  assert.equal(
    pendingReminders(sent, new Date('2026-10-09T15:00:00Z')).length,
    0,
  );
  const inactive = device();
  inactive.subscriptions[0] = { ...subscription, active: false };
  assert.equal(
    pendingReminders(inactive, new Date('2026-10-09T15:00:00Z')).length,
    0,
  );
});
test('delivery records success once and retries transient failures', async () => {
  const store: DeviceStore = { first: device() };
  let count = 0;
  const send = async () => {
    count++;
  };
  await deliverReminders(store, new Date('2026-10-09T15:00:00Z'), send);
  await deliverReminders(store, new Date('2026-10-10T15:00:00Z'), send);
  assert.equal(count, 1);
  const retry: DeviceStore = { first: device() };
  await deliverReminders(retry, new Date('2026-10-09T15:00:00Z'), async () => {
    throw { statusCode: 503 };
  });
  assert.equal(retry.first.sent.length, 0);
  await deliverReminders(retry, new Date('2026-10-09T15:01:00Z'), send);
  assert.equal(retry.first.sent.length, 1);
});
test('expired push subscriptions are removed', async () => {
  const store: DeviceStore = { first: device() };
  await deliverReminders(store, new Date('2026-10-09T15:00:00Z'), async () => {
    throw { statusCode: 410 };
  });
  assert.deepEqual(store, {});
});
test('push inputs accept supported services and reject arbitrary outbound requests', () => {
  assert.equal(validPush(device().push), true);
  for (const endpoint of [
    'http://fcm.googleapis.com/test',
    'https://localhost/test',
    'https://fcm.googleapis.com.evil.example/test',
    'https://user@fcm.googleapis.com/test',
    'https://fcm.googleapis.com:8443/test',
  ])
    assert.equal(validPush({ ...device().push, endpoint }), false);
  assert.equal(
    validPush({ ...device().push, keys: { auth: 'bad', p256dh: 'bad' } }),
    false,
  );
  assert.equal(validToken('a'.repeat(43)), true);
  assert.equal(validToken('short'), false);
  assert.equal(validDeviceInput(device()), true);
  assert.equal(
    validDeviceInput({ ...device(), timeZone: 'Invalid/Place' }),
    false,
  );
  assert.equal(
    validDeviceInput({
      ...device(),
      subscriptions: [subscription, subscription],
    }),
    false,
  );
});

test('custom lead time and local hour support renewal-day reminders and catch-up without duplicates', async () => {
  const custom = device();
  custom.reminders = { daysBefore: 1, hour: 20 };
  assert.equal(
    pendingReminders(custom, new Date('2026-10-10T02:00:00Z')).length,
    0,
  );
  assert.equal(
    pendingReminders(custom, new Date('2026-10-11T23:00:00Z')).length,
    0,
  );
  assert.equal(
    pendingReminders(custom, new Date('2026-10-12T01:00:00Z'))[0].title,
    'Example renews tomorrow',
  );
  custom.reminders = { daysBefore: 0, hour: 0 };
  assert.equal(
    pendingReminders(custom, new Date('2026-10-12T04:59:00Z')).length,
    0,
  );
  assert.equal(
    pendingReminders(custom, new Date('2026-10-12T05:00:00Z'))[0].title,
    'Example renews today',
  );
  const store: DeviceStore = { custom };
  let sent = 0;
  await deliverReminders(store, new Date('2026-10-12T05:00:00Z'), async () => {
    sent++;
  });
  custom.reminders = { daysBefore: 7, hour: 0 };
  await deliverReminders(store, new Date('2026-10-12T06:00:00Z'), async () => {
    sent++;
  });
  assert.equal(sent, 1);
});

test('seven-day weekly reminders include the following renewal when the current one is today', () => {
  const weekly = device();
  weekly.reminders = { daysBefore: 7, hour: 9 };
  weekly.subscriptions = [
    { ...subscription, cycle: 'weekly', lastCharge: '2026-10-05' },
  ];
  weekly.sent = ['test:2026-10-12'];
  assert.deepEqual(
    pendingReminders(weekly, new Date('2026-10-12T14:00:00Z')).map(
      (r) => r.tag,
    ),
    ['test:2026-10-19'],
  );
  weekly.subscriptions = [
    { ...subscription, dateKind: 'next-renewal', lastCharge: '2026-10-15' },
  ];
  assert.equal(
    pendingReminders(weekly, new Date('2026-10-08T14:00:00Z'))[0].tag,
    'test:2026-10-15',
  );
});

test('reminder timing defaults remain compatible and invalid preferences are rejected', () => {
  assert.equal(validDeviceInput(device()), true);
  assert.equal(
    validDeviceInput({ ...device(), reminders: { daysBefore: 7, hour: 23 } }),
    true,
  );
  for (const reminders of [
    null,
    {},
    { daysBefore: -1, hour: 9 },
    { daysBefore: 2, hour: 9 },
    { daysBefore: 3, hour: 24 },
    { daysBefore: 3, hour: 1.5 },
  ])
    assert.equal(validDeviceInput({ ...device(), reminders }), false);
});
