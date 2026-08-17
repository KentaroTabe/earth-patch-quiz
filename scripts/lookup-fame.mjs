// 手で選んだ問題の知名度を Wikidata で実測する（仕様 §5.5）。
//
//   npm run fame                      … data/questions.js の全問
//   npm run fame -- richat fuji       … id を指定
//
// scan-candidates.mjs は数千の候補をまとめて処理するが、こちらは
// 人が選んだ数十件の言語版数を確かめて difficulty を決めるためのもの。
// questions.js の wikipedia フィールド（英語版の記事名）を手掛かりにする。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadPipeline, inRoot } from './lib/config.mjs';
import { haversine } from './lib/geo.mjs';

const pipeline = loadPipeline();
const API = 'https://www.wikidata.org/w/api.php';

function loadQuestions() {
  globalThis.window = {};
  new Function(readFileSync(inRoot('data/questions.js'), 'utf8'))();
  return globalThis.window.EARTH_PATCH_QUESTIONS;
}

/** 言語版数から fame と difficulty を出す。式は仕様 §5.5 のまま。 */
export function fameFromLangs(langs, pipelineCfg) {
  const fame = Math.min(1, Math.log(1 + langs) / Math.log(1 + pipelineCfg.fame.langsSaturation));
  const raw = 1 + Math.floor(pipelineCfg.difficulty.levels * (1 - fame));
  const difficulty = Math.max(pipelineCfg.difficulty.min, Math.min(pipelineCfg.difficulty.max, raw));
  return { fame: Number(fame.toFixed(3)), difficulty };
}

const REQUEST_INTERVAL_MS = 400;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function fetchEntity(title) {
  // Wikidata の API は連投すると弾かれる。1件ずつ間隔を空ける。
  await sleep(REQUEST_INTERVAL_MS);
  const params = new URLSearchParams({
    action: 'wbgetentities',
    sites: 'enwiki',
    titles: title,
    props: 'sitelinks|labels|claims',
    languages: 'ja|en',
    format: 'json',
    origin: '*',
  });
  const response = await fetch(`${API}?${params}`, {
    headers: { 'User-Agent': pipeline.candidates.userAgent },
    signal: AbortSignal.timeout(pipeline.candidates.requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Wikidata API HTTP ${response.status}`);
  const json = await response.json();
  const entities = json.entities ?? {};
  const id = Object.keys(entities).find((key) => key.startsWith('Q'));
  if (!id) return null;
  const entity = entities[id];

  // wikipedia の言語版だけを数える（wikiquote / wikivoyage などを除く）。
  const langs = Object.keys(entity.sitelinks ?? {}).filter((site) => site.endsWith('wiki')).length;

  const coordinate = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value ?? null;
  return {
    id,
    langs,
    labelJa: entity.labels?.ja?.value ?? '',
    labelEn: entity.labels?.en?.value ?? '',
    lat: coordinate?.latitude ?? null,
    lon: coordinate?.longitude ?? null,
  };
}

const wanted = new Set(process.argv.slice(2));
const questions = loadQuestions().filter((q) => !wanted.size || wanted.has(q.id));

console.log('id                題名                       Q番号        言語版  fame  難易度  座標のずれ');
console.log('─'.repeat(96));

const rows = [];
for (const question of questions) {
  const title = question.wikipedia;
  if (!title) {
    console.log(`${question.id.padEnd(18)} wikipedia フィールドがないので飛ばします`);
    continue;
  }
  const entity = await fetchEntity(title);
  if (!entity) {
    console.log(`${question.id.padEnd(18)} "${title}" が Wikidata で見つかりません`);
    continue;
  }
  const { fame, difficulty } = fameFromLangs(entity.langs, pipeline);
  const gapKm =
    entity.lat === null
      ? null
      : haversine(
          { lat: question.answer.lat, lon: question.answer.lon },
          { lat: entity.lat, lon: entity.lon },
          pipeline.frame.earthRadiusKm,
        );
  const gapText = gapKm === null ? '座標なし' : `${gapKm.toFixed(0)} km`;
  const warn = gapKm !== null && gapKm > 60 ? '  ← 別の地物かもしれません' : '';
  console.log(
    `${question.id.padEnd(18)}${(entity.labelJa || entity.labelEn).padEnd(24)}` +
      `${entity.id.padEnd(12)}${String(entity.langs).padStart(5)}${String(fame).padStart(8)}` +
      `${String(difficulty).padStart(6)}${gapText.padStart(12)}${warn}`,
  );
  rows.push({ id: question.id, qid: entity.id, langs: entity.langs, fame, difficulty });
}

console.log('\n難易度の分布（絶対値による暫定。最終的な難易度は npm run score が決める）');
for (let level = pipeline.difficulty.min; level <= pipeline.difficulty.max; level++) {
  const ids = rows.filter((r) => r.difficulty === level).map((r) => r.id);
  console.log(`  ${level}: ${ids.length} 問  ${ids.join(', ')}`);
}

mkdirSync(inRoot(pipeline.output.workDir), { recursive: true });
const outPath = inRoot(pipeline.output.workDir, 'fame.json');
const existing = safeRead(outPath);
const merged = { ...existing };
for (const row of rows) merged[row.id] = { qid: row.qid, langs: row.langs };
writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`\n${pipeline.output.workDir}/fame.json を書きました  ${Object.keys(merged).length} 件`);

function safeRead(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}
