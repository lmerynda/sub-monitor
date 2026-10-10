import { createHash } from 'node:crypto';
import type { PushSubscription } from 'web-push';
import {
  currencies,
  money,
  nextRenewal,
  daysBetween,
  validateSubscription,
  type Subscription,
  type Currency,
} from '../shared/subscriptions.ts';

export type Device = {
  push: PushSubscription;
  subscriptions: Subscription[];
  currency: Currency;
  timeZone: string;
  sent: string[];
  updatedAt: string;
};
export type DeviceStore = Record<string, Device>;
export function tokenKey(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export function validToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function validPush(value: unknown): value is PushSubscription {
  if (!value || typeof value !== 'object') return false;
  const push = value as PushSubscription;
  if (typeof push.endpoint !== 'string' || push.endpoint.length > 2048)
    return false;
  try {
    const url = new URL(push.endpoint);
    // Prevent arbitrary outbound requests through the push endpoint.
    const host = url.hostname;
    const allowed =
      host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host.endsWith('.push.apple.com') ||
      host.endsWith('.notify.windows.com');
    if (
      !allowed ||
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password
    )
      return false;
  } catch {
    return false;
  }
  const key = (s: unknown, size: number) =>
    typeof s === 'string' &&
    /^[\w-]+={0,2}$/.test(s) &&
    Buffer.from(s, 'base64url').length === size;
  return !!push.keys && key(push.keys.p256dh, 65) && key(push.keys.auth, 16);
}
export function validDeviceInput(
  value: unknown,
): value is Omit<Device, 'sent' | 'updatedAt'> {
  if (!value || typeof value !== 'object') return false;
  const input = value as Device;
  if (
    !validPush(input.push) ||
    !Array.isArray(input.subscriptions) ||
    input.subscriptions.length > 200 ||
    !input.subscriptions.every(validateSubscription) ||
    new Set(input.subscriptions.map((s) => s.id)).size !==
      input.subscriptions.length ||
    !currencies.includes(input.currency) ||
    typeof input.timeZone !== 'string'
  )
    return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function localClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return {
    today: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  };
}
export function pendingReminders(device: Device, now: Date) {
  const { today, hour } = localClock(now, device.timeZone);
  if (hour < 9) return [];
  return device.subscriptions.flatMap((subscription) => {
    const due = nextRenewal(subscription, today);
    if (!due) return [];
    const days = daysBetween(today, due);
    const tag = `${subscription.id}:${due}`;
    if (days > 3 || device.sent.includes(tag)) return [];
    return [
      {
        tag,
        title: `${subscription.name} renews ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}`,
        body: `${money(subscription.priceCents, device.currency)} on ${due}. A little time to decide if it's still worth it.`,
      },
    ];
  });
}

export async function deliverReminders(
  store: DeviceStore,
  now: Date,
  send: (push: PushSubscription, payload: string) => Promise<unknown>,
) {
  let changed = false;
  for (const [id, device] of Object.entries(store)) {
    for (const reminder of pendingReminders(device, now)) {
      try {
        await send(device.push, JSON.stringify(reminder));
        device.sent = [...device.sent, reminder.tag].slice(-1000);
        changed = true;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          delete store[id];
          changed = true;
          break;
        }
        // Retry transient errors on the next sweep. Never log private payloads or endpoints.
        console.warn(
          `Push delivery failed (${status ?? 'network error'}); will retry.`,
        );
      }
    }
  }
  return changed;
}
