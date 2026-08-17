// 問題画像を取得し、img/ に保存して img/manifest.js を書き出す（仕様 §6.3）。
// R2 が設定されていれば同時にアップロードする。
//
//   npm run fetch                  … まだ無いものだけ取得
//   npm run fetch -- --force       … 取り直す
//   npm run fetch -- --only=richat,fuji
//   npm run fetch -- --prune       … 不採用（adopted: false）の画像を消す
//   npm run fetch -- --upload-only … 手元の画像を取り直さずに R2 へ上げる
//   npm run fetch -- --verify-only … 公開URLから読めるかだけ確かめる
//   npm run fetch -- --write-questions … 実測値を data/questions.js の image に書き戻す
//   npm run fetch:dry              … 通信せず、叩く URL だけ出す
//
// 1問につき2枚を扱う。
//   q/<id>.jpg   … 出題する枠
//   ctx/<id>.jpg … 結果画面に出す広域（枠の一辺の sideScale 倍）
//
// 閲覧時にはタイルを取りに行かない（仕様 §14）。画像は事前にここで取り切る。
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadPipeline, loadLocalEnv, resolveSource, inRoot } from './lib/config.mjs';
import { frameBounds, nativePixels } from './lib/geo.mjs';
import { buildRequest, fetchImage } from './lib/imagery.mjs';
import { jpegSize } from './lib/jpeg.mjs';
import { r2Status, resolveR2, putObject } from './lib/r2.mjs';

loadLocalEnv();
const pipeline = loadPipeline();
const r2Config = resolveR2(pipeline.r2, process.env);
const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const force = args.includes('--force');
const prune = args.includes('--prune');
const uploadOnly = args.includes('--upload-only');
const verifyOnly = args.includes('--verify-only');
const writeQuestions = args.includes('--write-questions');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;
const sourceArg = args.find((a) => a.startsWith('--source='));

const source = resolveSource(sourceArg?.slice('--source='.length));
const CONTEXT_AREA_SCALE = pipeline.context.sideScale ** 2;

function loadQuestions() {
  globalThis.window = {};
  new Function(readFileSync(inRoot('data/questions.js'), 'utf8'))();
  return globalThis.window.EARTH_PATCH_QUESTIONS;
}

/** ローカルの置き場所はキーからそのまま決まる。img/q/richat.jpg のように。 */
function localPathFor(key) {
  return inRoot(pipeline.output.imageRoot, key);
}

/** 1問あたりの取得対象。出題する枠と、結果画面に出す広域の2枚。 */
function variantsOf(question) {
  const patchKey = question.image?.key ?? `${r2Config.prefix}${question.id}.jpg`;
  const contextKey = question.image?.context?.key ?? `${pipeline.context.prefix}${question.id}.jpg`;
  return [
    { variant: 'patch', key: patchKey, areaKm2: question.frame.areaKm2 },
    {
      variant: 'context',
      key: contextKey,
      areaKm2: question.frame.areaKm2 * CONTEXT_AREA_SCALE,
    },
  ].map((v) => ({ ...v, question, localPath: localPathFor(v.key) }));
}

function requestFor(target) {
  const bounds = frameBounds(
    target.question.answer.lat,
    target.question.answer.lon,
    target.areaKm2,
    pipeline.frame,
  );
  const px = nativePixels(bounds.sideKm, source.metersPerPixel, pipeline.frame);
  const url = buildRequest(source, { layerKey: 'truecolor', bounds, px, format: 'image/jpeg' });
  return { bounds, px, url };
}

