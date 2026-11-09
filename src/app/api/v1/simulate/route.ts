import type { NextRequest } from 'next/server';
import { simulate } from '@/lib/twin/sim';
import { sanitize } from '@/lib/twin/params';
import { scenarioById } from '@/lib/twin/scenarios';
import { fail, json, readJson, requireRole } from '@/lib/server/http';
import { audit } from '@/lib/server/store';

const summary = (r: ReturnType<typeof simulate>) => ({ params: r.params, metrics: r.metrics, resources: r.resources, daily: r.daily });

// Предустановленные сценарии — публичны и кэшируются CDN: выдерживает пиковую нагрузку без пересчёта
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('scenario') ?? 'as-is';
  const r = simulate(scenarioById(id).params);
  return json({ scenario: id, ...summary(r) }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } });
}

// Пользовательский расчёт — только для ролей с правом моделирования
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'operator']);
  if ('error' in auth) return auth.error;
  const body = await readJson<{ params?: Record<string, unknown>; includeTrace?: boolean }>(req);
  if (!body?.params) return fail(400, 'bad_request', 'Передайте объект params');
  const params = sanitize(body.params);
  const t0 = performance.now();
  const r = simulate(params);
  const ms = Math.round(performance.now() - t0);
  await audit('info', auth.session.name, 'twin.simulate', `Расчёт месяца: АИ-92 ${params.plan92} т, АИ-95 ${params.plan95} т, постов ${params.posts}, резервуаров ${params.tanks92}+${params.tanks95} → ожидание ${r.metrics.avgWait.toFixed(0)} мин, затаривание ${r.metrics.blockedHours.toFixed(1)} ч (${ms} мс)`);
  return json({ computeMs: ms, ...summary(r), ...(body.includeTrace ? { trucks: r.trucks, events: r.events } : {}) });
}
