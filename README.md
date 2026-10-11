# Renew

A small subscription calendar, built with React, TypeScript, Vite, and a Node.js Web Push server. No Python.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

For the built app, including offline use:

```sh
npm run build
npm start
```

Open **http://localhost:3001**. Keep this server running for scheduled push reminders.

## How it works

- Enter the name, price, last charge date, and billing cycle (weekly, monthly, quarterly, or yearly).
- The calendar shows the recorded charge and projected renewals. Monthly and annual dates retain the original anchor through short months and leap years.
- View estimated monthly spending, upcoming renewals, categories, and active/inactive subscriptions. Changing the currency changes labels, not exchange rates.
- Phones open in list view with readable renewal details. You can switch to the calendar grid; subscription lists and forms adapt to narrow screens with larger controls. Estimated monthly cost normalizes billing cycles and is not the amount charged in a specific calendar month.
- Subscriptions are stored in this browser. Export/import JSON backups in Settings. There are no accounts or cross-device sync.
- Tabs share updates automatically. Saves merge with the latest workspace; conflicting edits to the same subscription ask you to reopen it. Safe saving uses Web Locks, requiring a current browser over HTTPS or localhost. Reminder updates are also coordinated across tabs and use the latest saved data.
- Sample data is opt-in, visibly labeled, never saved to your workspace, and never sent for reminders. Adding a subscription exits sample mode.
- Inactive subscriptions stop projecting renewals and receiving reminders. The original recorded charge stays visible. Renew does not cancel subscriptions or connect to banks.

## Reminders

Choose **Enable reminders**, grant browser notification permission, and use **Send a test notification** in Reminders. The server checks once a minute and sends at 9 a.m. in the device's time zone, three calendar days before the next renewal. If the server starts late, it catches up within the three-day window, through the renewal day. Once a push service accepts a reminder, that renewal is marked sent; delivery to the device itself is controlled by its browser, OS settings, connectivity, and push service.

Web Push needs HTTPS in production (localhost works for development). On iPhone/iPad, install to the Home Screen first. Browser support and notification permission are detected, and failures are shown in the UI. The calendar and in-app reminders work without notification permission.

Enabling reminders sends subscription details, currency, time zone, and the push endpoint to the server. A random device bearer token scopes updates; only its hash is stored server-side. Disabling removes the device's reminder data. While offline, calendar edits save locally and reminder changes retry while the app is open; the UI warns that previously synced reminders may still be scheduled. Restoring a backup restores calendar data, not notification permission or the device token.

The server generates VAPID keys in `.data/vapid.json` on first launch and persists reminder records in `.data/devices.json`. Both are private and ignored by Git. **Keep `.data` persistent**: replacing the VAPID keys invalidates existing browser subscriptions. Use a real `VAPID_SUBJECT` contact address for hosting. Environment options are described in `.env.example`; set them in the shell/host environment. Run one server instance per data directory. This is a small personal app, not a public multi-tenant service.

## PWA

The manifest includes 192px and 512px icons and a standalone window. Use Settings → Install Renew or the browser's install menu. The built service worker pre-caches the full application shell for offline use. Development modules intentionally aren't cached; use the built app to verify offline behavior. The Node server serves the build and reminder API together; a static-only host cannot send scheduled reminders. For use on your phone, host the Node server behind HTTPS; localhost refers to the device you're using.

## Checks

```sh
npm run check
npm test
npm run build
npm run format:check
```

Tests cover billing date anchors, leap years, weekly rollover, inactive subscriptions, currency totals, daylight-saving date differences, time-zone scheduling, duplicate suppression, catch-up, retries, expired endpoints, ordered browser synchronization, device isolation, API persistence, and request validation. `node scripts/generate-icons.mjs` regenerates the included PNG icons without external image tooling.

Web Push reference: [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API). Notification sender: [web-push](https://github.com/web-push-libs/web-push).

Local browser checks and remaining device checks are recorded in [verification notes](docs/verification.md).
