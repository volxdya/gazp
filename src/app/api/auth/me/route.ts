import type { NextRequest } from 'next/server';
import { fail, json, sessionOf } from '@/lib/server/http';
import { publicUser, store } from '@/lib/server/store';

export async function GET(req: NextRequest) {
  const s = await sessionOf(req);
  if (!s) return fail(401, 'unauthorized', 'Не выполнен вход');
  const u = (await store()).users.find((x) => x.id === s.sub);
  return json({ user: u ? publicUser(u) : { id: s.sub, name: s.name, role: s.role, email: s.email ?? '' } });
}
