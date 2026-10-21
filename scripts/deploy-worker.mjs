// Deploys dist/ as a Cloudflare Worker that serves the files from embedded modules.
// Uses only the account API token (no asset-upload JWT), so it works from proxied CI sandboxes.
// Usage: CLOUDFLARE_ACCOUNT_ID=... [WORKER_NAME=doodle-bridge] node scripts/deploy-worker.mjs
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const name = process.env.WORKER_NAME ?? 'doodle-bridge';
const token = process.env.CLOUDFLARE_API_TOKEN ?? 'proxy-injected';
const api = `https://api.cloudflare.com/client/v4/accounts/${account}`;
const dir = 'dist';
// OUT_DIR writes the worker to disk instead of uploading (for `wrangler dev` checks).
const outDir = process.env.OUT_DIR;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
};
const TEXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg']);

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

const form = new FormData();
const routes = [];
walk(dir).forEach((file, i) => {
  const path = '/' + relative(dir, file).split('\\').join('/');
  const ext = extname(file);
  const text = TEXT.has(ext);
  const mod = `f${i}${text ? '.txt' : '.bin'}`;
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, mod), readFileSync(file));
  }
  form.append(mod, new Blob([readFileSync(file)], { type: text ? 'text/plain' : 'application/octet-stream' }), mod);
  routes.push({ path, mod, type: TYPES[ext] ?? 'application/octet-stream', immutable: path.startsWith('/assets/') });
});

const worker = `
${routes.map((r, i) => `import m${i} from './${r.mod}';`).join('\n')}
const FILES = {
${routes.map((r, i) => `  ${JSON.stringify(r.path)}: [m${i}, ${JSON.stringify(r.type)}, ${r.immutable}],`).join('\n')}
};
export default {
  async fetch(request) {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const hit = FILES[path] ?? FILES['/index.html'];
    const headers = {
      'content-type': hit[1],
      'cache-control': hit[2] ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    };
    return new Response(hit[0], { headers });
  },
};
`;
if (outDir) {
  writeFileSync(join(outDir, 'worker.js'), worker);
  console.log(`wrote ${outDir}`);
  process.exit(0);
}
form.append('worker.js', new Blob([worker], { type: 'application/javascript+module' }), 'worker.js');
form.append(
  'metadata',
  JSON.stringify({ main_module: 'worker.js', compatibility_date: '2026-10-01' }),
);

const res = await fetch(`${api}/workers/scripts/${name}`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const json = await res.json();
if (!json.success) {
  console.error(JSON.stringify(json.errors, null, 2));
  process.exit(1);
}
await fetch(`${api}/workers/scripts/${name}/subdomain`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ enabled: true, previews_enabled: true }),
});
const sub = await (await fetch(`${api}/workers/subdomain`, { headers: { Authorization: `Bearer ${token}` } })).json();
console.log(`https://${name}.${sub.result.subdomain}.workers.dev`);
