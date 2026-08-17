// 設定ファイルの読み込み。スクリプトは数値を直接持たない。
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * .env.local を読んで process.env に入れる。
 * R2 のアクセスキーのような秘密情報をリポジトリに置かないための入り口。
 * .gitignore に入っているのでコミットされない。すでに環境変数がある場合はそちらを優先する。
 */
export function loadLocalEnv(fileName = '.env.local') {
  const path = join(ROOT, fileName);
  if (!existsSync(path)) return { loaded: false, path, keys: [] };

  const keys = [];
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    keys.push(key);
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return { loaded: true, path, keys };
}

function readJson(relativePath) {
  const text = readFileSync(join(ROOT, relativePath), 'utf8');
  return JSON.parse(text);
}

export function loadPipeline() {
  return readJson('config/pipeline.json');
}

export function loadSources() {
  return readJson('config/sources.json');
}

/** 既定のソース、または名前で指定したソースを返す。 */
export function resolveSource(name) {
  const cfg = loadSources();
  const key = name || cfg.default;
  const src = cfg.sources[key];
  if (!src) {
    const known = Object.keys(cfg.sources).join(', ');
    throw new Error(`画像ソース "${key}" は config/sources.json にありません。指定できるのは: ${known}`);
  }
  if (src.enabled === false) {
    throw new Error(`画像ソース "${key}" は未設定です（config/sources.json の enabled が false）。docs/IMAGERY.md を参照してください。`);
  }
  return { key, ...src };
}

export function inRoot(...parts) {
  return join(ROOT, ...parts);
}
