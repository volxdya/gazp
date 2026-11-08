import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_TTL_MS, signToken, type Session } from './crypto';

export async function withSession(res: NextResponse, s: Omit<Session, 'exp'>) {
  const token = await signToken({ ...s, exp: Date.now() + SESSION_TTL_MS });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000
  });
  return res;
}
