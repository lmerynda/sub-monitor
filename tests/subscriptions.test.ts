import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  occurrence,
  nextRenewal,
  chargesBetween,
  daysBetween,
  monthlyTotal,
  validateSubscription,
  type Subscription,
} from '../shared/subscriptions.ts';

export const subscription: Subscription = {
  id: 'test',
  name: 'Example',
  priceCents: 1299,
  lastCharge: '2026-01-31',
  cycle: 'monthly',
  category: 'Other',
  color: 'violet',
  active: true,
  notes: '',
  url: '',
};
test('monthly recurrence clamps short months without losing the original anchor', () => {
  assert.equal(occurrence(subscription, 1), '2026-02-28');
  assert.equal(occurrence(subscription, 2), '2026-03-31');
  assert.equal(occurrence(subscription, 13), '2027-02-28');
});
test('leap-day annual and quarterly recurrence restore the original billing day', () => {
  const annual = {
    ...subscription,
    lastCharge: '2024-02-29',
    cycle: 'yearly' as const,
  };
  assert.equal(occurrence(annual, 1), '2025-02-28');
  assert.equal(occurrence(annual, 4), '2028-02-29');
  assert.equal(
    occurrence({ ...subscription, cycle: 'quarterly' }, 1),
    '2026-04-30',
  );
  assert.equal(
    occurrence({ ...subscription, cycle: 'quarterly' }, 2),
    '2026-07-31',
  );
});
test('next renewal includes today and excludes the original recorded charge', () => {
  assert.equal(nextRenewal(subscription, '2026-01-31'), '2026-02-28');
  assert.equal(nextRenewal(subscription, '2026-02-28'), '2026-02-28');
  assert.equal(nextRenewal(subscription, '2026-03-01'), '2026-03-31');
  assert.equal(
    nextRenewal({ ...subscription, active: false }, '2026-03-01'),
    null,
  );
});
test('calendar records the original charge and projects renewals, inactive entries stop recurring', () => {
  const charges = chargesBetween([subscription], '2026-01-01', '2026-03-31');
  assert.deepEqual(
    charges.map((c) => [c.date, c.recorded]),
    [
      ['2026-01-31', true],
      ['2026-02-28', false],
      ['2026-03-31', false],
    ],
  );
  assert.equal(
    chargesBetween(
      [{ ...subscription, active: false }],
      '2026-02-01',
      '2026-03-31',
    ).length,
    0,
  );
});
test('weekly charges cross year boundaries and monthly totals normalize cycles', () => {
  assert.equal(
    occurrence(
      { ...subscription, cycle: 'weekly', lastCharge: '2026-12-28' },
      1,
    ),
    '2027-01-04',
  );
  assert.equal(
    monthlyTotal([
      { ...subscription, priceCents: 12000, cycle: 'yearly' },
      { ...subscription, priceCents: 900, cycle: 'quarterly' },
      { ...subscription, priceCents: 300, active: false },
    ]),
    1300,
  );
});
test('day differences remain exact through daylight-saving changes', () => {
  assert.equal(daysBetween('2026-03-06', '2026-03-09'), 3);
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
});
test('validation rejects invalid dates, prices, URLs and blank names', () => {
  assert.equal(validateSubscription(subscription), true);
  for (const change of [
    { lastCharge: '2026-02-30' },
    { priceCents: -1 },
    { priceCents: 1.5 },
    { name: ' ' },
    { url: 'javascript:alert(1)' },
    { url: 'https://' },
    { cycle: 'daily' },
  ])
    assert.equal(validateSubscription({ ...subscription, ...change }), false);
});
