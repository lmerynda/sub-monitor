import { defineConfig } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export default defineConfig({
  plugins: [
    {
      name: 'renew-offline-shell',
      async closeBundle() {
        const assets = (await readdir('dist/assets'))
          .filter((name) => /\.(js|css)$/.test(name))
          .map((name) => `/assets/${name}`);
        const version = createHash('sha256')
          .update(JSON.stringify(assets))
          .digest('hex')
          .slice(0, 12);
        const worker = await readFile('public/sw.js', 'utf8');
        await writeFile(
          'dist/sw.js',
          `const BUILD_ASSETS = ${JSON.stringify(assets)};\n${worker.replace('renew-shell-v1', `renew-shell-${version}`)}`,
        );
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
