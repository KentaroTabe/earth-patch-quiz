// 目視用の一覧を書き出す（仕様 §9 / §13）。
//
//   npm run sheet
//
// 弁別性のスコアの役割は採否を決めることではなく、人が見る順番を並べ替えること。
// 上位から順に並べ、採用・不採用・未決定が一目で分かるようにする。
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { relative, dirname } from 'node:path';
import { loadPipeline, inRoot } from './lib/config.mjs';
import { frameBounds } from './lib/geo.mjs';

const pipeline = loadPipeline();

function loadGlobal(path, name) {
  if (!existsSync(inRoot(path))) return null;
  globalThis.window = globalThis.window ?? {};
  new Function(readFileSync(inRoot(path), 'utf8'))();
  return globalThis.window[name];
}

const questions = loadGlobal('data/questions.js', 'EARTH_PATCH_QUESTIONS') ?? [];
const manifest = loadGlobal('img/manifest.js', 'EARTH_PATCH_MANIFEST') ?? {};

const outPath = inRoot(pipeline.output.workDir, 'contact-sheet.html');
mkdirSync(dirname(outPath), { recursive: true });

function statusOf(question) {
  if (question.adopted === true) return { key: 'adopted', label: '採用' };
  if (question.adopted === false) return { key: 'rejected', label: '不採用' };
  return { key: 'undecided', label: '未決定' };
}

const rows = questions
  .map((question) => {
    const entry = manifest[question.image?.key];
    const bounds = frameBounds(
      question.answer.lat,
      question.answer.lon,
      question.frame.areaKm2,
      pipeline.frame,
    );
    return { question, entry, bounds, status: statusOf(question) };
  })
  .sort((a, b) => (b.question.scores?.distinct ?? 0) - (a.question.scores?.distinct ?? 0));

const escape = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const cards = rows
  .map(({ question, entry, bounds, status }) => {
    const src = entry
      ? relative(dirname(outPath), inRoot(pipeline.output.imageDir, `${question.id}.jpg`))
      : '';
    const scores = question.scores ?? {};
    return `<figure class="card ${status.key}">
  ${src ? `<img src="${escape(src)}" alt="${escape(question.id)}" loading="lazy">` : '<div class="missing">画像なし</div>'}
  <figcaption>
    <b>${escape(question.id)}</b> <span class="badge">${status.label}</span>
    <div class="place">${escape(question.answer.place)}</div>
    <div class="meta">${question.frame.areaKm2} km² / 一辺 ${bounds.sideKm.toFixed(1)} km / ${entry ? `${entry.width}px` : '—'}</div>
    <div class="meta">難易度 ${scores.difficulty ?? '—'} ・ 知名度 ${scores.fame ?? '—'} ・ 弁別性 ${scores.distinct ?? '—'}</div>
    <div class="headline">${escape(question.headline)}</div>
  </figcaption>
</figure>`;
  })
  .join('\n');

const counts = rows.reduce((acc, row) => {
  acc[row.status.label] = (acc[row.status.label] ?? 0) + 1;
  return acc;
}, {});

const html = `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<title>EARTH PATCH 目視用一覧</title>
<style>
  body { margin: 0; padding: 24px; background: #14161a; color: #e8e6e1;
         font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  .summary { color: #9aa0a6; font-size: 13px; margin-bottom: 20px; }
  .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
  .card { margin: 0; background: #1d2026; border: 1px solid #2a2e36; border-radius: 6px; overflow: hidden; }
  .card.rejected { opacity: .42; }
  .card.adopted { border-color: #4b7f52; }
  img { width: 100%; display: block; aspect-ratio: 1; object-fit: cover; background: #000; }
  .missing { aspect-ratio: 1; display: grid; place-items: center; color: #6b7280; }
  figcaption { padding: 10px 12px 12px; font-size: 12px; line-height: 1.55; }
  .badge { font-size: 11px; color: #9aa0a6; }
  .place { font-size: 13px; margin-top: 2px; }
  .meta { color: #9aa0a6; }
  .headline { margin-top: 6px; color: #c9c5bd; }
</style>
<h1>EARTH PATCH 目視用一覧</h1>
<div class="summary">${rows.length} 件（${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' / ')}）・弁別性の高い順。採否は data/questions.js の adopted で決める。</div>
<div class="grid">
${cards}
</div>
</html>
`;

writeFileSync(outPath, html);
console.log(`${relative(inRoot('.'), outPath)} を書きました  ${rows.length} 件`);
