// PNG デコーダ。node:zlib だけで済むので外部ライブラリを入れない。
// 弁別性の計算に画素値が要るのは取得スクリプト側だけなので、
// 非インタレース・ビット深度8 の PNG に限って対応する。
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * @returns {{width:number,height:number,rgb:Uint8Array}} rgb は width*height*3。
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('PNG ではありません');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  const idat = [];

  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8) throw new Error(`ビット深度 ${bitDepth} は未対応（8 のみ）`);
  if (interlace !== 0) throw new Error('インタレース PNG は未対応');
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (!channels) throw new Error(`カラータイプ ${colorType} は未対応`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);

  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const rowStart = y * stride;
    const prevStart = rowStart - stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[src++];
      const a = x >= bpp ? pixels[rowStart + x - bpp] : 0;
      const b = y > 0 ? pixels[prevStart + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[prevStart + x - bpp] : 0;
      let out;
      switch (filter) {
        case 0: out = value; break;
        case 1: out = value + a; break;
        case 2: out = value + b; break;
        case 3: out = value + ((a + b) >> 1); break;
        case 4: out = value + paeth(a, b, c); break;
        default: throw new Error(`未知のフィルタ ${filter}`);
      }
      pixels[rowStart + x] = out & 0xff;
    }
  }

  return { width, height, rgb: toRgb(pixels, width, height, colorType, palette) };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function toRgb(pixels, width, height, colorType, palette) {
  const count = width * height;
  const out = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++) {
    let r;
    let g;
    let b;
    switch (colorType) {
      case 0: r = g = b = pixels[i]; break;
      case 4: r = g = b = pixels[i * 2]; break;
      case 2: r = pixels[i * 3]; g = pixels[i * 3 + 1]; b = pixels[i * 3 + 2]; break;
      case 6: r = pixels[i * 4]; g = pixels[i * 4 + 1]; b = pixels[i * 4 + 2]; break;
      case 3: {
        const idx = pixels[i] * 3;
        r = palette[idx]; g = palette[idx + 1]; b = palette[idx + 2];
        break;
      }
      default: r = g = b = 0;
    }
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}
