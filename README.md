# Renew

A small subscription calendar, built with React, TypeScript, Vite, and a Node.js Web Push server. No Python.

## Run locally

Requires Node.js 24 and npm.

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

- Enter the name, price, either the last charge date or next billing date, and billing cycle (weekly, monthly, quarterly, or yearly). Next-date entries start with a projected renewal and do not invent a past charge. Existing entries and backups retain their recorded-charge behavior.
- The calendar shows the recorded charge and projected renewals. Monthly and annual dates retain the original anchor through short months and leap years.
- View estimated monthly spending, upcoming renewals, categories, and active/inactive subscriptions. Changing the currency changes labels, not exchange rates.
- Phones open in list view with readable renewal details. You can switch to the calendar grid; subscription lists and forms adapt to narrow screens with larger controls. Estimated monthly cost normalizes billing cycles and is not the amount charged in a specific calendar month.
- Subscriptions are stored in this browser. Export/import JSON backups in Settings. There are no accounts or cross-device sync.
- Tabs share updates automatically. Saves merge with the latest workspace; conflicting edits to the same subscription ask you to reopen it. Safe saving uses Web Locks, requiring a current browser over HTTPS or localhost. Reminder updates are also coordinated across tabs and use the latest saved data.
- Sample data is opt-in, visibly labeled, never saved to your workspace, and never sent for reminders. Adding a subscription exits sample mode.
- Inactive subscriptions stop projecting renewals and receiving reminders. The original recorded charge stays visible. Renew does not cancel subscriptions or connect to banks.

## Reminders

Choose **Enable reminders**, grant browser notification permission, and use **Send a test notification** in Reminders. Choose the renewal day or 1, 3, or 7 calendar days before it, and an hour in the device's time zone. Existing workspaces default to three days before at 9 a.m. Timing is saved with JSON backups. The server checks once a minute. If it starts late, it catches up within the selected lead-time window, through the renewal day, after the selected hour. A seven-day window can include both today's and next week's renewal for a weekly subscription. Once a push service accepts a reminder, that renewal is marked sent; changing timing does not resend it. Delivery to the device itself is controlled by its browser, OS settings, connectivity, and push service.

Web Push needs HTTPS in production (localhost works for development). On iPhone/iPad, install to the Home Screen first. Browser support and notification permission are detected, and failures are shown in the UI. The calendar and in-app reminders work without notification permission.

Enabling reminders sends subscription details, currency, reminder timing, time zone, and the push endpoint to the server. A random device bearer token scopes updates; only its hash is stored server-side. Disabling removes the device's reminder data. While offline, calendar edits save locally and reminder changes retry while the app is open; the UI warns that previously synced reminders may still be scheduled. Restoring a backup restores calendar data and timing, not notification permission or the device token.

The server generates VAPID keys in `.data/vapid.json` on first launch and persists reminder records in `.data/devices.json`. Both are private and ignored by Git. **Keep `.data` persistent**: replacing the VAPID keys invalidates existing browser subscriptions. Use a real `VAPID_SUBJECT` contact address for hosting. Environment options are described in `.env.example`; set them in the shell/host environment. Run one server instance per data directory. This is a small personal app, not a public multi-tenant service.

## PWA

The manifest includes 192px and 512px icons and a standalone window. Use Settings → Install Renew or the browser's install menu. The built service worker pre-caches the full application shell for offline use. Development modules intentionally aren't cached; use the built app to verify offline behavior. The Node server serves the build and reminder API together; a static-only host cannot send scheduled reminders. For use on your phone, host the Node server behind HTTPS; localhost refers to the device you're using.

## Deploy to Railway

Deploy this repository's `master` branch as one Node service. `railway.json` configures the production build, start command, API health check, and crash retries. Node.js 24 is selected by `package.json`; `tsx` is a production dependency because the server uses it at runtime.

Before the first deployment, attach a persistent volume at `/data` and configure these service variables:

| Variable          | Value                                           |
| ----------------- | ----------------------------------------------- |
| `HOST`            | `0.0.0.0`                                       |
| `DATA_DIR`        | `/data`                                         |
| `RAILPACK_NO_SPA` | `1`                                             |
| `VAPID_SUBJECT`   | `mailto:` followed by your real contact address |

Use Railway's supplied `PORT`. `RAILPACK_NO_SPA=1` prevents Vite detection from deploying only the static frontend; the Node process must also run the reminder API and scheduler. Keep one instance in one region, with Serverless/app sleeping disabled so the scheduler continues while the app is closed. Generate a Railway domain for the shared frontend/API HTTPS address.

The volume retains `vapid.json` and `devices.json` across restarts and redeployments. Keep its contents private and back them up. A deployment starts a fresh hosted reminder store; local `.data` files are not uploaded. Calendar subscriptions remain in each browser's storage, so export/import a JSON backup to move an existing workspace from localhost to the hosted address. Enable reminders again at the new address, then complete the [real-device checks](docs/reminder-device-checks.md).

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
