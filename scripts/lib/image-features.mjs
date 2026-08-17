// 弁別性の特徴量（仕様 §5.3）。
// 測るのは「情報量」ではなく「他のどことも違うか」。§5.1 を読んでから触ること。

/** 決定的な擬似乱数。k-means の初期値を実行ごとに変えないため。 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 走査線状の欠測の割合。
 *
 * Landsat の年次モザイクには、帯や斑点の形で欠測が入ることがある。輝度の平均や
 * 分散では落ちないが、「上下2行とは互いに似ているのに、その行だけ大きく外れる」
 * という形をしているので拾える。自然の地形は上下と相関するのでこの形になりにくい。
 *
 * 縮小すると縞が平均化されて消えるので、下見より高い解像度で測る必要がある
 * （quality.scanlinePx）。しきい値は既知の採用・不採用14枚で較正した。
 * 重症のもの（マナウス3.6% / レンソイス3.7% / ナトロン3.9%）だけが 2% を超え、
 * 採用したものは最大でも1.3%だった。**軽症は拾えない。目視は省けない。**
 */
export function scanlineShare(image) {
  const { width, height, rgb } = image;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = luma(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  }
  let hits = 0;
  for (let y = 2; y < height - 2; y++) {
    for (let x = 0; x < width; x++) {
      const here = gray[y * width + x];
      const above = gray[(y - 2) * width + x];
      const below = gray[(y + 2) * width + x];
      if (Math.abs(above - below) < 12 && Math.abs(here - (above + below) / 2) > 35) hits++;
    }
  }
  return hits / (width * height);
}

/** 下見用。雲だらけ・欠測だらけの枠を落とす（仕様 §5.4 の isCloudOrVoid）。 */
export function inspectQuality(image, qualityCfg) {
  const count = image.width * image.height;
  let bad = 0;
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < count; i++) {
    const value = luma(image.rgb[i * 3], image.rgb[i * 3 + 1], image.rgb[i * 3 + 2]);
    if (value < qualityCfg.voidLumaBelow || value > qualityCfg.cloudLumaAbove) bad++;
    sum += value;
    sumSq += value * value;
  }

  const mean = sum / count;
  const stdDev = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
  const badShare = bad / count;

  const reasons = [];
  if (badShare > qualityCfg.maxBadPixelShare) reasons.push(`白飛び・黒潰れ ${(badShare * 100).toFixed(0)}%`);
  if (stdDev < qualityCfg.minStdDev) reasons.push(`のっぺり（分散 ${stdDev.toFixed(1)}）`);

  return { mean, stdDev, badShare, reasons, ok: reasons.length === 0 };
}

/**
 * 水域率と、その 4×4 ばらつき。全面海・全面陸を落とすのが分散の役目。
 *
 * 判定の仕方が2通りあるのは、取得元によって画素の意味が違うため。
 *  - 反射率がそのまま入っている場合: NDWI =（緑 − 近赤外）/（緑 + 近赤外）。仕様 §5.3 のとおり。
 *  - 表示用に伸張された合成画像の場合: NDWI は使えない。伸張の分だけ値が歪み、
 *    砂漠が水域と判定される。RGB だけの経験則（青が赤より強く、かつ暗い）に切り替える。
 * どちらを使うかは config/sources.json の reflectanceLinear で決める。
 */
export function waterFeatures(truecolor, nirImage, distinctCfg, useNdwi) {
  const { width, height } = truecolor;
  const n = distinctCfg.waterGridN;
  const cellCounts = new Array(n * n).fill(0);
  const cellWater = new Array(n * n).fill(0);
  let water = 0;

  const rgbCfg = distinctCfg.waterRgb;
  for (let y = 0; y < height; y++) {
    const cellY = Math.min(n - 1, Math.floor((y / height) * n));
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let isWater;
      if (useNdwi && nirImage) {
        const green = truecolor.rgb[i * 3 + 1];
        const nir = nirImage.rgb[i * 3 + 1];
        const denom = green + nir;
        isWater = denom !== 0 && (green - nir) / denom > distinctCfg.ndwiThreshold;
      } else {
        const r = truecolor.rgb[i * 3];
        const g = truecolor.rgb[i * 3 + 1];
        const b = truecolor.rgb[i * 3 + 2];
        isWater = b > r + rgbCfg.blueOverRedMargin && luma(r, g, b) < rgbCfg.maxLuma;
      }
      const cell = cellY * n + Math.min(n - 1, Math.floor((x / width) * n));
      cellCounts[cell]++;
      if (isWater) {
        water++;
        cellWater[cell]++;
      }
    }
  }

  const total = width * height;
  const shares = cellWater.map((v, i) => (cellCounts[i] ? v / cellCounts[i] : 0));
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  const variance = shares.reduce((a, b) => a + (b - mean) ** 2, 0) / shares.length;

  return { waterShare: water / total, waterVariance: variance };
}

