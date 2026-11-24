import type { Env } from '../types.js';
import { kvGetJson, kvSetJson } from './cache.js';

export interface VerifiedGoogleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

interface GoogleJwk {
  kid: string;
  n: string;
  e: string;
  alg?: string;
}

function decodeB64UrlJson<T>(segment: string): T {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((segment.length + 3) % 4);
  const json = atob(padded);
  return JSON.parse(json) as T;
}

function decodeB64UrlBytes(segment: string): Uint8Array {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((segment.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function fetchGoogleJwks(kv: KVNamespace | undefined): Promise<GoogleJwk[]> {
  const cached = await kvGetJson<{ keys: GoogleJwk[] }>(kv, 'google:jwks');
  if (cached?.keys?.length) return cached.keys;

  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error('Unable to fetch Google JWKS');
  const body = (await res.json()) as { keys: GoogleJwk[] };
  await kvSetJson(kv, 'google:jwks', body, 3600);
  return body.keys;
}

export async function verifyGoogleIdToken(
  idToken: string,
  env: Env
): Promise<VerifiedGoogleClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Google ID token');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeB64UrlJson<{ kid?: string; alg?: string }>(headerB64);
  const payload = decodeB64UrlJson<{
    iss?: string;
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    exp?: number;
  }>(payloadB64);

  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    throw new Error('Invalid Google token issuer');
  }
  const allowedAudiences = [env.GOOGLE_CLIENT_ID, env.GOOGLE_MOBILE_CLIENT_ID].filter(Boolean);
  if (allowedAudiences.length === 0 || !payload.aud || !allowedAudiences.includes(payload.aud)) {
    throw new Error('Google token audience mismatch or Google OAuth not configured');
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Google ID token expired');
  }
  if (!payload.sub || !payload.email) {
    throw new Error('Google ID token missing subject or email');
  }

  const keys = await fetchGoogleJwks(env.STRIDE_KV);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Matching Google signing key not found');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    decodeB64UrlBytes(sigB64) as BufferSource,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!ok) {
    throw new Error('Google ID token signature verification failed');
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: Boolean(payload.email_verified),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture,
  };
}
