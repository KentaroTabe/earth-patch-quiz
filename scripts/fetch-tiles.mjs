// 問題画像を取得し、img/q/ に保存して img/manifest.js を書き出す（仕様 §6.3）。
// R2 が設定されていれば同時にアップロードする。
//
//   npm run fetch                  … まだ無いものだけ取得
//   npm run fetch -- --force       … 取り直す
//   npm run fetch -- --only=richat,fuji
//   npm run fetch -- --prune       … 不採用（adopted: false）の画像を消す
//   npm run fetch -- --upload-only … 手元の画像を取り直さずに R2 へ上げる
//   npm run fetch:dry              … 通信せず、叩く URL だけ出す
//
// 閲覧時にはタイルを取りに行かない（仕様 §14）。画像は事前にここで取り切る。
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync, rmSync } from 'node:fs';
import { loadPipeline, loadLocalEnv, resolveSource, inRoot } from './lib/config.mjs';
import { frameBounds, nativePixels } from './lib/geo.mjs';
import { buildRequest, fetchImage } from './lib/imagery.mjs';
import { jpegSize } from './lib/jpeg.mjs';
import { r2Status, resolveR2, putObject } from './lib/r2.mjs';

loadLocalEnv();
const pipeline = loadPipeline();
const r2Config = resolveR2(loadPipeline().r2, process.env);
const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const force = args.includes('--force');
const prune = args.includes('--prune');
const uploadOnly = args.includes('--upload-only');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;
const sourceArg = args.find((a) => a.startsWith('--source='));

const source = resolveSource(sourceArg?.slice('--source='.length));

function loadQuestions() {
  globalThis.window = {};
  new Function(readFileSync(inRoot('data/questions.js'), 'utf8'))();
  return globalThis.window.EARTH_PATCH_QUESTIONS;
}

function keyFor(question) {
  return question.image?.key ?? `${r2Config.prefix}${question.id}.jpg`;
}

function localPathFor(question) {
  return inRoot(pipeline.output.imageDir, `${question.id}.jpg`);
}

async function main() {
  const all = loadQuestions();

  if (prune) {
    let removed = 0;
    for (const question of all.filter((q) => q.adopted === false)) {
      const path = localPathFor(question);
      if (!existsSync(path)) continue;
      rmSync(path);
      console.log(`削除 ${question.id}  ${question.reject ?? ''}`);
      removed++;
    }
    console.log(`不採用の画像を ${removed} 件消しました\n`);
  }

  const questions = all.filter((q) => q.adopted !== false);
  const targets = questions.filter((q) => !only || only.has(q.id));

  console.log(`ソース: ${source.label}  ${source.metersPerPixel} m/px  ${source.license}`);
  if (source.requiresApproval) {
    console.log('  ※ このソースは利用条件の個別確認が要ります（仕様 §5.6 / §12）');
  }
  console.log(`対象 ${targets.length} 問${dryRun ? '（--dry: 通信しません）' : ''}\n`);

  mkdirSync(inRoot(pipeline.output.imageDir), { recursive: true });

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
    const bounds = frameBounds(
      question.answer.lat,
      question.answer.lon,
      question.frame.areaKm2,
      pipeline.frame,
    );
    const px = nativePixels(bounds.sideKm, source.metersPerPixel, pipeline.frame);
    const url = buildRequest(source, { layerKey: 'truecolor', bounds, px, format: 'image/jpeg' });
    const localPath = localPathFor(question);
    const key = keyFor(question);

    if (!targets.includes(question)) {
      if (existsSync(localPath)) {
        manifest.push(entryFor(question, localPath, key, px, url));
      }
      continue;
    }

    if (dryRun) {
      console.log(`${question.id}  ${question.frame.areaKm2} km²  一辺 ${bounds.sideKm.toFixed(1)} km  ${px}px`);
      console.log(`  ${url}`);
      continue;
    }

    // 手元にある画像をそのまま R2 へ上げる。取得はやり直さない。
    if (uploadOnly) {
      if (!existsSync(localPath)) {
        console.log(`${question.id}  画像がありません。先に npm run fetch を走らせてください`);
        continue;
      }
      if (!r2.ready) continue;
      const buffer = readFileSync(localPath);
      await putObject(r2Config, process.env, { key, body: buffer, contentType: 'image/jpeg' });
      console.log(`${question.id.padEnd(16)} → ${r2Config.publicBase}${key}  ${(buffer.length / 1024).toFixed(0)} KB`);
      manifest.push(entryFor(question, localPath, key, px, url));
      continue;
    }

    if (existsSync(localPath) && !force) {
      console.log(`${question.id}  すでにあります（--force で取り直し）`);
      manifest.push(entryFor(question, localPath, key, px, url));
      continue;
    }

    const buffer = await fetchImage(url);
    writeFileSync(localPath, buffer);
    const size = jpegSize(buffer);
    console.log(
      `${question.id.padEnd(16)} ${String(question.frame.areaKm2).padStart(5)} km²  ` +
        `${size.width}x${size.height}px  ${(buffer.length / 1024).toFixed(0)} KB`,
    );

    if (r2.ready) {
      const publicUrl = await putObject(r2Config, process.env, {
        key,
        body: buffer,
        contentType: 'image/jpeg',
      });
      console.log(`  → R2 ${publicUrl}`);
    }

    manifest.push(entryFor(question, localPath, key, px, url));
  }

  if (dryRun) return;

  writeManifest(manifest);

  if (r2.ready && manifest.length) await verifyPublicAccess(manifest[0].key);
}

