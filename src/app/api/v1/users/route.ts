import type { NextRequest } from 'next/server';
import { json, requireRole } from '@/lib/server/http';
import { publicUser, store } from '@/lib/server/store';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['admin']);
  if ('error' in auth) return auth.error;
  return json({ items: (await store()).users.map(publicUser) });
}