async function main() {
  const all = loadQuestions();

  if (prune) {
    let removed = 0;
    for (const question of all.filter((q) => q.adopted === false)) {
      for (const target of variantsOf(question)) {
        if (!existsSync(target.localPath)) continue;
        rmSync(target.localPath);
        removed++;
      }
      console.log(`削除 ${question.id}  ${question.reject ?? ''}`);
    }
    console.log(`不採用の画像を ${removed} 枚消しました\n`);
  }

  const questions = all.filter((q) => q.adopted !== false);
  const wanted = new Set(questions.filter((q) => !only || only.has(q.id)).map((q) => q.id));

  console.log(`ソース: ${source.label}  ${source.metersPerPixel} m/px  ${source.license}`);
  if (source.requiresApproval) {
    console.log('  ※ このソースは利用条件の個別確認が要ります（仕様 §5.6 / §12）');
  }
  console.log(
    `対象 ${questions.length} 問 × 2枚（出題する枠と、一辺 ${pipeline.context.sideScale} 倍の広域）` +
      `${dryRun ? '  --dry: 通信しません' : ''}\n`,
  );

  const r2 = r2Status(r2Config, process.env);
  if (!dryRun) {
    console.log(r2.ready ? `R2: ${r2Config.bucket} へアップロードします` : `R2: 使いません（${r2.reason}）`);
    console.log('');
  }
  if (uploadOnly && !r2.ready) {
    console.log('--upload-only ですが R2 が使えません。中止します。');
    process.exit(1);
  }

  const manifest = [];
  for (const question of questions) {
    for (const target of variantsOf(question)) {
      const { bounds, px, url } = requestFor(target);
      mkdirSync(dirname(target.localPath), { recursive: true });

      if (!wanted.has(question.id) || verifyOnly) {
        if (existsSync(target.localPath)) manifest.push(entryFor(target, px, url));
        continue;
      }

      if (dryRun) {
        console.log(
          `${question.id.padEnd(16)} ${target.variant.padEnd(8)} ${String(target.areaKm2).padStart(6)} km²  ` +
            `一辺 ${bounds.sideKm.toFixed(0)} km  ${px}px`,
        );
        console.log(`  ${url}`);
        continue;
      }

      // 手元にある画像をそのまま R2 へ上げる。取得はやり直さない。
      if (uploadOnly) {
        if (!existsSync(target.localPath)) {
          console.log(`${target.key}  画像がありません。先に npm run fetch を走らせてください`);
          continue;
        }
        const buffer = readFileSync(target.localPath);
        await putObject(r2Config, process.env, {
          key: target.key,
          body: buffer,
          contentType: 'image/jpeg',
        });
        console.log(`${target.key.padEnd(26)} → ${(buffer.length / 1024).toFixed(0)} KB`);
        manifest.push(entryFor(target, px, url));
        continue;
      }

      if (existsSync(target.localPath) && !force) {
        console.log(`${target.key}  すでにあります（--force で取り直し）`);
        manifest.push(entryFor(target, px, url));
        continue;
      }

      const buffer = await fetchImage(url);
      writeFileSync(target.localPath, buffer);
      const size = jpegSize(buffer);
      console.log(
        `${target.key.padEnd(26)} ${String(target.areaKm2).padStart(6)} km²  ` +
          `${size.width}x${size.height}px  ${(buffer.length / 1024).toFixed(0)} KB`,
      );

      if (r2.ready) {
        await putObject(r2Config, process.env, {
          key: target.key,
          body: buffer,
          contentType: 'image/jpeg',
        });
      }

      manifest.push(entryFor(target, px, url));
    }
  }

  if (dryRun) return;

  writeManifest(manifest);

  if (writeQuestions) writeQuestionImages(manifest);

  if (r2.ready || verifyOnly) await verifyPublicAccess(manifest.map((entry) => entry.key));
}

/**
 * data/questions.js の image ブロックを実測値で書き直す。
 * width も date も credit も、人が手で写すと必ずどこかでずれる。
 */
function writeQuestionImages(entries) {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const path = inRoot('data/questions.js');
  let text = readFileSync(path, 'utf8');
  let replaced = 0;

  for (const question of loadQuestions().filter((q) => q.adopted !== false)) {
    const [patch, context] = variantsOf(question);
    const patchEntry = byKey.get(patch.key);
    const contextEntry = byKey.get(context.key);
    if (!patchEntry || !contextEntry) {
      console.log(`  ! ${question.id} の画像が manifest にありません`);
      continue;
    }

    const block =
      `image: { key: ${q(patch.key)}, width: ${patchEntry.width}, ` +
      `date: ${q(patchEntry.date)}, credit: ${q(patchEntry.credit)}, ` +
      `context: { key: ${q(context.key)}, width: ${contextEntry.width}, areaKm2: ${context.areaKm2} } }`;

    const next = replaceImageBlock(text, question.id, block);
    if (next === null) {
      console.log(`  ! ${question.id} の image ブロックが見つかりません`);
      continue;
    }
    text = next;
    replaced++;
  }

  writeFileSync(path, text);
  console.log(`data/questions.js の image を ${replaced} 件書き直しました`);
}

