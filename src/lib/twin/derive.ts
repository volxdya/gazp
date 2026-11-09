import type { TwinResult, TruckTrace, TwinParams, TankState, Grade } from './sim';
import { GRADES, TANK_STATE_LABEL } from './sim';
import type { PoiId, StageId } from './pois';
import { SCENARIOS } from './scenarios';

export const plural = (n: number, forms: [string, string, string]) => {
  const a = Math.abs(Math.round(n)) % 100, b = a % 10;
  return forms[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2];
};

export const fmt = {
  int: (v: number) => Math.round(v).toLocaleString('ru-RU'),
  min: (v: number) => `${v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)}`,
  h: (v: number) => (v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v))),
  rub: (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')} млн` : Math.abs(v) >= 1e4 ? `${Math.round(v / 1000)} тыс` : Math.round(v).toLocaleString('ru-RU')),
  pct: (v: number) => `${Math.round(v * 100)}`,
  t: (v: number) => (Math.abs(v) >= 10000 ? `${(v / 1000).toFixed(1).replace('.', ',')} тыс` : Math.round(v).toLocaleString('ru-RU'))
};

export type Tone = 'idle' | 'ok' | 'busy' | 'warn' | 'done';

/** Состояние парка в момент t */
export function tanksAt(r: TwinResult, t: number) {
  const s = r.tankSeries;
  if (!s.length) return { lv: r.tanks.map(() => 0), st: r.tanks.map(() => 'empty' as TankState) };
  let lo = 0, hi = s.length - 1;
  if (t <= s[0].t) return s[0];
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m].t <= t) lo = m; else hi = m - 1; }
  return s[lo];
}

export interface Live {
  onSite: number;
  waiting: number; // в очереди на налив
  atGate: number;
  baysBusy: number;
  loading: number;
  served: number;
  shippedT: number;
  park: number; // заполнение парка, доля
  byGrade: { fill: number; qc: number; ship: number; empty: number; level: number }[];
  blocked: [boolean, boolean]; // затаривание по маркам
}

const inRange = (t: number, a: number, b: number) => t >= a && t < b;

export function liveAt(r: TwinResult, t: number): Live {
  let onSite = 0, waiting = 0, atGate = 0, baysBusy = 0, loading = 0, served = 0;
  for (const x of r.trucks) {
    if (x.arrive > t) break;
    if (!(t >= x.exit)) onSite++;
    if (!(t >= x.gateEnd)) atGate++;
    else if (!(t >= x.bayStart)) waiting++;
    if (inRange(t, x.bayStart, x.bayEnd)) baysBusy++;
    if (inRange(t, x.fillStart, x.fillEnd)) loading++;
    if (t >= x.fillEnd) served++;
  }
  const tk = tanksAt(r, t);
  const byGrade = [0, 1].map((g) => {
    const ids = r.tanks.filter((x) => x.grade === g).map((x) => x.id);
    const c = { fill: 0, qc: 0, ship: 0, empty: 0, level: 0 };
    for (const i of ids) { c[tk.st[i]]++; c.level += tk.lv[i] / Math.max(1, ids.length); }
    return c;
  });
  const park = tk.lv.reduce((a, b) => a + b, 0) / Math.max(1, tk.lv.length);
  const blocked = [0, 1].map((g) => r.blocks.some((b) => b.grade === g && t >= b.from && t < b.to)) as [boolean, boolean];
  return { onSite, waiting, atGate, baysBusy, loading, served, shippedT: served * r.params.truckT, park, byGrade, blocked };
}

