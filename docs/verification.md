# Verification

## Improvements checked on 2026-10-10

- All 15 tests, TypeScript, production build, and formatting passed for the cross-tab fix.
- In two actual T3 preview tabs, added separate subscriptions and confirmed both tabs showed the combined $20 monthly total. Opened the same subscription in both tabs, saved $15 in the second, and attempted $99 from the stale first editor. The first displayed a conflict and the saved price remained $15.
- Regression checks cover concurrent additions and currency edits, stale edits/deletions, deleted-record resurrection, corrupt data preservation, failed storage writes, and queued reminder updates reading the latest workspace.

Checked locally on 2026-10-09, using Node.js 24 on Windows.

- TypeScript check and production build passed.
- All 14 tests passed, including an isolated HTTP API server and ordered browser reminder updates.
- Source formatting check passed.
- In the T3 collaborative preview, added a subscription for $14.99, confirmed its projected renewal and three-day reminder, reloaded and confirmed persistence, changed its price to $12.50, and deleted it through the confirmation dialog.
- Explicit sample mode displayed example renewals while the saved workspace remained empty.
- The 390px mobile layout reported no horizontal overflow for the calendar and reminder views. This is a layout check, not screenshot acceptance.
- Confirmed the built service worker cached the HTML, JavaScript, CSS, manifest, and icons. Stopped the local server, confirmed a direct network request failed, and reopened the calendar successfully through the service worker. Restarted the server afterward.

## Environment limits

The T3 preview screenshot operation failed repeatedly and its automation host later became unavailable. No rendered screenshots were captured, so a final visual review on desktop and a real phone remains useful.

The preview browser granted notification permission but returned “push service not available” when registering a push subscription. Actual device notification delivery, installation on a real phone, and a closed-app reminder are therefore **not verified**. Scheduler timing, time zones, duplicate suppression, catch-up, retries, expired endpoints, API persistence, and synchronization were verified by tests. Use **Reminders → Send a test notification** in a supported browser to check delivery before relying on reminders.

The temporary browser test subscription was removed. No personal subscriptions or notification endpoints are committed.
