// 弁別性を計算し、枠サイズを決める（仕様 §5.3〜§5.5）。
//
//   npm run score                  … data/questions.js の採用分を採点する
//   npm run score -- --candidates  … work/candidates.json（scan の出力）を採点する
//   npm run score -- --fit-frame   … 枠を段階的に広げ、しきい値を超えたところで確定する
//
// 弁別性は「画像の情報量」ではなく「他のどことも違うか」を測る。§5.1 を読んでから触ること。
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { loadPipeline, resolveSource, inRoot } from './lib/config.mjs';
import { fetchPixels } from './lib/imagery.mjs';
import {
  colorClusterCount,
  combineDistinct,
  inspectQuality,
  linearity,
  nearestNeighborDistances,
  normalizeSeries,
  perceptualHash,
  waterFeatures,
} from './lib/image-features.mjs';

const pipeline = loadPipeline();
const args = process.argv.slice(2);
const useCandidates = args.includes('--candidates');
const fitFrame = args.includes('--fit-frame');
const source = resolveSource(args.find((a) => a.startsWith('--source='))?.slice('--source='.length));

function loadGlobal(path, name) {
  globalThis.window = globalThis.window ?? {};
  new Function(readFileSync(inRoot(path), 'utf8'))();
  return globalThis.window[name];
}

function loadTargets() {
  if (useCandidates) {
    const path = inRoot(pipeline.output.workDir, 'candidates.json');
    if (!existsSync(path)) throw new Error('work/candidates.json がありません。先に npm run scan を走らせてください。');
    return JSON.parse(readFileSync(path, 'utf8')).map((c) => ({
      id: c.id,
      lat: c.lat,
      lon: c.lon,
      areaKm2: pipeline.frame.sizesKm2[0],
      langs: c.langs,
    }));
  }
  const fame = existsSync(inRoot(pipeline.output.workDir, 'fame.json'))
    ? JSON.parse(readFileSync(inRoot(pipeline.output.workDir, 'fame.json'), 'utf8'))
    : {};
  return loadGlobal('data/questions.js', 'EARTH_PATCH_QUESTIONS')
    .filter((q) => q.adopted === true)
    .map((q) => ({
      id: q.id,
      lat: q.answer.lat,
      lon: q.answer.lon,
      areaKm2: q.frame.areaKm2,
      langs: fame[q.id]?.langs ?? null,
    }));
}

/** 1枠ぶんの生の特徴量を測る。合成（正規化）は全件そろってから行う。 */
async function measure(target, areaKm2) {
  const px = pipeline.frame.analysisPx;
  const truecolor = await fetchPixels(
    source,
    { lat: target.lat, lon: target.lon, areaKm2, px, layerKey: 'truecolor' },
    pipeline.frame,
  );
  const quality = inspectQuality(truecolor, pipeline.quality);

  // NDWI は緑と近赤外の比。近赤外は 7-4-3 合成の G 面から取る（config/sources.json）。
  // 表示用に伸張された合成画像しか無いソースでは NDWI を使わず、RGB の経験則に落とす。
  const useNdwi = Boolean(source.bandChannels) && source.reflectanceLinear === true;
  let nir = null;
  if (useNdwi) {
    nir = await fetchPixels(
      source,
      { lat: target.lat, lon: target.lon, areaKm2, px, layerKey: source.bandChannels.nir.layer },
      pipeline.frame,
    );
  }
  const water = waterFeatures(truecolor, nir, pipeline.distinct, useNdwi);

  return {
    areaKm2,
    quality,
    waterShare: water.waterShare,
    waterVariance: water.waterVariance,
    clusters: colorClusterCount(truecolor, pipeline.distinct),
    linearity: linearity(truecolor, pipeline.distinct).peak,
    hash: perceptualHash(truecolor, pipeline.distinct),
  };
}

function fameOf(langsSeries) {
  // 仕様 §5.5 の fame = norm(log(1 + 言語版数))。norm は §5.3 と同じ、全候補の中での正規化。
  const logs = langsSeries.map((n) => Math.log(1 + (n ?? 0)));
  return normalizeSeries(logs, pipeline.distinct.normalizePercentile);
}

function difficultyOf(fame) {
  const raw = 1 + Math.floor(pipeline.difficulty.levels * (1 - fame));
  return Math.max(pipeline.difficulty.min, Math.min(pipeline.difficulty.max, raw));
}

