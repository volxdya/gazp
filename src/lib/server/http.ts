import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifyToken, type Role, type Session } from './crypto';

export const json = (data: unknown, init?: number | ResponseInit) =>
  NextResponse.json(data, typeof init === 'number' ? { status: init } : init);

export const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

export async function sessionOf(req: NextRequest): Promise<Session | null> {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return verifyToken(bearer || req.cookies.get(SESSION_COOKIE)?.value);
}

export async function requireRole(req: NextRequest, roles: Role[]) {
  const s = await sessionOf(req);
  if (!s) return { error: fail(401, 'unauthorized', 'Требуется вход в систему') } as const;
  if (!roles.includes(s.role)) return { error: fail(403, 'forbidden', 'Недостаточно прав для операции') } as const;
  return { session: s } as const;
}

export const ipOf = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';

export async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    const text = await req.text();
    if (text.length > 20_000) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export const isEmail = (s: unknown): s is string => typeof s === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s);
