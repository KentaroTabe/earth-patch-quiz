// PNG エンコーダ。node:zlib だけで済むので外部ライブラリを入れない。
// 目視用の一覧を1枚の画像にまとめるために使う（contact-sheet.mjs）。
// ブラウザで何十枚も並べると読み込みが間に合わないことがあり、
// 画像として書き出したほうが確実に見られる。
import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * RGB の画素配列を PNG にする。
 * @param {{width:number,height:number,rgb:Uint8Array}} image
 */
export function encodePng(image) {
  const { width, height, rgb } = image;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // カラータイプ 2 = RGB
  ihdr[10] = 0; // 圧縮方式
  ihdr[11] = 0; // フィルタ方式
  ihdr[12] = 0; // インタレースなし

  // 各行の先頭にフィルタ種別のバイトを置く。0 = フィルタなし。
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 単色で塗りつぶした画素配列を作る。 */
export function blankImage(width, height, [r, g, b]) {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }
  return { width, height, rgb };
}

/** src を dst の (x, y) に、最近傍で size×size に縮めて貼る。 */
export function drawScaled(dst, src, x, y, size) {
  for (let dy = 0; dy < size; dy++) {
    const sy = Math.min(src.height - 1, Math.floor((dy / size) * src.height));
    const targetY = y + dy;
    if (targetY < 0 || targetY >= dst.height) continue;
    for (let dx = 0; dx < size; dx++) {
      const sx = Math.min(src.width - 1, Math.floor((dx / size) * src.width));
      const targetX = x + dx;
      if (targetX < 0 || targetX >= dst.width) continue;
      const s = (sy * src.width + sx) * 3;
      const d = (targetY * dst.width + targetX) * 3;
      dst.rgb[d] = src.rgb[s];
      dst.rgb[d + 1] = src.rgb[s + 1];
      dst.rgb[d + 2] = src.rgb[s + 2];
    }
  }
}

/** 枠線を引く。採否や機械の判定を色で示すのに使う。 */
export function drawRect(dst, x, y, w, h, [r, g, b], thickness = 2) {
  for (let t = 0; t < thickness; t++) {
    for (let i = 0; i < w; i++) {
      for (const py of [y + t, y + h - 1 - t]) {
        if (py < 0 || py >= dst.height) continue;
        const px = x + i;
        if (px < 0 || px >= dst.width) continue;
        const d = (py * dst.width + px) * 3;
        dst.rgb[d] = r;
        dst.rgb[d + 1] = g;
        dst.rgb[d + 2] = b;
      }
    }
    for (let i = 0; i < h; i++) {
      for (const px of [x + t, x + w - 1 - t]) {
        if (px < 0 || px >= dst.width) continue;
        const py = y + i;
        if (py < 0 || py >= dst.height) continue;
        const d = (py * dst.width + px) * 3;
        dst.rgb[d] = r;
        dst.rgb[d + 1] = g;
        dst.rgb[d + 2] = b;
      }
    }
  }
}
