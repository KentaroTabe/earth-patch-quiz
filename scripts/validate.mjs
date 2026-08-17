// データの規約違反を検査する（仕様 §10）。
// Cloudflare Pages のビルドで走るので、通らなければ公開されない。
//
//   npm run validate
//
// 検査を緩めて通すのは禁止。落ちたらデータを直す。
import { existsSync, readFileSync } from 'node:fs';
import { loadPipeline, inRoot } from './lib/config.mjs';
import { pointInRings } from './lib/geo.mjs';

const pipeline = loadPipeline();

const REQUIRED_FIELDS = ['id', 'answer', 'frame', 'headline', 'caption', 'term', 'image'];
const MAX_CAPTION_SENTENCES = 2;
const FORBIDDEN_CREDIT = 'Google';

const failures = [];
const warnings = [];

function fail(id, message) {
  failures.push(`${id}: ${message}`);
}

function warn(id, message) {
  warnings.push(`${id}: ${message}`);
}

function loadGlobal(path, name) {
  if (!existsSync(inRoot(path))) {
    failures.push(`${path} がありません`);
    return null;
  }
  globalThis.window = globalThis.window ?? {};
  new Function(readFileSync(inRoot(path), 'utf8'))();
  return globalThis.window[name];
}

const questions = loadGlobal('data/questions.js', 'EARTH_PATCH_QUESTIONS');
const world = loadGlobal('data/world.js', 'EARTH_PATCH_WORLD');
const manifest = loadGlobal('img/manifest.js', 'EARTH_PATCH_MANIFEST');
const siteConfig = loadGlobal('assets/config.js', 'EARTH_PATCH_CONFIG');

if (!questions || !world || !manifest || !siteConfig) {
  report();
}

const onLand = (lon, lat) => world.land.some((ring) => pointInRings(lon, lat, [ring]));

// ── id の重複（採用・不採用を問わず）──────────────
const seen = new Map();
for (const question of questions) {
  if (!question.id) {
    fail('(id なし)', 'id がありません');
    continue;
  }
  seen.set(question.id, (seen.get(question.id) ?? 0) + 1);
}
for (const [id, count] of seen) {
  if (count > 1) fail(id, `id が ${count} 件あります`);
}

// ── 不採用は記録として残すだけ。理由の有無だけ見る ──
for (const question of questions.filter((q) => q.adopted === false)) {
  if (!question.reject) warn(question.id, '不採用なのに reject に理由が書かれていません');
}

const adopted = questions.filter((q) => q.adopted !== false);
const servesImagesRemotely = /^https?:\/\//.test(siteConfig.imageBase);

/** 1枚ぶんの画像情報が manifest と食い違っていないか見る。 */
function checkImage(id, image, prefix) {
  if (!image?.key) {
    fail(id, `image.${prefix}key がありません`);
    return;
  }
  const entry = manifest[image.key];
  if (!entry) {
    fail(id, `img/manifest.js に ${image.key} がありません`);
    return;
  }
  if (entry.width !== image.width) {
    fail(id, `image.${prefix}width が manifest と違います（${image.width} / ${entry.width}）`);
  }
  if (image.date !== undefined && entry.date !== image.date) {
    fail(id, `image.${prefix}date が manifest と違います（${image.date} / ${entry.date}）`);
  }
  if (image.credit !== undefined && entry.credit !== image.credit) {
    fail(id, `image.${prefix}credit が manifest と違います`);
  }
  // 画像を外部（R2）から配信しているときは、ここでファイルの有無は見ない。
  // 実物が読めるかは npm run fetch -- --verify-only が確かめる。
  if (!servesImagesRemotely && !existsSync(inRoot(pipeline.output.imageRoot, image.key))) {
    fail(id, `画像ファイルがありません（${pipeline.output.imageRoot}/${image.key}）`);
  }
}

if (servesImagesRemotely) {
  warn(
    '(全体)',
    `画像は外部から配信しています（${siteConfig.imageBase}）。` +
      '実際に読めるかは npm run fetch -- --verify-only で確かめてください',
  );
}

