// 目視用の一覧を書き出す（仕様 §9 / §13）。
//
//   npm run sheet
//   npm run sheet -- --per=12          … 1ページの枚数
//   npm run sheet -- --only=undecided  … 未決定だけ（採否を決めるとき）
//   npm run sheet -- --montage         … HTML ではなく PNG で書き出す
//
// --montage は候補を1枚の画像にまとめる。何十枚も並べた HTML はブラウザの
// 読み込みが間に合わないことがあり、画像にしたほうが確実に見られる。
// 枠の色: 緑=採用 / 黄=未決定 / 赤=機械が落としたもの
//
// 弁別性のスコアの役割は採否を決めることではなく、人が見る順番を並べ替えること。
// 100問規模になると1ページに収まらないので、ページに分けて書き出す。
// npm run score -- --screen を先に走らせておくと、機械の下見の結果も出る。
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadPipeline, resolveSource, inRoot } from './lib/config.mjs';
import { frameBounds } from './lib/geo.mjs';
import { fetchPixels } from './lib/imagery.mjs';
import { encodePng, blankImage, drawScaled, drawRect } from './lib/png-write.mjs';

const pipeline = loadPipeline();
const args = process.argv.slice(2);
const perPage = Number(args.find((a) => a.startsWith('--per='))?.slice('--per='.length) ?? 12);
const onlyArg = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const montage = args.includes('--montage');
const idsArg = args.find((a) => a.startsWith('--ids='))?.slice('--ids='.length);
const ids = idsArg ? new Set(idsArg.split(',')) : null;

function loadGlobal(path, name) {
  if (!existsSync(inRoot(path))) return null;
  globalThis.window = globalThis.window ?? {};
  new Function(readFileSync(inRoot(path), 'utf8'))();
  return globalThis.window[name];
}

const questions = loadGlobal('data/questions.js', 'EARTH_PATCH_QUESTIONS') ?? [];
const manifest = loadGlobal('img/manifest.js', 'EARTH_PATCH_MANIFEST') ?? {};
const screenPath = inRoot(pipeline.output.workDir, 'screen.json');
const screened = existsSync(screenPath)
  ? new Map(JSON.parse(readFileSync(screenPath, 'utf8')).map((r) => [r.id, r]))
  : new Map();

const outDir = inRoot(pipeline.output.workDir);
mkdirSync(outDir, { recursive: true });

function statusOf(question) {
  if (question.adopted === true) return { key: 'adopted', label: '採用' };
  if (question.adopted === false) return { key: 'rejected', label: '不採用' };
  return { key: 'undecided', label: '未決定' };
}

let rows = questions.map((question) => {
  const bounds = frameBounds(
    question.answer.lat,
    question.answer.lon,
    question.frame.areaKm2,
    pipeline.frame,
  );
  return { question, bounds, status: statusOf(question), screen: screened.get(question.id) };
});

if (onlyArg === 'undecided') rows = rows.filter((r) => r.status.key === 'undecided');
if (onlyArg === 'adopted') rows = rows.filter((r) => r.status.key === 'adopted');
if (ids) rows = rows.filter((r) => ids.has(r.question.id));

// 未決定を先に、分野ごとにまとめ、機械が落としたものは後ろへ。
const order = { undecided: 0, adopted: 1, rejected: 2 };
rows.sort((a, b) => {
  const byStatus = order[a.status.key] - order[b.status.key];
  if (byStatus) return byStatus;
  const machineA = a.screen && !a.screen.ok ? 1 : 0;
  const machineB = b.screen && !b.screen.ok ? 1 : 0;
  if (machineA !== machineB) return machineA - machineB;
  const byCategory = (a.question.category ?? '').localeCompare(b.question.category ?? '');
  if (byCategory) return byCategory;
  return (b.question.scores?.distinct ?? 0) - (a.question.scores?.distinct ?? 0);
});

const escape = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function card(row, index) {
  const { question, bounds, status, screen } = row;
  // 未決定の候補にはまだ image が無い。id から引く（npm run fetch の出力先と同じ規則）。
  const key = question.image?.key ?? `${pipeline.r2.prefix}${question.id}.jpg`;
  const onDisk = existsSync(inRoot(pipeline.output.imageRoot, key));
  const src = onDisk ? join('..', pipeline.output.imageRoot, key) : '';
  const flag = screen && !screen.ok ? `<div class="flag">機械 x ${escape(screen.reasons.join(' / '))}</div>` : '';
  const scanline = screen ? `縞 ${screen.scanline}%` : '';
  return `<figure class="card ${status.key}">
  ${src ? `<img src="${escape(src)}" alt="${escape(question.id)}" loading="lazy">` : '<div class="missing">画像なし</div>'}
  ${flag}
  <figcaption>
    <b>${index}. ${escape(question.id)}</b> <span class="badge">${status.label}</span>
    <div class="place">${escape(question.answer.place)}</div>
    <div class="meta">${escape(question.category ?? '—')} ・ ${question.frame.areaKm2} km² ・ 一辺 ${bounds.sideKm.toFixed(0)} km ${scanline ? `・ ${scanline}` : ''}</div>
    <div class="headline">${escape(question.headline ?? '')}</div>
  </figcaption>
</figure>`;
}

