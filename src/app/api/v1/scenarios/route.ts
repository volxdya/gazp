import type { NextRequest } from 'next/server';
import { SCENARIOS } from '@/lib/twin/scenarios';
import { fail, json, readJson, requireRole, sessionOf } from '@/lib/server/http';
import { audit, mutate, store } from '@/lib/server/store';
import { sanitize } from '@/lib/twin/params';

export async function GET(req: NextRequest) {
  const s = await sessionOf(req);
  const saved = s ? (await store()).scenarios.filter((x) => x.owner === s.sub || s.role === 'admin') : [];
  return json({ presets: SCENARIOS, saved });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'operator']);
  if ('error' in auth) return auth.error;
  const body = await readJson<{ name?: string; params?: Record<string, unknown> }>(req);
  const name = String(body?.name ?? '').trim().slice(0, 60);
  if (!name || !body?.params) return fail(400, 'bad_request', 'Нужны name и params');
  const item = await mutate((s) => {
    const it = { id: crypto.randomUUID(), name, owner: auth.session.sub, createdAt: new Date().toISOString(), params: { ...sanitize(body.params!) } };
    s.scenarios.unshift(it);
    s.scenarios.splice(200);
    return it;
  });
  await audit('info', auth.session.name, 'scenario.save', `Сохранён сценарий «${name}»`);
  return json({ scenario: item }, 201);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'operator']);
  if ('error' in auth) return auth.error;
  const id = req.nextUrl.searchParams.get('id');
  const ok = await mutate((s) => {
    const i = s.scenarios.findIndex((x) => x.id === id && (x.owner === auth.session.sub || auth.session.role === 'admin'));
    if (i < 0) return false;
    s.scenarios.splice(i, 1);
    return true;
  });
  if (!ok) return fail(404, 'not_found', 'Сценарий не найден');
  await audit('info', auth.session.name, 'scenario.delete', `Удалён сценарий ${id}`);
  return json({ ok: true });
}
