// 設定ファイルの読み込み。スクリプトは数値を直接持たない。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

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
