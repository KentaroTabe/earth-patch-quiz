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

/** 設定と環境変数が揃っているか。揃っていなければ理由を返す。 */
export function r2Status(r2Cfg, env) {
  if (!r2Cfg.enabled) return { ready: false, reason: 'config/pipeline.json の r2.enabled が false' };
  const missing = [];
  if (!r2Cfg.accountId) missing.push('accountId');
  if (!r2Cfg.bucket) missing.push('bucket');
  if (!env[r2Cfg.credentialEnv.id]) missing.push(r2Cfg.credentialEnv.id);
  if (!env[r2Cfg.credentialEnv.secret]) missing.push(r2Cfg.credentialEnv.secret);
  if (missing.length) return { ready: false, reason: `未設定: ${missing.join(', ')}` };
  return { ready: true, reason: '' };
}

export function putObjectRequest(r2Cfg, env, { key, body, contentType, now = new Date() }) {
  const accessKeyId = env[r2Cfg.credentialEnv.id];
  const secretAccessKey = env[r2Cfg.credentialEnv.secret];
  const host = `${r2Cfg.accountId}.r2.cloudflarestorage.com`;
  const path = `/${r2Cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

  const stamp = amzDate(now);
  const day = stamp.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const scope = `${day}/${r2Cfg.region}/${SERVICE}/aws4_request`;

  const headers = {
    host,
    'content-type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': stamp,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join('');

  const canonicalRequest = [
    'PUT',
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonicalRequest)].join('\n');

  let signingKey = hmac(`AWS4${secretAccessKey}`, day);
  signingKey = hmac(signingKey, r2Cfg.region);
  signingKey = hmac(signingKey, SERVICE);
  signingKey = hmac(signingKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    url: `https://${host}${path}`,
    method: 'PUT',
    headers: {
      ...headers,
      Authorization:
        `${ALGORITHM} Credential=${accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  };
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
  return request.url;
}