for (const question of adopted) {
  const id = question.id ?? '(id なし)';

  // 必須項目
  for (const field of REQUIRED_FIELDS) {
    if (question[field] === undefined || question[field] === null || question[field] === '') {
      fail(id, `${field} がありません`);
    }
  }
  if (!question.answer || !question.frame || !question.image) continue;

  // 座標。陸地ポリゴンの外／南極は落とす。
  const { lat, lon } = question.answer;
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    fail(id, '座標が数値ではありません');
  } else {
    if (lat < pipeline.world.latMin) fail(id, `南極側の範囲外です（緯度 ${lat}）`);
    if (lat > pipeline.world.latMax) fail(id, `北の表示範囲外です（緯度 ${lat}）`);
    if (!onLand(lon, lat)) fail(id, `陸地ポリゴンの外にあります（${lat}, ${lon}）`);
  }
  if (!question.answer.place) fail(id, 'answer.place がありません');
  if (!question.answer.country) fail(id, 'answer.country がありません');

  // 文章。caption は2文まで。1文目は必ず理由から書く（規約は目視で見る）。
  if (typeof question.caption === 'string') {
    const sentences = question.caption.split('。').filter((s) => s.trim().length).length;
    if (sentences > MAX_CAPTION_SENTENCES) {
      fail(id, `caption が ${sentences} 文あります（${MAX_CAPTION_SENTENCES} 文まで）`);
    }
  }
  if (typeof question.headline === 'string' && typeof question.term === 'string') {
    if (question.headline.includes(question.term)) {
      fail(id, `headline に term「${question.term}」がそのまま入っています`);
    }
  }

  // 難易度
  const difficulty = question.scores?.difficulty;
  if (!Number.isInteger(difficulty) || difficulty < pipeline.difficulty.min || difficulty > pipeline.difficulty.max) {
    fail(id, `difficulty が ${pipeline.difficulty.min}〜${pipeline.difficulty.max} の整数ではありません（${difficulty}）`);
  }

  // 画像とその出典。出題する枠と、結果画面に出す広域の2枚。
  checkImage(id, question.image, '');
  if (!question.image.context) {
    fail(id, 'image.context がありません（結果画面に出す広域画像）');
  } else {
    checkImage(id, question.image.context, 'context.');
    const expected = question.frame.areaKm2 * pipeline.context.sideScale ** 2;
    if (question.image.context.areaKm2 !== expected) {
      fail(
        id,
        `image.context.areaKm2 が ${question.image.context.areaKm2} ですが、` +
          `枠 ${question.frame.areaKm2} km² の ${pipeline.context.sideScale} 倍なら ${expected} です`,
      );
    }
  }
  const credit = question.image.credit ?? '';
  if (credit.includes(FORBIDDEN_CREDIT)) {
    fail(id, `credit に ${FORBIDDEN_CREDIT} が入っています（原則1: 使えるのは NASA と Copernicus だけ）`);
  }
}

// ── 出題順。同じ国が3問連続すると落とす ─────────
for (let i = 2; i < adopted.length; i++) {
  const a = adopted[i - 2].answer?.country;
  const b = adopted[i - 1].answer?.country;
  const c = adopted[i].answer?.country;
  if (a && a === b && b === c) {
    fail(adopted[i].id, `同じ国（${c}）が3問続いています`);
  }
}

// ── 1セットを組めるだけの数があるか ──────────────
if (adopted.length < siteConfig.set.size) {
  fail('(全体)', `採用が ${adopted.length} 問しかありません（1セット ${siteConfig.set.size} 問）`);
}

report();

function report() {
  const adoptedCount = questions ? questions.filter((q) => q.adopted !== false).length : 0;
  console.log(`検査対象: 採用 ${adoptedCount} 問 / 全 ${questions ? questions.length : 0} 件`);

  if (warnings.length) {
    console.log(`\n注意 ${warnings.length} 件`);
    for (const w of warnings) console.log(`  - ${w}`);
  }

  if (failures.length) {
    console.log(`\n違反 ${failures.length} 件`);
    for (const f of failures) console.log(`  x ${f}`);
    console.log('\n仕様 §10 の検査に落ちました。データを直してください（検査は緩めないこと）。');
    process.exit(1);
  }

  console.log('\n違反なし');
  process.exit(0);
}
