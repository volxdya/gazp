import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/server/crypto';
import { json, sessionOf } from '@/lib/server/http';
import { audit } from '@/lib/server/store';

export async function POST(req: NextRequest) {
  const s = await sessionOf(req);
  if (s) await audit('security', s.name, 'logout', 'Выход из системы');
  const res = json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
