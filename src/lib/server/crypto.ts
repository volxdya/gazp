/** Криптография на Web Crypto: работает и в route handlers, и в proxy. */

import type { Role } from '../roles';
export type { Role } from '../roles';
export { can, ROLE_LABEL } from '../roles';

export interface Session {
  sub: string;
  role: Role;
  name: string;
  exp: number;
}

export const SESSION_COOKIE = 'tw_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

const enc = new TextEncoder();
const secret = () => process.env.SESSION_SECRET || 'dev-only-secret-change-me-in-production-0f3c9a';

const b64u = (bytes: ArrayBuffer | Uint8Array) => {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function hmacKey() {
  return crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signToken(s: Session) {
  const body = b64u(enc.encode(JSON.stringify(s)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}

export async function verifyToken(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), fromB64u(sig), enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64u(body))) as Session;
    if (typeof s.exp !== 'number' || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string, saltIn?: Uint8Array) {
  const salt = saltIn ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 120_000, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${b64u(salt)}$${b64u(bits)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const again = await hashPassword(password, fromB64u(salt));
  const a = again.split('$')[2];
  if (a.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