/** k-means(k=6) の有効クラスタ数。地被の多様さの代理。 */
export function colorClusterCount(image, distinctCfg) {
  const { k, iterations, minClusterShare, seed } = distinctCfg.kmeans;
  const count = image.width * image.height;
  const random = mulberry32(seed);

  // k-means++ 相当の初期化。決定的に選ぶ。
  const centers = [];
  const firstIndex = Math.floor(random() * count);
  centers.push(pixelAt(image, firstIndex));
  while (centers.length < k) {
    let best = null;
    let bestDist = -1;
    for (let s = 0; s < 64; s++) {
      const index = Math.floor(random() * count);
      const px = pixelAt(image, index);
      let nearest = Infinity;
      for (const c of centers) nearest = Math.min(nearest, squaredDistance(px, c));
      if (nearest > bestDist) {
        bestDist = nearest;
        best = px;
      }
    }
    centers.push(best);
  }

  const assign = new Int32Array(count);
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < count; i++) {
      const px = pixelAt(image, i);
      let bestIndex = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = squaredDistance(px, centers[c]);
        if (d < bestDist) {
          bestDist = d;
          bestIndex = c;
        }
      }
      assign[i] = bestIndex;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < count; i++) {
      const s = sums[assign[i]];
      s[0] += image.rgb[i * 3];
      s[1] += image.rgb[i * 3 + 1];
      s[2] += image.rgb[i * 3 + 2];
      s[3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3] === 0) continue;
      centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
  }

  const shares = new Array(centers.length).fill(0);
  for (let i = 0; i < count; i++) shares[assign[i]]++;
  return shares.filter((v) => v / count >= minClusterShare).length;
}

/** Sobel の勾配強度。直線性とハッシュの両方で使う。 */
export function gradientMagnitude(image) {
  const { width, height, rgb } = image;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = luma(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  }
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] +
        gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      out[i] = Math.hypot(gx, gy);
    }
  }
  return out;
}

/** Hough 変換の最大投票値。人工物（直線）の存在の代理。 */
export function linearity(image, distinctCfg) {
  const { angleSteps, edgeThreshold } = distinctCfg.hough;
  const { width, height } = image;
  const magnitude = gradientMagnitude(image);

  const diagonal = Math.ceil(Math.hypot(width, height));
  const rhoCount = diagonal * 2;
  const accumulator = new Int32Array(angleSteps * rhoCount);
  const sin = new Float32Array(angleSteps);
  const cos = new Float32Array(angleSteps);
  for (let t = 0; t < angleSteps; t++) {
    const theta = (Math.PI * t) / angleSteps;
    sin[t] = Math.sin(theta);
    cos[t] = Math.cos(theta);
  }

  let edges = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (magnitude[y * width + x] < edgeThreshold) continue;
      edges++;
      for (let t = 0; t < angleSteps; t++) {
        const rho = Math.round(x * cos[t] + y * sin[t]) + diagonal;
        accumulator[t * rhoCount + rho]++;
      }
    }
  }

  let peak = 0;
  for (let i = 0; i < accumulator.length; i++) if (accumulator[i] > peak) peak = accumulator[i];
  // 画像の対角長で割り、枠のサイズによらない値にする。
  return { peak: peak / diagonal, edgeShare: edges / (width * height) };
}

/**
 * 64次元ハッシュ。4×4 の各セルから R/G/B の平均とエッジ密度をとる。
 * 最近傍距離（他と違うか）を測るためだけに使う。
 */
export function perceptualHash(image, distinctCfg) {
  const n = distinctCfg.hash.gridN;
  const { width, height } = image;
  const magnitude = gradientMagnitude(image);
  const cells = new Array(n * n).fill(null).map(() => [0, 0, 0, 0, 0]);

  for (let y = 0; y < height; y++) {
    const cellY = Math.min(n - 1, Math.floor((y / height) * n));
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const cell = cells[cellY * n + Math.min(n - 1, Math.floor((x / width) * n))];
      cell[0] += image.rgb[i * 3];
      cell[1] += image.rgb[i * 3 + 1];
      cell[2] += image.rgb[i * 3 + 2];
      cell[3] += Math.min(255, magnitude[i]);
      cell[4]++;
    }
  }

  const vector = [];
  for (const cell of cells) {
    const count = cell[4] || 1;
    vector.push(cell[0] / count / 255, cell[1] / count / 255, cell[2] / count / 255, cell[3] / count / 255);
  }
  return vector;
}

/** 全候補の中での kNN 距離。ここが弁別性の主役（重み 0.45）。 */
export function nearestNeighborDistances(hashes, distinctCfg) {
  const k = distinctCfg.knn.k;
  return hashes.map((self, i) => {
    const distances = [];
    for (let j = 0; j < hashes.length; j++) {
      if (i === j) continue;
      distances.push(euclidean(self, hashes[j]));
    }
    distances.sort((a, b) => a - b);
    const take = distances.slice(0, Math.max(1, Math.min(k, distances.length)));
    return take.reduce((a, b) => a + b, 0) / take.length;
  });
}

/** 分位で切ってから 0〜1 に伸ばす。外れ値1つで全体が潰れるのを防ぐ。 */
export function normalizeSeries(values, normalizeCfg) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return values;
  const low = sorted[Math.floor(normalizeCfg.low * (sorted.length - 1))];
  const high = sorted[Math.floor(normalizeCfg.high * (sorted.length - 1))];
  const span = high - low;
  if (span <= 0) return values.map(() => 0.5);
  return values.map((v) => Math.max(0, Math.min(1, (v - low) / span)));
}

export function combineDistinct(normalized, weights) {
  return (
    weights.nn * normalized.nn +
    weights.wv * normalized.wv +
    weights.c * normalized.c +
    weights.l * normalized.l
  );
}

function pixelAt(image, index) {
  return [image.rgb[index * 3], image.rgb[index * 3 + 1], image.rgb[index * 3 + 2]];
}

function squaredDistance(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}
