// Cloudflare R2 への PUT。S3 互換 API なので SigV4 を自前で組む（外部ライブラリを入れない）。
// 書き込みは API トークンのみ、読み取りは公開（仕様 §4.2）。
import { createHash, createHmac } from 'node:crypto';

const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

function amzDate(now) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

/**
 * アカウントIDの表記ゆれを吸収する。
 * Cloudflare の画面からは S3 API のエンドポイントごとコピーされることが多いので、
 * https:// や .r2.cloudflarestorage.com が付いていても受け付ける。
 */
export function normalizeAccountId(value) {
  return String(value ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\.r2\.cloudflarestorage\.com.*$/i, '')
    .replace(/\/.*$/, '');
}

/**
 * アカウントIDとバケット名は、公開リポジトリに出さずに済むよう環境変数から受け取る。
 * .env.local は手元の上書き用なので、config/pipeline.json より環境変数を優先する。
 */
export function resolveR2(r2Cfg, env) {
  const publicBase = (env.R2_PUBLIC_BASE || r2Cfg.publicBase || '').trim();
  return {
    ...r2Cfg,
    accountId: normalizeAccountId(env.R2_ACCOUNT_ID || r2Cfg.accountId),
    bucket: (env.R2_BUCKET || r2Cfg.bucket || '').trim().replace(/^\/+|\/+$/g, ''),
    publicBase: publicBase && !publicBase.endsWith('/') ? `${publicBase}/` : publicBase,
  };
}

/** 設定と環境変数が揃っているか。揃っていなければ理由を返す。 */
export function r2Status(r2Cfg, env) {
  if (!r2Cfg.enabled) return { ready: false, reason: 'config/pipeline.json の r2.enabled が false' };
  const missing = [];
  if (!r2Cfg.accountId) missing.push('R2_ACCOUNT_ID');
  if (!r2Cfg.bucket) missing.push('R2_BUCKET');
  if (!env[r2Cfg.credentialEnv.id]) missing.push(r2Cfg.credentialEnv.id);
  if (!env[r2Cfg.credentialEnv.secret]) missing.push(r2Cfg.credentialEnv.secret);
  if (missing.length) {
    return { ready: false, reason: `未設定: ${missing.join(', ')}（.env.local を用意してください）` };
  }
  // 値そのものは出さずに形だけ見る。アカウントIDは32桁の16進。
  if (!/^[0-9a-f]{32}$/i.test(r2Cfg.accountId)) {
    return {
      ready: false,
      reason:
        `R2_ACCOUNT_ID の形が違います（${r2Cfg.accountId.length}文字。32桁の16進が入るはずです）。` +
        'S3 API のエンドポイント https://<ここ>.r2.cloudflarestorage.com の <ここ> の部分です。',
    };
  }
  return { ready: true, reason: '' };
}

/** SigV4 で署名した1リクエストを組み立てる。PUT も GET も同じ手順。 */
export function signRequest(r2Cfg, env, { method, key = '', query = '', body = '', contentType, now = new Date() }) {
  const accessKeyId = env[r2Cfg.credentialEnv.id];
  const secretAccessKey = env[r2Cfg.credentialEnv.secret];
  const host = `${r2Cfg.accountId}.r2.cloudflarestorage.com`;
  const encodedKey = key ? `/${key.split('/').map(encodeURIComponent).join('/')}` : '';
  const path = `/${r2Cfg.bucket}${encodedKey}`;

  const stamp = amzDate(now);
  const day = stamp.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const scope = `${day}/${r2Cfg.region}/${SERVICE}/aws4_request`;

  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': stamp };
  if (contentType) headers['content-type'] = contentType;

  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');

  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonicalRequest)].join('\n');

  let signingKey = hmac(`AWS4${secretAccessKey}`, day);
  signingKey = hmac(signingKey, r2Cfg.region);
  signingKey = hmac(signingKey, SERVICE);
  signingKey = hmac(signingKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    url: `https://${host}${path}${query ? `?${query}` : ''}`,
    method,
    headers: {
      ...headers,
      Authorization:
        `${ALGORITHM} Credential=${accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: method === 'PUT' ? body : undefined,
  };
}

export function putObjectRequest(r2Cfg, env, { key, body, contentType, now = new Date() }) {
  return signRequest(r2Cfg, env, { method: 'PUT', key, body, contentType, now });
}

export async function putObject(r2Cfg, env, options) {
  const request = putObjectRequest(r2Cfg, env, options);
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  if (!response.ok) {
    throw new Error(`R2 への PUT が失敗しました HTTP ${response.status}: ${await response.text()}`);
  }
  return `${r2Cfg.publicBase}${options.key}`;
}

/** バケットに何が入っているかを確かめる。アップロードの検証用。 */
export async function listObjects(r2Cfg, env, { prefix = '', maxKeys = 1000 } = {}) {
  const query = `list-type=2&max-keys=${maxKeys}${prefix ? `&prefix=${encodeURIComponent(prefix)}` : ''}`;
  // クエリはコード順に並べる必要がある
  const sorted = query.split('&').sort().join('&');
  const request = signRequest(r2Cfg, env, { method: 'GET', query: sorted });
  const response = await fetch(request.url, { method: 'GET', headers: request.headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`R2 の一覧取得が失敗しました HTTP ${response.status}: ${text}`);
  return [...text.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
}
