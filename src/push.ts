import type { Currency, Subscription } from '../shared/subscriptions';

const TOKEN_KEY = 'renew-device-token';
let mutations = Promise.resolve();
function ordered<T>(work: () => Promise<T>): Promise<T> {
  const result = mutations.then(work);
  mutations = result.then(
    () => {},
    () => {},
  );
  return result;
}
function token() {
  let value = localStorage.getItem(TOKEN_KEY);
  if (!value) {
    value = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    localStorage.setItem(TOKEN_KEY, value);
  }
  return value;
}
async function request(path: string, method = 'GET', data?: unknown) {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error(
      'Could not connect to the reminder server. Check your connection and try again.',
    );
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || 'Could not connect to the reminder server.',
    );
  return result;
}
export async function registerWorker() {
  if (!('serviceWorker' in navigator))
    throw new Error(
      'This browser does not support installed apps. Try a current browser over HTTPS.',
    );
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}
export async function syncReminders(
  subscriptions: Subscription[],
  currency: Currency,
) {
  return ordered(async () => {
    const registration = await registerWorker();
    const push = await registration.pushManager.getSubscription();
    if (!push) throw new Error('Notifications need to be enabled again.');
    await request('/api/reminders', 'PUT', {
      push: push.toJSON(),
      subscriptions,
      currency,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });
}
export async function enableReminders(
  subscriptions: Subscription[],
  currency: Currency,
) {
  if (
    !('Notification' in window) ||
    !('PushManager' in window) ||
    !window.isSecureContext
  ) {
    throw new Error(
      'Push reminders need a supported browser and HTTPS (or localhost). On iPhone, add Renew to your Home Screen first.',
    );
  }
  // Request permission directly from the user's click, before asynchronous server work.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(
      'Notifications weren’t allowed. You can change this in your browser’s site settings.',
    );
  const registration = await registerWorker();
  let push = await registration.pushManager.getSubscription();
  if (!push) {
    const response = await fetch('/api/config', {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('The reminder server is unavailable.');
    const { publicKey } = await response.json();
    const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
    const raw = atob(
      (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/'),
    );
    try {
      push = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      });
    } catch {
      throw new Error(
        'This browser’s push service is unavailable. Try enabling reminders in another supported browser, or in the installed app.',
      );
    }
  }
  await syncReminders(subscriptions, currency);
}
export async function disableReminders() {
  // Remove server data first. If offline, keep the UI explicit about the pending disable.
  return ordered(async () => {
    await request('/api/reminders', 'DELETE');
    const registration = await registerWorker();
    await (await registration.pushManager.getSubscription())?.unsubscribe();
  });
}
export async function reminderStatus() {
  if (!localStorage.getItem(TOKEN_KEY)) return false;
  const result = await request('/api/reminders');
  return result.enabled === true;
}
export function testReminder() {
  return request('/api/reminders/test', 'POST');
}
