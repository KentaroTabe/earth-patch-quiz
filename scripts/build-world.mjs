// Natural Earth 1:110m から data/world.js を作る（仕様 §6.2）。
//
//   npm run world
//
// 出力は回答用の線画地図と、国判定（point-in-polygon）に使うポリゴン。
// 衛星画像は絶対に混ぜない（原則2）。
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { loadPipeline, inRoot } from './lib/config.mjs';
import { ringArea, simplifyRing } from './lib/geo.mjs';

const pipeline = loadPipeline();
const cfg = pipeline.world;
const cacheDir = inRoot(pipeline.output.workDir, 'natural-earth');

async function loadGeoJson(fileName) {
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = `${cacheDir}/${fileName}`;
  if (existsSync(cachePath)) {
    console.log(`  ${fileName} … キャッシュを使う`);
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  }
  const url = `${cfg.naturalEarthBase}/${fileName}`;
  console.log(`  ${fileName} … 取得 ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`${fileName} の取得に失敗 HTTP ${response.status}`);
  const text = await response.text();
  writeFileSync(cachePath, text);
  return JSON.parse(text);
}

/** MultiPolygon / Polygon を、リングの平たい配列にする。穴も含める。 */
function toRings(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flat();
}

/** 表示範囲の外（南極）を丸ごと落とす。 */
function withinView(ring) {
  let maxLat = -90;
  for (const [, lat] of ring) if (lat > maxLat) maxLat = lat;
  return maxLat >= cfg.latMin;
}

function roundRing(ring) {
  const factor = 10 ** cfg.coordinateDecimals;
  const out = [];
  let previous = null;
  for (const [lon, lat] of ring) {
    const point = [
      Math.round(lon * factor) / factor,
      Math.round(Math.max(cfg.latMin - 5, Math.min(cfg.latMax, lat)) * factor) / factor,
    ];
    if (previous && point[0] === previous[0] && point[1] === previous[1]) continue;
    out.push(point);
    previous = point;
  }
  return out.length >= 4 ? out : null;
}

function prepareRings(geometry) {
  const out = [];
  for (const ring of toRings(geometry)) {
    if (!withinView(ring)) continue;
    if (ringArea(ring) < cfg.minRingAreaDeg2) continue;
    const simplified = simplifyRing(ring, cfg.simplifyToleranceDeg);
    if (!simplified) continue;
    const rounded = roundRing(simplified);
    if (rounded) out.push(rounded);
  }
  return out;
}

/**
 * 隣接国。Natural Earth は接する国境で頂点を共有しているので、
 * 簡略化する前の座標を丸めて突き合わせる。海を挟んだ国は隣接にしない。
 */
function buildNeighbors(features, isoOf) {
  const factor = 1 / cfg.neighborVertexRoundDeg;
  const owners = new Map();
  for (const feature of features) {
    const iso = isoOf(feature);
    if (!iso) continue;
    const seen = new Set();
    for (const ring of toRings(feature.geometry)) {
      for (const [lon, lat] of ring) {
        const key = `${Math.round(lon * factor)},${Math.round(lat * factor)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!owners.has(key)) owners.set(key, new Set());
        owners.get(key).add(iso);
      }
    }
  }

  const shared = new Map();
  for (const isoSet of owners.values()) {
    if (isoSet.size < 2) continue;
    const list = [...isoSet];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = [list[i], list[j]].sort().join('|');
        shared.set(key, (shared.get(key) ?? 0) + 1);
      }
    }
  }

  const neighbors = new Map();
  for (const [key, count] of shared) {
    if (count < cfg.neighborSharedVertexMin) continue;
    const [a, b] = key.split('|');
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a).add(b);
    neighbors.get(b).add(a);
  }
  return neighbors;
}

function isoCode(feature) {
  const p = feature.properties;
  for (const value of [p.ISO_A2, p.ISO_A2_EH]) {
    if (value && value !== '-99') return value;
  }
  // ISO を持たない地域（北キプロス・ソマリランド）。判定用に一意な符号を割り当てる。
  return p.ADM0_A3 ? `X${p.ADM0_A3.slice(0, 2)}` : null;
}

function serialize(value) {
  return JSON.stringify(value);
}

async function main() {
  console.log(`Natural Earth を読み込みます（${cfg.countriesFile}）`);
  const [landGeo, countryGeo] = await Promise.all([
    loadGeoJson(cfg.landFile),
    loadGeoJson(cfg.countriesFile),
  ]);

  const land = landGeo.features.flatMap((feature) => prepareRings(feature.geometry));

  const visible = countryGeo.features.filter(
    (feature) => feature.properties.CONTINENT !== 'Antarctica',
  );
  const neighbors = buildNeighbors(visible, isoCode);

  const countries = [];
  for (const feature of visible) {
    const p = feature.properties;
    const iso = isoCode(feature);
    if (!iso) continue;
    const rings = prepareRings(feature.geometry);
    if (!rings.length) continue;
    countries.push({
      iso,
      name: p.NAME_JA,
      nameEn: p.NAME,
      continent: p.CONTINENT,
      area: Number(rings.reduce((sum, ring) => sum + ringArea(ring), 0).toFixed(2)),
      label: [Number(p.LABEL_X.toFixed(2)), Number(p.LABEL_Y.toFixed(2))],
      neighbors: [...(neighbors.get(iso) ?? [])].sort(),
      rings,
    });
  }
  countries.sort((a, b) => b.area - a.area);

  // 出力に残らなかった国（リングが小さすぎて落ちたもの）を隣接から外す。
  const present = new Set(countries.map((c) => c.iso));
  for (const country of countries) {
    country.neighbors = country.neighbors.filter((iso) => present.has(iso));
  }

  const lines = [
    '// 自動生成。手で編集しない。`npm run world` で作り直す。',
    '// 出典: Natural Earth 1:110m（パブリックドメイン）',
    '// 回答用の地図に衛星画像は使わない（仕様 原則2）。ここにあるのは陸地と国境の線だけ。',
    'window.EARTH_PATCH_WORLD = {',
    `  source: ${serialize('Natural Earth 1:110m')},`,
    `  view: { latMin: ${cfg.latMin}, latMax: ${cfg.latMax}, lonMin: -180, lonMax: 180 },`,
    '  land: [',
    ...land.map((ring) => `    ${serialize(ring)},`),
    '  ],',
    '  countries: [',
    ...countries.map(
      (country) =>
        `    {iso:${serialize(country.iso)},name:${serialize(country.name)},` +
        `nameEn:${serialize(country.nameEn)},continent:${serialize(country.continent)},` +
        `area:${country.area},label:${serialize(country.label)},` +
        `neighbors:${serialize(country.neighbors)},rings:${serialize(country.rings)}},`,
    ),
    '  ],',
    '};',
    '',
  ];

  const outPath = inRoot('data/world.js');
  const text = lines.join('\n');
  mkdirSync(inRoot('data'), { recursive: true });
  writeFileSync(outPath, text);

  const kb = (Buffer.byteLength(text) / 1024).toFixed(0);
  const neighborTotal = countries.reduce((sum, c) => sum + c.neighbors.length, 0);
  console.log(`\ndata/world.js を書きました  ${kb} KB`);
  console.log(`  陸地リング ${land.length} / 国 ${countries.length} / 隣接関係 ${neighborTotal / 2} 組`);
  if (kb > 500) console.log('  ※ 目安の 500KB を超えています。simplifyToleranceDeg を上げてください。');
}

await main();
