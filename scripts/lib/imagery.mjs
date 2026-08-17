// 画像の取得。WMS の GetMap で任意の枠を1リクエストで取るので、タイル合成をしない。
import { frameBounds } from './geo.mjs';
import { decodePng } from './png.mjs';

const JPEG_MAGIC = [0xff, 0xd8];
const PNG_MAGIC = [0x89, 0x50];

export function buildRequest(source, { layerKey = 'truecolor', bounds, px, format = 'image/jpeg' }) {
  if (source.protocol !== 'wms') {
    throw new Error(`protocol "${source.protocol}" の取得は未実装です（config/sources.json）`);
  }
  const layer = source.layers[layerKey];
  if (!layer) throw new Error(`ソース ${source.key} に layer "${layerKey}" がありません`);
  if (px > source.maxRequestPx) {
    throw new Error(`${px}px は ${source.key} の上限 ${source.maxRequestPx}px を超えます`);
  }

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: source.wmsVersion,
    REQUEST: 'GetMap',
    LAYERS: layer,
    SRS: source.srs,
    // WMS 1.1.1 / EPSG:4326 の BBOX は minx,miny,maxx,maxy（経度,緯度）の順。
    BBOX: [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat]
      .map((v) => v.toFixed(6))
      .join(','),
    WIDTH: String(px),
    HEIGHT: String(px),
    FORMAT: format,
  });
  if (source.time) params.set('TIME', source.time);

  return `${source.endpoint}?${params}`;
}

function looksLike(buffer, magic) {
  return magic.every((byte, i) => buffer[i] === byte);
}

export async function fetchImage(url, { retries = 3, timeoutMs = 90000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** attempt);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${buffer.subarray(0, 300).toString('utf8')}`);
      }
      if (!looksLike(buffer, JPEG_MAGIC) && !looksLike(buffer, PNG_MAGIC)) {
        throw new Error(`画像が返りませんでした: ${buffer.subarray(0, 300).toString('utf8')}`);
      }
      return buffer;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** 枠を PNG で取り、画素配列にして返す。弁別性の計算と下見に使う。 */
export async function fetchPixels(source, { lat, lon, areaKm2, px, layerKey }, frameCfg) {
  const bounds = frameBounds(lat, lon, areaKm2, frameCfg);
  const url = buildRequest(source, { layerKey, bounds, px, format: 'image/png' });
  const buffer = await fetchImage(url);
  return decodePng(buffer);
}

/** 出題用の本番画像を JPEG で取る。 */
export async function fetchTile(source, { lat, lon, areaKm2, px }, frameCfg) {
  const bounds = frameBounds(lat, lon, areaKm2, frameCfg);
  const url = buildRequest(source, { layerKey: 'truecolor', bounds, px, format: 'image/jpeg' });
  return { buffer: await fetchImage(url), url, bounds };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