async function main() {
  const targets = loadTargets();
  console.log(`ソース: ${source.label}  ${source.metersPerPixel} m/px`);
  console.log(`対象 ${targets.length} 件  ${fitFrame ? '（枠サイズも決める）' : '（枠は指定どおり）'}\n`);

  const measured = [];
  for (const target of targets) {
    if (!fitFrame) {
      const m = await measure(target, target.areaKm2);
      measured.push({ target, ...m });
      report(target, m);
      continue;
    }
    // 仕様 §5.4。小さい枠から広げ、下見で雲・欠測を弾きつつ確定する。
    let chosen = null;
    for (const size of pipeline.frame.sizesKm2) {
      const probe = await fetchPixels(
        source,
        { lat: target.lat, lon: target.lon, areaKm2: size, px: pipeline.frame.probePx, layerKey: 'truecolor' },
        pipeline.frame,
      );
      if (!inspectQuality(probe, pipeline.quality).ok) continue;
      chosen = { size, ...(await measure(target, size)) };
      break;
    }
    if (!chosen) {
      console.log(`${target.id.padEnd(18)} どの枠でも下見を通りませんでした`);
      continue;
    }
    measured.push({ target, ...chosen });
    report(target, chosen);
  }

  if (!measured.length) {
    console.log('採点できたものがありません');
    return;
  }

  // ここからが合成。最近傍距離は全件そろわないと出せない（仕様 §5.3）。
  const nn = nearestNeighborDistances(measured.map((m) => m.hash), pipeline.distinct);
  const norm = {
    nn: normalizeSeries(nn, pipeline.distinct.normalizePercentile),
    wv: normalizeSeries(measured.map((m) => m.waterVariance), pipeline.distinct.normalizePercentile),
    c: normalizeSeries(measured.map((m) => m.clusters), pipeline.distinct.normalizePercentile),
    l: normalizeSeries(measured.map((m) => m.linearity), pipeline.distinct.normalizePercentile),
  };
  const fame = fameOf(measured.map((m) => m.target.langs));

  const scored = measured.map((m, i) => ({
    id: m.target.id,
    areaKm2: m.areaKm2,
    langs: m.target.langs,
    distinct: round(combineDistinct({ nn: norm.nn[i], wv: norm.wv[i], c: norm.c[i], l: norm.l[i] }, pipeline.distinct.weights)),
    fame: round(fame[i]),
    difficulty: difficultyOf(fame[i]),
    raw: {
      nnDistance: round(nn[i]),
      waterShare: round(m.waterShare),
      waterVariance: round(m.waterVariance),
      clusters: m.clusters,
      linearity: round(m.linearity),
      meanLuma: round(m.quality.mean),
      badPixelShare: round(m.quality.badShare),
    },
    passesThreshold: combineDistinct(
      { nn: norm.nn[i], wv: norm.wv[i], c: norm.c[i], l: norm.l[i] },
      pipeline.distinct.weights,
    ) >= pipeline.distinct.threshold,
  }));

  scored.sort((a, b) => b.distinct - a.distinct);

  console.log('\n弁別性の高い順');
  console.log('id                  枠km²  言語版  弁別性  知名度  難易度  しきい値');
  console.log('─'.repeat(74));
  for (const s of scored) {
    console.log(
      `${s.id.padEnd(20)}${String(s.areaKm2).padStart(5)}${String(s.langs ?? '—').padStart(7)}` +
        `${s.distinct.toFixed(3).padStart(8)}${s.fame.toFixed(3).padStart(8)}${String(s.difficulty).padStart(7)}` +
        `${(s.passesThreshold ? ' 超えた' : ' 下回る').padStart(9)}`,
    );
  }

  console.log('\n難易度の分布');
  for (let level = pipeline.difficulty.min; level <= pipeline.difficulty.max; level++) {
    const ids = scored.filter((s) => s.difficulty === level).map((s) => s.id);
    console.log(`  ${level}: ${String(ids.length).padStart(2)} 問  ${ids.join(', ')}`);
  }

  console.log('\ndata/questions.js に貼る値');
  for (const s of [...scored].sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`  ${s.id}: scores: { distinct: ${s.distinct}, fame: ${s.fame}, difficulty: ${s.difficulty} },`);
  }

  mkdirSync(inRoot(pipeline.output.workDir), { recursive: true });
  const outPath = inRoot(pipeline.output.workDir, useCandidates ? 'scored-candidates.json' : 'scores.json');
  writeFileSync(outPath, `${JSON.stringify(scored, null, 2)}\n`);
  console.log(`\n${outPath.replace(inRoot('.'), '.')} を書きました`);
  console.log('※ 重みは目視ラベル100枚で調整するまで暫定です（docs/SCORING.md）。');
}

function report(target, m) {
  console.log(
    `${target.id.padEnd(18)} ${String(m.areaKm2).padStart(5)} km²  ` +
      `水域 ${(m.waterShare * 100).toFixed(0)}%  分散 ${m.waterVariance.toFixed(3)}  ` +
      `色 ${m.clusters}  直線 ${m.linearity.toFixed(1)}  ` +
      `輝度 ${m.quality.mean.toFixed(0)}${m.quality.ok ? '' : '  ← 下見の基準を満たしていません'}`,
  );
}

function round(value) {
  return Number(value.toFixed(3));
}

await main();
