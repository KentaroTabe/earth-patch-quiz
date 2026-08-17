// ローカル配信（仕様 §9）。ビルド工程は持たないので、素のファイルをそのまま返すだけ。
//
//   npm run serve
//   npm run serve -- --port=8080
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { ROOT } from './lib/config.mjs';

const DEFAULT_PORT = 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const portArg = process.argv.find((a) => a.startsWith('--port='));
const port = Number(portArg?.slice('--port='.length) ?? DEFAULT_PORT);

function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const target = join(ROOT, relative);
  // ルートの外へ出るパスは拒否する。
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  try {
    return statSync(target).isDirectory() ? join(target, 'index.html') : target;
  } catch {
    return null;
  }
}

const server = createServer((request, response) => {
  const path = resolvePath(request.url === '/' ? '/index.html' : request.url);
  if (!path) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('見つかりません');
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(path).pipe(response);
});

server.listen(port, () => {
  console.log(`http://localhost:${port}/  （Ctrl+C で終了）`);
  console.log(`目視用一覧: http://localhost:${port}/work/contact-sheet.html`);
});
