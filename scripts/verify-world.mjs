// data/world.js の抜き取り検査。npm run world のあとに走らせる。
//   node scripts/verify-world.mjs
import { readFileSync } from 'node:fs';
import { inRoot } from './lib/config.mjs';
import { pointInRings } from './lib/geo.mjs';

globalThis.window = {};
new Function(readFileSync(inRoot('data/world.js'), 'utf8'))();
const world = globalThis.window.EARTH_PATCH_WORLD;

const byIso = new Map(world.countries.map((c) => [c.iso, c]));
let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : '  NG  '} ${label} … ${actual}${ok ? '' : ` (期待 ${expected})`}`);
}

console.log('隣接国');
const adjacency = [
  ['FR', 'DE', true],
  ['US', 'CA', true],
  ['CL', 'AR', true],
  ['JP', 'KR', false],
  ['GB', 'FR', false],
  ['EG', 'SD', true],
  ['MN', 'CN', true],
  ['AU', 'NZ', false],
  ['MR', 'ML', true],
  ['BO', 'PE', true],
];
for (const [a, b, expected] of adjacency) {
  const country = byIso.get(a);
  check(`${a} - ${b}`, Boolean(country?.neighbors.includes(b)), expected);
}

console.log('\n国の判定（point-in-polygon）');
const points = [
  ['東京', 139.7, 35.7, 'JP'],
  ['チュキカマタ', -68.9, -22.3, 'CL'],
  ['カイロ', 31.2, 30.0, 'EG'],
  ['アイスランド', -19.0, 64.9, 'IS'],
  ['太平洋の真ん中', -140.0, 0.0, null],
  ['パース', 115.86, -31.95, 'AU'],
  ['リシャット構造', -11.4, 21.12, 'MR'],
];
function countryAt(lon, lat) {
  for (const country of world.countries) {
    if (pointInRings(lon, lat, country.rings)) return country.iso;
  }
  return null;
}
for (const [label, lon, lat, expected] of points) {
  check(`${label} (${lon}, ${lat})`, countryAt(lon, lat), expected);
}

// 1:110m は海岸線が粗く、沿岸の点は陸から外れる。assets/map.js の
// 最寄り国スナップ（world.coastSnapKm）で拾う前提なので、ここでは参考表示に留める。
console.log('\n沿岸の点（スナップ前）');
for (const [label, lon, lat] of [
  ['ニューヨーク', -74.0, 40.7],
  ['リオデジャネイロ', -43.2, -22.9],
  ['ムンバイ', 72.87, 19.08],
]) {
  console.log(`  ${label} … ${countryAt(lon, lat) ?? '陸の外（スナップで拾う）'}`);
}

console.log('\n日本語名');
for (const iso of ['JP', 'CL', 'MR', 'KZ', 'BO']) {
  const country = byIso.get(iso);
  console.log(`  ${iso} = ${country?.name ?? '見つからない'}  隣接 ${country?.neighbors.join(',')}`);
}

console.log(`\n国 ${world.countries.length} / 陸地リング ${world.land.length}`);
console.log(failures ? `\n${failures} 件が期待と違います` : '\nすべて期待どおり');
process.exit(failures ? 1 : 0);
