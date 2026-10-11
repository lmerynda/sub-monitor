# Verification

## Improvements checked on 2026-10-10

- All 15 tests, TypeScript, production build, and formatting passed for the cross-tab fix.
- In two actual T3 preview tabs, added separate subscriptions and confirmed both tabs showed the combined $20 monthly total. Opened the same subscription in both tabs, saved $15 in the second, and attempted $99 from the stale first editor. The first displayed a conflict and the saved price remained $15.
- Regression checks cover concurrent additions and currency edits, stale edits/deletions, deleted-record resurrection, corrupt data preservation, failed storage writes, and queued reminder updates reading the latest workspace.
- Reviewed actual rendered phone screenshots at 390px and 320px. Phones open in list view, summary captions are 12px, renewal details are 12–15px, and form inputs are 16px. Calendar, subscriptions, and the 320px subscription dialog have no horizontal overflow. A color-picker overflow found in the narrow dialog was fixed and rechecked. Production build, TypeScript, and formatting passed.
- Next-billing-date entry passed all 16 tests and the production build. A browser-created next-date subscription was edited to October 31 and showed October 31 as its first renewal. Regression coverage verifies no invented recorded charge, inactive entries, weekly/yearly cycles, and restoration of the month-end anchor after short months. Legacy entries remain valid.
- Configurable reminders passed all 20 tests, TypeScript, production build, and formatting. Coverage includes custom local hours, midnight renewal-day reminders, seven-day weekly windows, catch-up, timing changes preserving duplicate suppression, input validation, API persistence, backup compatibility, and synchronization of the latest preferences. Selected seven days before at 8 p.m. in the mobile browser and confirmed the same choices after reloading in a second tab. Reviewed the rendered reminder settings screenshot with no horizontal overflow.
- Retried live push registration on 2026-10-10. Permission was granted in the secure localhost preview, but registration failed because its push service was unavailable. The UI stayed disabled and displayed an actionable error. This does **not** establish real notification delivery or closed-app acceptance. Follow [the device checks](reminder-device-checks.md) to finish that acceptance on a real device.
- Final phone onboarding check exposed that list view lacked the empty grid's add/sample actions. Added those actions and used the sample button in the actual mobile list; all eight example services showed readable names without truncation, while the saved workspace remained empty. The final build and formatting checks passed.

Checked locally on 2026-10-09, using Node.js 24 on Windows.

- TypeScript check and production build passed.
- All 14 tests passed, including an isolated HTTP API server and ordered browser reminder updates.
- Source formatting check passed.
- In the T3 collaborative preview, added a subscription for $14.99, confirmed its projected renewal and three-day reminder, reloaded and confirmed persistence, changed its price to $12.50, and deleted it through the confirmation dialog.
- Explicit sample mode displayed example renewals while the saved workspace remained empty.
- The 390px mobile layout reported no horizontal overflow for the calendar and reminder views. This is a layout check, not screenshot acceptance.
- Confirmed the built service worker cached the HTML, JavaScript, CSS, manifest, and icons. Stopped the local server, confirmed a direct network request failed, and reopened the calendar successfully through the service worker. Restarted the server afterward.

## Environment limits

The original 2026-10-09 run could not capture screenshots. Rendered desktop and mobile viewport screenshots were reviewed on 2026-10-10. These use a desktop browser with resized viewports; a real-phone review remains useful.

The preview browser granted notification permission but returned “push service not available” when registering a push subscription. Actual device notification delivery, installation on a real phone, and a closed-app reminder are therefore **not verified**. Scheduler timing, time zones, duplicate suppression, catch-up, retries, expired endpoints, API persistence, and synchronization were verified by tests. Use **Reminders → Send a test notification** in a supported browser to check delivery before relying on reminders.

The temporary browser test subscription was removed. No personal subscriptions or notification endpoints are committed.