const STYLE = `
  body { margin: 0; padding: 20px; background: #14161a; color: #e8e6e1;
         font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif; }
  h1 { font-size: 17px; font-weight: 600; margin: 0 0 4px; }
  .summary { color: #9aa0a6; font-size: 13px; margin-bottom: 16px; }
  .nav { color: #9aa0a6; font-size: 13px; margin-bottom: 16px; }
  .nav a { color: #cfd3d8; margin-right: 10px; }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(3, 1fr); }
  .card { position: relative; margin: 0; background: #1d2026; border: 1px solid #2a2e36;
          border-radius: 5px; overflow: hidden; }
  .card.rejected { opacity: .38; }
  .card.adopted { border-color: #4b7f52; }
  .card.undecided { border-color: #7a6a3a; }
  img { width: 100%; display: block; aspect-ratio: 1; object-fit: cover; background: #000; }
  .missing { aspect-ratio: 1; display: grid; place-items: center; color: #6b7280; }
  .flag { position: absolute; top: 0; left: 0; right: 0; padding: 5px 8px;
          background: rgba(150, 40, 40, .88); font-size: 11px; }
  figcaption { padding: 8px 10px 10px; font-size: 12px; line-height: 1.5; }
  .badge { font-size: 11px; color: #9aa0a6; }
  .place { font-size: 13px; margin-top: 2px; }
  .meta { color: #9aa0a6; font-size: 11px; }
  .headline { margin-top: 4px; color: #c9c5bd; }
`;

const pages = [];
for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));

if (montage) {
  await writeMontages();
  process.exit(0);
}

/**
 * 候補を1枚の PNG にまとめる。番号は左上から右へ、上から下へ。
 * 番号と id の対応は work/montage-index.txt に書き出す。
 */
async function writeMontages() {
  const source = resolveSource();
  const cell = 300;
  const gap = 6;
  const columns = 4;
  const index = [];

  for (const [pageIndex, pageRows] of pages.entries()) {
    const gridRows = Math.ceil(pageRows.length / columns);
    const sheet = blankImage(
      columns * cell + (columns + 1) * gap,
      gridRows * cell + (gridRows + 1) * gap,
      [18, 20, 24],
    );

    for (const [i, row] of pageRows.entries()) {
      const x = gap + (i % columns) * (cell + gap);
      const y = gap + Math.floor(i / columns) * (cell + gap);
      const number = pageIndex * perPage + i + 1;
      index.push(
        `${String(number).padStart(3)}  ${row.question.id.padEnd(22)}` +
          `${(row.question.category ?? '').padEnd(4)}` +
          `${String(row.question.frame.areaKm2).padStart(6)}km²  ` +
          `${row.screen && !row.screen.ok ? `機械x ${row.screen.reasons.join(' / ')}` : ''}`,
      );

      try {
        const probe = await fetchPixels(
          source,
          {
            lat: row.question.answer.lat,
            lon: row.question.answer.lon,
            areaKm2: row.question.frame.areaKm2,
            px: cell,
            layerKey: 'truecolor',
          },
          pipeline.frame,
        );
        drawScaled(sheet, probe, x, y, cell);
      } catch (error) {
        console.log(`  ! ${row.question.id} を取れませんでした: ${error.message}`);
      }

      const color =
        row.status.key === 'adopted' ? [70, 170, 100]
        : row.screen && !row.screen.ok ? [200, 70, 70]
        : [200, 165, 60];
      drawRect(sheet, x, y, cell, cell, color, 3);
    }

    const path = join(outDir, `montage-${pageIndex + 1}.png`);
    writeFileSync(path, encodePng(sheet));
    console.log(`${path.replace(inRoot('.'), '.')}  ${pageRows.length} 枚`);
  }

  writeFileSync(join(outDir, 'montage-index.txt'), `${index.join('\n')}\n`);
  console.log(`\n番号と id の対応は ${pipeline.output.workDir}/montage-index.txt`);
}

const counts = rows.reduce((acc, row) => {
  acc[row.status.label] = (acc[row.status.label] ?? 0) + 1;
  return acc;
}, {});

pages.forEach((pageRows, pageIndex) => {
  const links = pages
    .map((_, i) => (i === pageIndex ? `<b>${i + 1}</b>` : `<a href="contact-sheet-${i + 1}.html">${i + 1}</a>`))
    .join(' ');
  const html = `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<title>目視用一覧 ${pageIndex + 1}/${pages.length}</title>
<style>${STYLE}</style>
<h1>EARTH PATCH 目視用一覧　${pageIndex + 1} / ${pages.length}</h1>
<div class="summary">${rows.length} 件（${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' / ')}）・未決定を先に、分野ごとに並べています。赤い帯は機械が落としたもの。</div>
<div class="nav">ページ: ${links}</div>
<div class="grid">
${pageRows.map((row, i) => card(row, pageIndex * perPage + i + 1)).join('\n')}
</div>
</html>
`;
  writeFileSync(join(outDir, `contact-sheet-${pageIndex + 1}.html`), html);
});

console.log(`${pipeline.output.workDir}/contact-sheet-1..${pages.length}.html を書きました  ${rows.length} 件`);
console.log(`  ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
if (!screened.size) console.log('  ※ npm run score -- --screen を先に走らせると、機械の下見の結果も出ます');
