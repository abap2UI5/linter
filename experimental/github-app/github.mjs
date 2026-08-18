/*
 * The GitHub half of the spike: webhook signature checking, App
 * authentication, and a thin REST wrapper. No dependencies - node:crypto
 * signs the JWT, global fetch does the rest. That is deliberate: the linter
 * itself has no runtime dependencies, and a service that reads other
 * people's source code is the wrong place to grow a dependency tree.
 */
import { createHmac, createSign, timingSafeEqual } from 'node:crypto';

const API = 'https://api.github.com';

/*
 * Every webhook delivery is signed with the secret configured on the App.
 * An unsigned or wrongly-signed body is somebody ELSE talking to the
 * endpoint - the URL is public, so this is the only thing standing between
 * the service and an attacker who can name any repository they like.
 *
 * Compared over the RAW body: re-serializing parsed JSON changes bytes
 * (key order, whitespace, unicode escapes) and the digest with them.
 */
export function verifySignature(secret, rawBody, header) {
  if (!secret || !header) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  // timingSafeEqual throws on a length mismatch, so that is checked first -
  // the length of a hex digest is not a secret
  return a.length === b.length && timingSafeEqual(a, b);
}

/*
 * A short-lived RS256 JWT signed with the App's private key. It authenticates
 * the APP - it can ask which installations exist and mint tokens for them,
 * but it cannot read a repository. `iat` is backdated a minute because GitHub
 * rejects a token whose clock ran ahead of theirs, and `exp` stays well
 * inside the 10-minute maximum.
 */
export function appJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iat: now - 60, exp: now + 540, iss: String(appId) })}`;
  const sig = createSign('RSA-SHA256').update(data).sign(privateKey).toString('base64url');
  return `${data}.${sig}`;
}

/*
 * The token that can actually read a repository. Scoped to ONE installation
 * and expires after an hour - it is minted per delivery and never stored,
 * which is what keeps a crashed process from leaving a usable credential
 * behind.
 */
export async function installationToken(appId, privateKey, installationId) {
  const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${appJwt(appId, privateKey)}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'abap2ui5-linter-app',
    },
  });
  if (!res.ok) throw new Error(`installation token: ${res.status} ${await res.text()}`);
  return (await res.json()).token;
}

/** One REST call. Throws on anything that is not 2xx, with the body in the
 *  message - a silent failure in a service nobody is watching is worse than
 *  a crash that shows up in the log. */
export async function api(token, method, path, body) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: {
      authorization: `token ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'abap2ui5-linter-app',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** A file's contents at a given ref, as text. `Accept: raw` skips the base64
 *  envelope; a file over 1 MB needs the blob API instead and returns null
 *  here rather than a JSON document pretending to be ABAP. */
export async function fileAt(token, owner, repo, path, ref) {
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`,
    {
      headers: {
        authorization: `token ${token}`,
        accept: 'application/vnd.github.raw',
        'user-agent': 'abap2ui5-linter-app',
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`contents ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text.startsWith('{"sha"') ? null : text;
}

/** Every page of a paginated collection, followed by the Link header rather
 *  than by guessing when to stop. */
export async function paginate(token, path) {
  const out = [];
  let url = `${API}${path}${path.includes('?') ? '&' : '?'}per_page=100`;
  while (url) {
    const res = await fetch(url, {
      headers: {
        authorization: `token ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'abap2ui5-linter-app',
      },
    });
    if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${await res.text()}`);
    out.push(...(await res.json()));
    url = (res.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/)?.[1] || null;
  }
  return out;
}
