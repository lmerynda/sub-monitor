import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import webpush from 'web-push';
import {
  defaultReminderPreferences,
  hourLabel,
  leadLabel,
} from '../shared/reminder-preferences.ts';
import {
  tokenKey,
  validToken,
  validDeviceInput,
  deliverReminders,
  type DeviceStore,
} from './reminders.ts';

const dataDir = resolve(process.env.DATA_DIR || '.data');
const distDir = resolve('dist');
await mkdir(dataDir, { recursive: true });
async function readJson<T>(file: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await readFile(resolve(dataDir, file), 'utf8'));
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === 'ENOENT' &&
      fallback !== undefined
    )
      return fallback;
    throw error;
  }
}
let keys: { publicKey: string; privateKey: string };
try {
  keys = await readJson('vapid.json');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  keys = webpush.generateVAPIDKeys();
  await writeFile(resolve(dataDir, 'vapid.json'), JSON.stringify(keys), {
    mode: 0o600,
  });
}
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:renew@example.com',
  keys.publicKey,
  keys.privateKey,
);
const store = await readJson<DeviceStore>('devices.json', {});
async function persist() {
  await writeFile(resolve(dataDir, 'devices.json.tmp'), JSON.stringify(store), {
    mode: 0o600,
  });
  await rename(
    resolve(dataDir, 'devices.json.tmp'),
    resolve(dataDir, 'devices.json'),
  );
}
// Serialize writes and scheduler sweeps so editing/deleting cannot race a delivery.
let queue = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}
function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}
async function body(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256000) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url || '/', 'http://localhost').pathname;
    if (path === '/api/config' && request.method === 'GET')
      return json(response, 200, { publicKey: keys.publicKey });
    if (path.startsWith('/api/')) {
      if (path !== '/api/reminders' && path !== '/api/reminders/test')
        return json(response, 404, { error: 'Not found' });
      const token = (request.headers.authorization || '').replace(
        /^Bearer /,
        '',
      );
      if (!validToken(token))
        return json(response, 401, { error: 'A device token is required.' });
      const id = tokenKey(token);
      if (path === '/api/reminders/test' && request.method === 'POST') {
        return await serialized(async () => {
          if (!store[id])
            return json(response, 404, { error: 'Enable reminders first.' });
          try {
            const prefs = store[id].reminders ?? defaultReminderPreferences;
            await webpush.sendNotification(
              store[id].push,
              JSON.stringify({
                title: 'Your reminders are ready',
                body: `Your reminder schedule is ${leadLabel(prefs.daysBefore)} at ${hourLabel(prefs.hour)} in ${store[id].timeZone}.`,
                tag: 'renew-test',
              }),
              { TTL: 3600, timeout: 10000 },
            );
            json(response, 200, { ok: true });
          } catch {
            json(response, 502, {
              error:
                'The push service could not deliver this test. Try enabling reminders again.',
            });
          }
        });
      }
      if (path !== '/api/reminders')
        return json(response, 405, { error: 'Method not allowed' });
      if (request.method === 'GET')
        return json(response, 200, { enabled: !!store[id] });
      if (request.method === 'PUT') {
        if (!request.headers['content-type']?.startsWith('application/json'))
          return json(response, 415, { error: 'JSON required' });
        const input = await body(request);
        if (!validDeviceInput(input))
          return json(response, 400, { error: 'Invalid reminder settings.' });
        return await serialized(async () => {
          if (!store[id] && Object.keys(store).length >= 500)
            return json(response, 503, {
              error: 'This server has reached its device limit.',
            });
          const previous = store[id];
          store[id] = {
            ...input,
            sent: previous?.sent || [],
            updatedAt: new Date().toISOString(),
          };
          try {
            await persist();
          } catch (error) {
            if (previous) store[id] = previous;
            else delete store[id];
            throw error;
          }
          json(response, 200, { enabled: true });
        });
      }
      if (request.method === 'DELETE')
        return await serialized(async () => {
          const previous = store[id];
          delete store[id];
          try {
            await persist();
          } catch (error) {
            if (previous) store[id] = previous;
            throw error;
          }
          json(response, 200, { enabled: false });
        });
      return json(response, 405, { error: 'Method not allowed' });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405);
      return response.end();
    }
    let file = resolve(
      distDir,
      `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`,
    );
    if (!file.startsWith(distDir + sep)) {
      response.writeHead(403);
      return response.end();
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error('Not a file');
    } catch {
      response.writeHead(404);
      return response.end('Run npm run build first.');
    }
    const content = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': path.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error as Error).message === 'Request too large'
    )
      json(response, 400, { error: 'Invalid request body.' });
    else {
      console.error('Server request failed.');
      json(response, 500, { error: 'Could not save changes. Please retry.' });
    }
  }
});
const port = Number(process.env.PORT || 3001);
server.listen(port, process.env.HOST || '127.0.0.1', () => {
  const address = server.address();
  console.log(
    `Renew server: http://localhost:${typeof address === 'object' && address ? address.port : port}`,
  );
});
async function sweep() {
  try {
    await serialized(async () => {
      if (
        await deliverReminders(store, new Date(), (push, payload) =>
          webpush.sendNotification(push, payload, {
            TTL: 86400,
            timeout: 10000,
          }),
        )
      )
        await persist();
    });
  } catch {
    console.error('Reminder sweep failed; will retry.');
  }
}
void sweep();
const timer = setInterval(() => void sweep(), 60000);
function shutdown() {
  clearInterval(timer);
  server.close(() => {
    void queue.finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
