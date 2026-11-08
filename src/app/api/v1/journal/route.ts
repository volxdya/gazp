import type { NextRequest } from 'next/server';
import { fail, json, readJson, requireRole, sessionOf } from '@/lib/server/http';
import { audit, store, type Level } from '@/lib/server/store';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'operator']);
  if ('error' in auth) return auth.error;
  const sp = req.nextUrl.searchParams;
  const level = sp.get('level');
  const q = sp.get('q')?.toLowerCase();
  const limit = Math.min(500, Number(sp.get('limit')) || 200);
  let items = (await store()).journal.slice().reverse();
  if (auth.session.role !== 'admin') items = items.filter((e) => e.level !== 'security' || e.actor === auth.session.name);
  if (level) items = items.filter((e) => e.level === level);
  if (q) items = items.filter((e) => `${e.actor} ${e.action} ${e.detail}`.toLowerCase().includes(q));
  return json({ total: items.length, items: items.slice(0, limit) }, { headers: { 'Cache-Control': 'no-store' } });
}

// Клиент сообщает о значимых действиях и сбоях интерфейса (ошибки, восстановление сессии, просмотр точек тура)
export async function POST(req: NextRequest) {
  const s = await sessionOf(req);
  if (!s) return fail(401, 'unauthorized', 'Требуется вход');
  const body = await readJson<{ level?: Level; action?: string; detail?: string }>(req);
  const level: Level = body?.level === 'error' || body?.level === 'warn' ? body.level : 'info';
  const action = String(body?.action ?? '').slice(0, 40);
  if (!/^[a-z][a-z0-9_.-]*$/.test(action)) return fail(400, 'bad_request', 'Некорректное действие');
  await audit(level, s.name, action, String(body?.detail ?? '').slice(0, 300));
  return json({ ok: true }, 201);
}
