import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

test(
  'HTTP API scopes devices, validates inputs, persists updates, and removes disabled reminders',
  { timeout: 20000 },
  async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'renew-api-test-'));
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'server/index.ts'],
      {
        cwd: process.cwd(),
        env: { ...process.env, PORT: '0', DATA_DIR: directory },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    try {
      const base: string = await new Promise((success, failure) => {
        const timer = setTimeout(
          () => failure(new Error('Test server startup timed out')),
          8000,
        );
        child.once('error', (error) => {
          clearTimeout(timer);
          failure(error);
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          failure(new Error(`Test server exited (${code})`));
        });
        child.stdout.on('data', (chunk) => {
          const match = String(chunk).match(/http:\/\/localhost:(\d+)/);
          if (match) {
            clearTimeout(timer);
            success(`http://127.0.0.1:${match[1]}`);
          }
        });
      });
      const token = randomBytes(32).toString('base64url');
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const config = await fetch(`${base}/api/config`).then((r) => r.json());
      assert.equal(Buffer.from(config.publicKey, 'base64url').length, 65);
      assert.equal((await fetch(`${base}/api/reminders`)).status, 401);
      assert.deepEqual(
        await fetch(`${base}/api/reminders`, { headers }).then((r) => r.json()),
        { enabled: false },
      );
      assert.equal((await fetch(`${base}/.data/vapid.json`)).status, 404);
      assert.equal(
        (
          await fetch(`${base}/api/reminders`, {
            method: 'PUT',
            headers,
            body: '{',
          })
        ).status,
        400,
      );
      const input = {
        push: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            auth: Buffer.alloc(16, 2).toString('base64url'),
            p256dh: Buffer.alloc(65, 4).toString('base64url'),
          },
        },
        subscriptions: [],
        currency: 'USD',
        timeZone: 'America/Chicago',
        reminders: { daysBefore: 7, hour: 20 },
      };
      assert.equal(
        (
          await fetch(`${base}/api/reminders`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              ...input,
              reminders: { daysBefore: 7, hour: 24 },
            }),
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await fetch(`${base}/api/reminders`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ ...input, timeZone: 'Bad/Zone' }),
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await fetch(`${base}/api/reminders`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(input),
          })
        ).status,
        200,
      );
      assert.deepEqual(
        await fetch(`${base}/api/reminders`, { headers }).then((r) => r.json()),
        { enabled: true },
      );
      const otherHeaders = {
        ...headers,
        Authorization: `Bearer ${randomBytes(32).toString('base64url')}`,
      };
      assert.deepEqual(
        await fetch(`${base}/api/reminders`, { headers: otherHeaders }).then(
          (r) => r.json(),
        ),
        { enabled: false },
      );
      const disk = JSON.parse(
        await readFile(resolve(directory, 'devices.json'), 'utf8'),
      );
      assert.equal(Object.keys(disk).length, 1);
      assert.deepEqual(
        (Object.values(disk)[0] as { reminders: unknown }).reminders,
        input.reminders,
      );
      assert.equal(JSON.stringify(disk).includes(token), false);
      assert.equal(
        (await fetch(`${base}/api/reminders`, { method: 'DELETE', headers }))
          .status,
        200,
      );
      assert.deepEqual(
        JSON.parse(await readFile(resolve(directory, 'devices.json'), 'utf8')),
        {},
      );
    } finally {
      const stopped =
        child.exitCode === null ? once(child, 'exit') : Promise.resolve();
      child.kill();
      await stopped;
      // Only remove files created by this test inside its uniquely allocated directory.
      for (const name of await readdir(directory))
        await unlink(resolve(directory, name));
      await rmdir(directory);
    }
  },
);