/** 該当 id のブロックの中の image を、括弧の対応を数えて置き換える。 */
function replaceImageBlock(text, id, block) {
  const idAt = text.indexOf(`id: '${id}',`);
  if (idAt < 0) return null;
  const start = text.indexOf('image: {', idAt);
  if (start < 0) return null;

  let depth = 0;
  let end = -1;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return null;
  return text.slice(0, start) + block + text.slice(end);
}

function q(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function entryFor(target, px, url) {
  const buffer = readFileSync(target.localPath);
  const size = jpegSize(buffer);
  return {
    id: target.question.id,
    variant: target.variant,
    key: target.key,
    width: size.width,
    height: size.height,
    bytes: statSync(target.localPath).size,
    areaKm2: target.areaKm2,
    lat: target.question.answer.lat,
    lon: target.question.answer.lon,
    date: source.time ?? '',
    source: source.key,
    sensor: source.sensor,
    meters: source.metersPerPixel,
    license: source.license,
    credit: source.credit,
    requestedPx: px,
    url,
  };
}

function writeManifest(entries) {
  entries.sort((a, b) => a.key.localeCompare(b.key));
  const totalKb = entries.reduce((sum, e) => sum + e.bytes, 0) / 1024;
  const lines = [
    '// 自動生成。手で編集しない。`npm run fetch` で作り直す。',
    '// R2 に上げた問題画像の一覧。q/ が出題する枠、ctx/ が結果画面の広域。',
    '// 出典はここに記録し、結果画面と CREDITS.md の両方に出す（仕様 §12）。',
    'window.EARTH_PATCH_MANIFEST = {',
    ...entries.map((entry) => `  ${JSON.stringify(entry.key)}: ${JSON.stringify(entry)},`),
    '};',
    '',
  ];
  writeFileSync(inRoot(pipeline.output.manifestPath), lines.join('\n'));
  console.log(`\n${pipeline.output.manifestPath} を書きました  ${entries.length} 枚  合計 ${totalKb.toFixed(0)} KB`);
}

/**
 * 上げたものが公開URLから実際に読めるか、1件ずつ確かめる。
 * バケットへの書き込みが成功していても、公開設定が入っていなければサイトからは見えない。
 * ここを見ないと、デプロイして初めて画像だけ出ないことに気づく羽目になる。
 */
async function verifyPublicAccess(keys) {
  if (!r2Config.publicBase) {
    console.log('\n公開URLが設定されていないので、読み取りの確認は飛ばします');
    return;
  }
  console.log(`\n公開URLの確認 ${keys.length} 枚  ${r2Config.publicBase}`);

  const broken = [];
  for (const key of keys) {
    try {
      const response = await fetch(`${r2Config.publicBase}${key}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(30000),
      });
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !type.startsWith('image/')) broken.push(`${key} (HTTP ${response.status} ${type})`);
    } catch (error) {
      broken.push(`${key} (${error.message})`);
    }
  }

  if (!broken.length) {
    console.log(`  ${keys.length} 枚すべて読めました`);
    return;
  }

  console.log(`  読めないものが ${broken.length} 枚あります`);
  for (const item of broken.slice(0, 10)) console.log(`   x ${item}`);
  console.log('  バケットには入っているのに公開URLから読めない場合、原因はほぼ次のどちらかです。');
  console.log('   - そのバケットの公開アクセス（r2.dev サブドメイン）が有効になっていない');
  console.log('   - 公開URLが別のバケットのものになっている（サブドメインはバケットごとに別）');
  console.log('  Cloudflare の R2 → 該当バケット → 設定 → パブリックアクセス で確認してください。');
  process.exitCode = 1;
}

await main();