/**
 * 上げたものが公開URLから実際に読めるか確かめる。
 * バケットへの書き込みが成功していても、公開設定が入っていなければサイトからは見えない。
 * ここを見ないと、デプロイして初めて画像だけ出ないことに気づく羽目になる。
 */
async function verifyPublicAccess(key) {
  if (!r2Config.publicBase) {
    console.log('\n公開URLが設定されていないので、読み取りの確認は飛ばします');
    return;
  }
  const url = `${r2Config.publicBase}${key}`;
  console.log(`\n公開URLの確認: ${url}`);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const type = response.headers.get('content-type') ?? '';
    if (response.ok && type.startsWith('image/')) {
      console.log(`  読めました（HTTP ${response.status} ${type}）`);
      return;
    }
    console.log(`  読めません（HTTP ${response.status} ${type}）`);
    console.log('  バケットには入っているのに公開URLから読めない場合、原因はほぼ次のどちらかです。');
    console.log('   - そのバケットの公開アクセス（r2.dev サブドメイン）が有効になっていない');
    console.log('   - 公開URLが別のバケットのものになっている');
    console.log('  Cloudflare の R2 → 該当バケット → 設定 → パブリックアクセス で確認してください。');
    process.exitCode = 1;
  } catch (error) {
    console.log(`  確認できませんでした: ${error.message}`);
    process.exitCode = 1;
  }
}

function entryFor(question, localPath, key, px, url) {
  const buffer = readFileSync(localPath);
  const size = jpegSize(buffer);
  return {
    id: question.id,
    key,
    width: size.width,
    height: size.height,
    bytes: statSync(localPath).size,
    areaKm2: question.frame.areaKm2,
    lat: question.answer.lat,
    lon: question.answer.lon,
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
  entries.sort((a, b) => a.id.localeCompare(b.id));
  const totalKb = entries.reduce((sum, e) => sum + e.bytes, 0) / 1024;
  const lines = [
    '// 自動生成。手で編集しない。`npm run fetch` で作り直す。',
    '// R2 に上げた（またはリポジトリに同梱した）問題画像の一覧。',
    '// 出典はここに記録し、結果画面と CREDITS.md の両方に出す（仕様 §12）。',
    'window.EARTH_PATCH_MANIFEST = {',
    ...entries.map((entry) => `  ${JSON.stringify(entry.key)}: ${JSON.stringify(entry)},`),
    '};',
    '',
  ];
  writeFileSync(inRoot(pipeline.output.manifestPath), lines.join('\n'));
  console.log(`\n${pipeline.output.manifestPath} を書きました  ${entries.length} 件  画像合計 ${totalKb.toFixed(0)} KB`);
}

await main();
