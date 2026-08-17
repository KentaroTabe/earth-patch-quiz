// 構文チェック + validate（仕様 §9）。Cloudflare Pages のビルドコマンド。
//
//   Build command:      npm run check
//   Build output dir:   .
//
// ビルド工程は持たないので、ここでやるのは検査だけ。
import { readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './lib/config.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', 'work', 'img']);
const EXTENSIONS = new Set(['.js', '.mjs']);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTENSIONS.has(extname(name))) out.push(path);
  }
  return out;
}

const files = walk(ROOT, []).sort();
let broken = 0;

console.log(`構文チェック ${files.length} ファイル`);
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    broken++;
    console.log(`  x ${relative(ROOT, file)}`);
    console.log(String(error.stderr).trim().split('\n').slice(0, 4).map((l) => `      ${l}`).join('\n'));
  }
}

if (broken) {
  console.log(`\n構文エラー ${broken} 件`);
  process.exit(1);
}
console.log('  構文エラーなし\n');

// img/manifest.js は自動生成で巨大にはならないが、念のため構文だけ見る。
try {
  execFileSync(process.execPath, ['--check', join(ROOT, 'img/manifest.js')], { stdio: 'pipe' });
} catch (error) {
  console.log('x img/manifest.js の構文が壊れています。npm run fetch で作り直してください。');
  process.exit(1);
}

try {
  execFileSync(process.execPath, [join(ROOT, 'scripts/validate.mjs')], { stdio: 'inherit' });
} catch {
  process.exit(1);
}
