// Wikidata から候補点を作る（仕様 §5.2）。
//
//   npm run scan
//   npm run scan -- --query      … 投げる SPARQL を表示するだけ
//   npm run scan -- --class=Q23397
//
// 陸地全体を格子で刻むと 50km² 単位で約270万タイルになり、全部落とすのは非現実的。
// 画像を落とす前にベクタデータで絞る、というのがこの工程の目的。
//
// 座標を持つ地物と Wikipedia の言語版数が同時に取れるので、
// 候補点と知名度を1回のクエリでそろえられる。
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { loadPipeline, inRoot } from './lib/config.mjs';
import { pointInRings } from './lib/geo.mjs';

const pipeline = loadPipeline();
const cfg = pipeline.candidates;
const args = process.argv.slice(2);
const showQueryOnly = args.includes('--query');
const classArg = args.find((a) => a.startsWith('--class='))?.slice('--class='.length);

const classes = classArg ? [classArg] : Object.keys(cfg.classes);

/**
 * 仕様 §5.2 のクエリ。クラスと言語版数のしきい値は設定から入れる。
 * 仕様の例からひとつ変えているのは天体の絞り込み。P625 は月や火星の地物にも付いていて、
 * そのままだと火星のカルデラが地球の候補として混ざる（Q2 = 地球）。
 */
function buildQuery() {
  return `SELECT ?item ?lat ?lon (COUNT(DISTINCT ?sitelink) AS ?langs) WHERE {
  ?item wdt:P31/wdt:P279* ?class ;
        p:P625/psv:P625 ?coordNode .
  VALUES ?class { ${classes.map((q) => `wd:${q}`).join(' ')} }
  ?coordNode wikibase:geoGlobe wd:Q2 ;
             wikibase:geoLatitude ?lat ;
             wikibase:geoLongitude ?lon .
  ?sitelink schema:about ?item ; schema:isPartOf/wikibase:wikiGroup "wikipedia" .
}
GROUP BY ?item ?lat ?lon
HAVING (?langs >= ${cfg.minLanguages})
LIMIT ${cfg.maxRows}`;
}

function loadWorld() {
  const path = inRoot('data/world.js');
  if (!existsSync(path)) {
    throw new Error('data/world.js がありません。先に npm run world を走らせてください。');
  }
  globalThis.window = {};
  new Function(readFileSync(path, 'utf8'))();
  return globalThis.window.EARTH_PATCH_WORLD;
}

async function runQuery(query) {
  const response = await fetch(`${cfg.sparqlEndpoint}?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': cfg.userAgent },
    signal: AbortSignal.timeout(cfg.requestTimeoutMs),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 400);
    throw new Error(
      `Wikidata へのクエリが失敗しました HTTP ${response.status}\n${body}\n` +
        'クラスを分けて（--class=Q23397 など）投げ直すと通ることがあります。',
    );
  }
  return response.json();
}

async function main() {
  const query = buildQuery();
  if (showQueryOnly) {
    console.log(query);
    return;
  }

  console.log(`クラス ${classes.map((q) => `${q}（${cfg.classes[q] ?? '?'}）`).join(' / ')}`);
  console.log(`言語版 ${cfg.minLanguages} 以上で絞ります\n`);

  const world = loadWorld();
  const json = await runQuery(query);
  const rows = json.results.bindings;
  console.log(`Wikidata から ${rows.length} 件`);

  const candidates = [];
  let offMap = 0;
  let atSea = 0;
  for (const row of rows) {
    const point = { lat: Number(row.lat.value), lon: Number(row.lon.value) };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    if (point.lat < cfg.latMin || point.lat > cfg.latMax) {
      offMap++;
      continue;
    }
    // 海洋上の点を落とす。陸地ポリゴンで判定する。
    if (!world.land.some((ring) => pointInRings(point.lon, point.lat, [ring]))) {
      atSea++;
      continue;
    }
    candidates.push({
      id: row.item.value.split('/').pop(),
      lat: Number(point.lat.toFixed(4)),
      lon: Number(point.lon.toFixed(4)),
      langs: Number(row.langs.value),
    });
  }

  candidates.sort((a, b) => b.langs - a.langs);

  mkdirSync(inRoot(pipeline.output.workDir), { recursive: true });
  const outPath = inRoot(pipeline.output.workDir, 'candidates.json');
  writeFileSync(outPath, `${JSON.stringify(candidates, null, 2)}\n`);

  console.log(`  表示範囲の外で落とした  ${offMap} 件`);
  console.log(`  海洋上で落とした        ${atSea} 件`);
  console.log(`\n${pipeline.output.workDir}/candidates.json を書きました  ${candidates.length} 件`);
  console.log('次は npm run score -- --candidates --fit-frame');
}

await main();
