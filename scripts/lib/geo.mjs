// 幾何。外部ライブラリを使わない（仕様 §4.3）。
// サイト側の assets/map.js にも同じ式が入っている。式を変えるときは両方直すこと。

const RAD = Math.PI / 180;

/** 経度差を -180〜180 に畳む。日付変更線をまたぐ計算で必ず通す（仕様 §8.2）。 */
export function normalizeLonDelta(deltaDeg) {
  return ((deltaDeg + 540) % 360) - 180;
}

/** 大圏距離（km）。 */
export function haversine(a, b, earthRadiusKm) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = normalizeLonDelta(b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 中心座標と面積から枠の緯度経度範囲を出す。
 * 地表で正方形になるようにするので、経度幅は緯度の余弦で割り増す。
 */
export function frameBounds(lat, lon, areaKm2, frameCfg) {
  const sideKm = Math.sqrt(areaKm2);
  const dLat = sideKm * frameCfg.degPerKmLat;
  // 極に近づくと 1/cos が発散するので下限を切る。
  const cos = Math.max(Math.cos(lat * RAD), 0.08);
  const dLon = dLat / cos;
  return {
    sideKm,
    minLat: lat - dLat / 2,
    maxLat: lat + dLat / 2,
    minLon: lon - dLon / 2,
    maxLon: lon + dLon / 2,
    dLat,
    dLon,
  };
}

/** 枠の一辺 km と m/px から、引き伸ばさずに済む画素数を出す（仕様 §5.4）。 */
export function nativePixels(sideKm, metersPerPixel, frameCfg) {
  const raw = Math.round((sideKm * 1000) / metersPerPixel);
  return Math.max(frameCfg.outputMinPx, Math.min(frameCfg.outputMaxPx, raw));
}

/** 多角形の符号付き面積（度²）。向きの判定にも使う。 */
export function signedRingArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

export function ringArea(ring) {
  return Math.abs(signedRingArea(ring));
}

/**
 * 交差数による内外判定（ray casting）。
 * 穴を持つ多角形にも使えるよう、全リングの交差数の偶奇で決める。
 */
export function pointInRings(lon, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Douglas-Peucker。閉じたリングは端点を固定したまま間引く。 */
export function simplifyRing(ring, toleranceDeg) {
  if (ring.length <= 4) return ring;
  const closed =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const open = closed ? ring.slice(0, -1) : ring.slice();
  const kept = douglasPeucker(open, toleranceDeg);
  if (kept.length < 3) return null;
  return closed ? [...kept, kept[0]] : kept;
}

function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + clamped * dx), p[1] - (a[1] + clamped * dy));
}

/** 度分表記。結果画面の「22.30S 68.90W」用。 */
export function formatCoord(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}${ns} ${Math.abs(lon).toFixed(2)}${ew}`;
}