export function pinStatuses(r: TwinResult, live: Live) {
  const posts = r.params.posts;
  const anyBlocked = live.blocked[0] || live.blocked[1];
  const qc = live.byGrade[0].qc + live.byGrade[1].qc;
  const s: Record<PoiId, { text: string; tone: 'ok' | 'busy' | 'warn' }> = {
    blend: anyBlocked ? { text: 'снижает выпуск', tone: 'warn' } : { text: 'работает', tone: 'ok' },
    tanks: { text: `заполнен на ${fmt.pct(live.park)}%`, tone: live.park > 0.85 ? 'warn' : 'ok' },
    lab: qc ? { text: `анализ: ${qc}`, tone: 'busy' } : { text: 'свободна', tone: 'ok' },
    pumps: live.loading ? { text: 'подаёт продукт', tone: 'busy' } : { text: 'ожидание', tone: 'ok' },
    bays: { text: `${live.baysBusy} из ${posts} заняты`, tone: live.baysBusy >= posts ? 'warn' : live.baysBusy ? 'busy' : 'ok' },
    gate: live.atGate > 1 ? { text: `у ворот ${live.atGate}`, tone: 'warn' } : live.atGate ? { text: 'проверка', tone: 'busy' } : { text: 'свободно', tone: 'ok' },
    lot: live.waiting >= 5 ? { text: `очередь ${live.waiting}`, tone: 'warn' } : live.waiting ? { text: `очередь ${live.waiting}`, tone: 'busy' } : { text: 'пусто', tone: 'ok' },
    control: { text: `отгружено ${fmt.t(live.shippedT)} т`, tone: 'ok' },
    exit: { text: `уехало ${fmt.int(live.served)}`, tone: 'ok' }
  };
  return s;
}

export interface Row { key: string; label: string; unit: string; a: number; b: number; better: 'lower' | 'higher'; format: (v: number) => string }

export function compareRows(a: TwinResult, b: TwinResult): Row[] {
  return [
    { key: 'wait', label: 'Ожидание налива', unit: 'мин', a: a.metrics.avgWait, b: b.metrics.avgWait, better: 'lower', format: fmt.min },
    { key: 'queue', label: 'Очередь, максимум', unit: 'машин', a: a.metrics.maxQueue, b: b.metrics.maxQueue, better: 'lower', format: fmt.int },
    { key: 'blocked', label: 'Затаривание парка', unit: 'ч', a: a.metrics.blockedHours, b: b.metrics.blockedHours, better: 'lower', format: fmt.h },
    { key: 'lost', label: 'Недовыпуск', unit: 'т', a: a.metrics.lostT, b: b.metrics.lostT, better: 'lower', format: fmt.t },
    { key: 'plan', label: 'Выполнение плана', unit: '%', a: a.metrics.planDone * 100, b: b.metrics.planDone * 100, better: 'higher', format: (v) => v.toFixed(1).replace('.', ',') },
    { key: 'shipped', label: 'Отгружено', unit: 'т', a: a.metrics.shippedT, b: b.metrics.shippedT, better: 'higher', format: fmt.t },
    { key: 'posts', label: 'Загрузка постов', unit: '%', a: a.metrics.postUtil * 100, b: b.metrics.postUtil * 100, better: 'lower', format: (v) => String(Math.round(v)) },
    { key: 'idle', label: 'Плата за простой машин', unit: '₽', a: a.metrics.idleCost, b: b.metrics.idleCost, better: 'lower', format: fmt.rub }
  ];
}

export function rowTone(r: Row) {
  const d = r.b - r.a;
  if (Math.abs(d) < Math.max(0.05, Math.abs(r.a) * 0.02)) return 'same';
  return (r.better === 'lower' ? d < 0 : d > 0) ? 'good' : 'bad';
}

export function describeParams(p: TwinParams) {
  return [
    `${fmt.t(p.plan92)} т АИ-92`,
    `${fmt.t(p.plan95)} т АИ-95`,
    `${p.tanks92}+${p.tanks95} резерв.`,
    `${p.posts} ${plural(p.posts, ['пост', 'поста', 'постов'])}`,
    p.profile === 'slots' ? 'слоты 24/7' : `машин ${Math.round(p.supply * 100)}%`
  ].join(' · ');
}

export function matchPreset(p: TwinParams) {
  return SCENARIOS.find((s) => (Object.keys(s.params) as (keyof TwinParams)[]).every((k) => s.params[k] === p[k]));
}

