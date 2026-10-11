# Real-device reminder acceptance

The preview browser cannot register with its push service. Automated scheduler checks and viewport screenshots passed; actual device delivery, installation, and closed-app delivery remain open.

Use a reachable HTTPS deployment of the built Node app on a real phone. Keep the Node server running with a persistent data directory. On iPhone/iPad, add Renew to the Home Screen and open the installed app first. Localhost on a phone refers to that phone, not the development PC.

1. Open Reminders, enable push notifications, and grant permission. Send a test notification and confirm it appears in the device's notification center. A success message only establishes push-service acceptance.
2. Choose **on renewal day** and the next local hour. Add a temporary subscription using **next billing date** set to the calendar date of that hour (tomorrow if the hour crosses midnight), with a recognizable test name. Check for synchronization errors before closing the app.
3. Close all app windows and lock the phone. Keep the phone online and wait through the chosen hour plus two scheduler minutes. Confirm the notification's name, price, and renewal date. Record the device, OS/browser version, time zone, expected time, and actual delivery time without recording endpoints or tokens.
4. Tap the notification. Confirm it opens Reminders. Reopen or restart the server after delivery and confirm the same renewal is not sent again. Changing reminder timing should not resend it either.
5. Choose **3 days before** and an hour already passed today. Create another temporary subscription with its next billing date three days from today and confirm catch-up delivery. Then disable reminders and confirm subsequent temporary renewals are not sent. Restore preferred timing and remove the test entries.
6. Open the installed app once while connected, disconnect, and reopen it. Confirm the calendar works and edits persist. Reconnect with the app open and confirm changes synchronize without an error before relying on the new reminder schedule.

If the test does not arrive, inspect notification permission, OS notification settings/Focus mode, connectivity, and server logs before relying on scheduled reminders. If enabling reports an unavailable push service, try the installed app or a supported browser. Do not mark delivery accepted from a UI message or a simulated push event alone.