export function insight(a: TwinResult, b: TwinResult) {
  const m = b.metrics, o = a.metrics;
  if (m.blockedHours > 4) return { tone: 'bad' as const, title: `Затаривание ${fmt.h(m.blockedHours)} ч — недовыпуск ${fmt.t(m.lostT)} т`, text: 'Машин не хватает: парк полон, установка снижает выпуск.' };
  if (m.avgWait < o.avgWait * 0.7 && m.blockedHours <= o.blockedHours) return { tone: 'good' as const, title: `Очередь короче: ожидание ${fmt.min(m.avgWait)} мин вместо ${fmt.min(o.avgWait)}`, text: 'Без затаривания, план выполнен.' };
  if (m.maxQueue > 15) return { tone: 'mixed' as const, title: `Очередь до ${m.maxQueue} машин`, text: 'Подъезд неравномерный: днём пик, ночью и в выходные пусто.' };
  return { tone: 'neutral' as const, title: 'Баланс: машины успевают за выпуском', text: 'Ни очередей, ни затаривания.' };
}

/** Средние длительности этапов */
export function stageStats(r: TwinResult): Record<StageId, { work: number; wait: number; n: number }> {
  const acc = {} as Record<StageId, { work: number; wait: number; n: number }>;
  const add = (id: StageId, work: number, wait = 0) => {
    if (!Number.isFinite(work)) return;
    const a = (acc[id] ??= { work: 0, wait: 0, n: 0 });
    a.work += work; a.wait += Math.max(0, wait); a.n++;
  };
  for (const t of r.trucks) {
    if (!Number.isFinite(t.exit)) continue;
    add('E1', t.gateEnd - t.gateStart, t.gateStart - t.arrive);
    add('E2', t.bayStart - t.gateEnd);
    add('E3', t.bayEnd - t.bayStart);
    add('E4', t.exit - t.bayEnd);
  }
  const dur: Record<TankState, number[]> = { fill: [], qc: [], ship: [], empty: [] };
  r.tanks.forEach((tk) => {
    let cur: TankState | null = null, since = 0;
    for (const s of r.tankSeries) {
      if (s.st[tk.id] !== cur) { if (cur && since > 0) dur[cur].push(s.t - since); cur = s.st[tk.id]; since = s.t; }
    }
  });
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  add('I1', r.horizon);
  add('I2', avg(dur.fill));
  add('I3', avg(dur.qc));
  add('I4', avg(dur.ship));
  for (const k of Object.keys(acc) as StageId[]) { acc[k].work /= acc[k].n; acc[k].wait /= acc[k].n; }
  return acc;
}

export const segmentsOf = (t: TruckTrace) => [
  { k: 'gate', a: t.arrive, b: t.gateEnd },
  { k: 'wait', a: t.gateEnd, b: t.bayStart },
  { k: 'bay', a: t.bayStart, b: t.fillStart },
  { k: 'fill', a: t.fillStart, b: t.fillEnd },
  { k: 'bay', a: t.fillEnd, b: t.bayEnd },
  { k: 'out', a: t.bayEnd, b: t.exit }
].filter((s) => Number.isFinite(s.a) && Number.isFinite(s.b) && s.b > s.a);

export function truckStatus(t: TruckTrace, now: number): { label: string; tone: Tone } {
  if (now < t.arrive) return { label: 'Едет', tone: 'idle' };
  if (now >= t.exit) return { label: 'Уехала', tone: 'done' };
  if (!(now >= t.gateEnd)) return { label: 'КПП', tone: 'busy' };
  if (!(now >= t.bayStart)) return { label: t.tankWait > 0 && now < t.gateEnd + t.tankWait ? 'Нет продукта' : 'Ждёт пост', tone: 'warn' };
  if (!(now >= t.fillStart)) return { label: 'Подключение', tone: 'busy' };
  if (!(now >= t.fillEnd)) return { label: 'Налив', tone: 'ok' };
  if (!(now >= t.bayEnd)) return { label: 'Пломба', tone: 'busy' };
  return { label: 'Выезд', tone: 'busy' };
}

export const tankTone = (s: TankState): Tone => (s === 'ship' ? 'ok' : s === 'qc' ? 'warn' : s === 'fill' ? 'busy' : 'idle');
export const tankLabel = (s: TankState) => TANK_STATE_LABEL[s];
export const gradeName = (g: Grade) => GRADES[g];

export function recentEvents(r: TwinResult, now: number, n = 6) {
  const out = [];
  for (let i = r.events.length - 1; i >= 0 && out.length < n; i--) if (r.events[i].t <= now) out.push(r.events[i]);
  return out;
}
