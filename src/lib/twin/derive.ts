import type { TwinResult, TruckTrace, TwinParams } from './sim';
import { RESOURCE_LABEL } from './sim';
import type { PoiId, StageId } from './pois';
import { SCENARIOS } from './scenarios';

export const plural = (n: number, forms: [string, string, string]) => {
  const a = Math.abs(Math.round(n)) % 100, b = a % 10;
  return forms[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2];
};

export const fmt = {
  int: (v: number) => Math.round(v).toLocaleString('ru-RU'),
  min: (v: number) => `${v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)}`,
  rub: (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2).replace('.', ',')} млн` : Math.abs(v) >= 1e4 ? `${Math.round(v / 1000)} тыс` : Math.round(v).toLocaleString('ru-RU')),
  pct: (v: number) => `${Math.round(v * 100)}`
};

export interface Live {
  onSite: number;
  atGate: number;
  waiting: number;
  baysBusy: number;
  unloading: number;
  served: number;
  received: number; // м³ сырья слито к моменту t
  labBusy: 'in' | 'qc' | null;
  pumpBusy: boolean;
  levelA: number; // доля заполнения резервуара A
  levelB: number;
  blending: number;
  qc: number;
  lineBusy: number;
  packed: number; // бочек расфасовано к моменту t
  batchesDone: number;
  batchWaiting: number; // партии, ожидающие смеситель или сырьё
  tankWaiting: number; // цистерны, ждущие места в резервуаре
}

const inRange = (t: number, a: number, b: number) => t >= a && t < b;

export function levelAt(r: TwinResult, t: number) {
  const s = r.levelSeries;
  let lo = 0, hi = s.length - 1;
  if (!s.length) return { a: 0.5, b: 0.5 };
  if (t <= s[0].t) return s[0];
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m].t <= t) lo = m; else hi = m - 1; }
  return s[lo];
}

export function liveAt(r: TwinResult, t: number): Live {
  let onSite = 0, atGate = 0, waiting = 0, baysBusy = 0, unloading = 0, served = 0, received = 0, tankWaiting = 0;
  let labBusy: Live['labBusy'] = null;
  let pumpBusy = false;
  for (const x of r.trucks) {
    if (t >= x.arrive && !(t >= x.exit)) onSite++;
    if (t >= x.arrive && !(t >= x.gateEnd)) atGate++;
    if (t >= x.tareEnd && !(t >= x.bayStart)) waiting++;
    if (inRange(t, x.bayStart, x.bayEnd)) baysBusy++;
    if (inRange(t, x.fillStart, x.fillEnd)) unloading++;
    if (t >= x.exit) served++;
    if (t >= x.fillEnd) received += x.volume;
    if (inRange(t, x.orderDone, x.qualityDone)) labBusy = 'in';
    if (inRange(t, x.qualityDone, x.readyAt) && x.tankWait > 0) tankWaiting++;
    if (inRange(t, x.fillStart - 5, x.fillStart)) pumpBusy = true;
  }
  let blending = 0, qc = 0, lineBusy = 0, packed = 0, batchesDone = 0, batchWaiting = 0;
  for (const b of r.batches) {
    if (inRange(t, b.feedStart, b.feedEnd)) pumpBusy = true;
    if (inRange(t, b.blendStart, b.blendEnd)) blending++;
    if (inRange(t, b.qcStart, b.qcEnd)) { qc++; labBusy = 'qc'; }
    if (inRange(t, b.lineStart, b.lineEnd)) lineBusy++;
    if (t >= b.lineStart) packed += t >= b.lineEnd ? b.units : Math.floor(b.units * ((t - b.lineStart) / Math.max(0.01, b.lineEnd - b.lineStart)));
    if (t >= b.done) batchesDone++;
    if (t >= b.planned && !(t >= b.feedStart)) batchWaiting++;
  }
  const lv = levelAt(r, t);
  return { onSite, atGate, waiting, baysBusy, unloading, served, received, labBusy, pumpBusy, levelA: lv.a, levelB: lv.b, blending, qc, lineBusy, packed, batchesDone, batchWaiting, tankWaiting };
}

export function pinStatuses(r: TwinResult, live: Live) {
  const bays = Math.min(r.params.bays, 6);
  const util = (id: string) => r.resources.find((x) => x.id === id)?.utilization ?? 0;
  const lvl = Math.max(live.levelA, live.levelB);
  const s: Record<PoiId, { text: string; tone: 'ok' | 'busy' | 'warn' }> = {
    gate: live.atGate > 1 ? { text: `очередь ${live.atGate - 1}`, tone: 'warn' } : live.atGate ? { text: 'проверка', tone: 'busy' } : { text: 'свободно', tone: 'ok' },
    scales: { text: `${fmt.pct(util('scales'))}% загрузка`, tone: util('scales') > 0.8 ? 'warn' : 'ok' },
    lot: live.tankWaiting ? { text: `нет места: ${live.tankWaiting}`, tone: 'warn' } : live.waiting >= 2 ? { text: `ждут ${live.waiting}`, tone: 'warn' } : live.waiting ? { text: `ждут ${live.waiting}`, tone: 'busy' } : { text: 'пусто', tone: 'ok' },
    control: { text: `${fmt.pct(util('dispatcher'))}% загрузка`, tone: util('dispatcher') > 0.8 ? 'warn' : 'ok' },
    bays: live.unloading ? { text: `слив · ${live.baysBusy}/${bays}`, tone: live.baysBusy >= bays ? 'warn' : 'busy' } : { text: `${live.baysBusy}/${bays} занято`, tone: live.baysBusy ? 'busy' : 'ok' },
    pumps: live.pumpBusy ? { text: 'маршрут открыт', tone: 'busy' } : { text: 'свободна', tone: 'ok' },
    tanks: { text: `A ${fmt.pct(live.levelA)}% · B ${fmt.pct(live.levelB)}%`, tone: lvl > 0.9 || Math.min(live.levelA, live.levelB) < 0.12 ? 'warn' : 'ok' },
    blend: live.blending ? { text: 'смешивание', tone: 'busy' } : live.qc ? { text: 'ждёт ОТК', tone: 'warn' } : live.batchWaiting ? { text: `в очереди ${live.batchWaiting}`, tone: 'warn' } : { text: 'свободен', tone: 'ok' },
    lab: live.labBusy === 'qc' ? { text: 'контроль партии', tone: 'busy' } : live.labBusy === 'in' ? { text: 'проба сырья', tone: 'busy' } : { text: 'свободна', tone: 'ok' },
    filling: live.lineBusy ? { text: 'идёт фасовка', tone: 'busy' } : { text: 'ждёт партию', tone: 'ok' },
    warehouse: { text: `${fmt.int(live.packed)} бочек`, tone: 'ok' },
    exit: { text: `выехало ${live.served}`, tone: 'ok' }
  };
  return s;
}

export interface Row { key: string; label: string; unit: string; a: number; b: number; better: 'lower' | 'higher'; format: (v: number) => string }

export function compareRows(a: TwinResult, b: TwinResult): Row[] {
  return [
    { key: 'turn', label: 'Оборот цистерны', unit: 'мин', a: a.metrics.avgTurnaround, b: b.metrics.avgTurnaround, better: 'lower', format: fmt.min },
    { key: 'wait', label: 'Простой цистерны', unit: 'мин', a: a.metrics.avgWait, b: b.metrics.avgWait, better: 'lower', format: fmt.min },
    { key: 'tank', label: 'Ждали места в резервуаре', unit: 'мин', a: a.metrics.tankFullWait, b: b.metrics.tankFullWait, better: 'lower', format: fmt.int },
    { key: 'plan', label: 'Выполнение плана', unit: '%', a: a.metrics.planDone * 100, b: b.metrics.planDone * 100, better: 'higher', format: (v) => `${Math.round(v)}` },
    { key: 'packed', label: 'Расфасовано', unit: 'бочек', a: a.metrics.bottledUnits, b: b.metrics.bottledUnits, better: 'higher', format: fmt.int },
    { key: 'cost', label: 'Затраты за смену', unit: '₽', a: a.metrics.totalCost, b: b.metrics.totalCost, better: 'lower', format: fmt.rub },
    { key: 'margin', label: 'Маржа смены', unit: '₽', a: a.metrics.margin, b: b.metrics.margin, better: 'higher', format: fmt.rub }
  ];
}

export function rowTone(r: Row) {
  const d = r.b - r.a;
  if (Math.abs(d) < Math.max(0.5, Math.abs(r.a) * 0.02)) return 'same';
  return (r.better === 'lower' ? d < 0 : d > 0) ? 'good' : 'bad';
}

export function describeParams(p: TwinParams) {
  const parts = [`${p.bays} ${plural(p.bays, ['пост', 'поста', 'постов'])} слива`, `${p.blenders} ${plural(p.blenders, ['смеситель', 'смесителя', 'смесителей'])}`, `${String(p.trucksPerHour).replace('.', ',')} цист/ч`];
  if (p.lines > 1) parts.push(`${p.lines} линии фасовки`);
  if (p.prepMode === 'prebooked') parts.push('предзапись');
  if (p.automation) parts.push('цифровой приём');
  return parts.join(' · ');
}

export function matchPreset(p: TwinParams) {
  return SCENARIOS.find((s) => (Object.keys(s.params) as (keyof TwinParams)[]).every((k) => s.params[k] === p[k]));
}

export function insight(a: TwinResult, b: TwinResult) {
  const turn = (b.metrics.avgTurnaround - a.metrics.avgTurnaround) / Math.max(1, a.metrics.avgTurnaround);
  const dm = b.metrics.margin - a.metrics.margin;
  const dPlan = Math.round((b.metrics.planDone - a.metrics.planDone) * 100);
  const bn = RESOURCE_LABEL[b.metrics.bottleneck].toLowerCase();
  const planTxt = dPlan ? `, план ${dPlan > 0 ? '+' : ''}${dPlan} п.п.` : '';
  if (Math.abs(turn) < 0.04 && Math.abs(dm) < 5000) return { tone: 'neutral' as const, title: 'Существенной разницы нет', text: `Изменение не трогает узкое место — ${bn}. Деньги потрачены впустую.` };
  if (dm >= 0 && turn <= 0.04) return { tone: 'good' as const, title: `${turn < -0.04 ? `Оборот цистерн −${Math.round(-turn * 100)}%, ` : ''}маржа +${fmt.rub(dm)} ₽${planTxt}`, text: `Решение выигрывает. Следующее узкое место: ${bn}.` };
  if (dm < 0 && turn < -0.04) return { tone: 'mixed' as const, title: `Оборот −${Math.round(-turn * 100)}%, но маржа −${fmt.rub(-dm)} ₽`, text: `Ускорение приёма стоит денег. Узкое место: ${bn}.` };
  if (dm > 0) return { tone: 'mixed' as const, title: `Маржа +${fmt.rub(dm)} ₽, но оборот +${Math.round(turn * 100)}%`, text: `Цех выпускает больше, а цистерны стоят дольше. Узкое место: ${bn}.` };
  return { tone: 'bad' as const, title: `Хуже: маржа −${fmt.rub(-dm)} ₽`, text: `Сценарий не трогает узкое место — ${bn} — и только добавляет затраты.` };
}

/** Средние длительности этапов: работа и ожидание перед этапом */
export function stageStats(r: TwinResult): Record<StageId, { work: number; wait: number; n: number }> {
  const acc = {} as Record<StageId, { work: number; wait: number; n: number }>;
  const add = (id: StageId, work: number, wait: number) => {
    if (!Number.isFinite(work)) return;
    const a = (acc[id] ??= { work: 0, wait: 0, n: 0 });
    a.work += work;
    a.wait += Number.isFinite(wait) ? Math.max(0, wait) : 0;
    a.n++;
  };
  for (const b of r.batches) {
    if (!Number.isFinite(b.done)) continue;
    add('I1', b.feedEnd - b.feedStart, b.feedStart - b.planned);
    add('I2', b.blendEnd - b.blendStart, 0);
    add('I3', b.qcEnd - b.qcStart, b.qcStart - b.blendEnd);
    add('I4', b.lineEnd - b.lineStart, b.lineStart - b.qcEnd);
    add('I5', b.done - b.lineEnd, 0);
  }
  for (const t of r.trucks) {
    if (!Number.isFinite(t.exit)) continue;
    add('E1', t.gateEnd - t.gateStart, t.gateStart - t.arrive);
    add('E2', t.tareEnd - t.tareStart, t.tareStart - t.gateEnd);
    add('E3', t.bayStart - t.tareEnd, 0);
    add('E4', t.bayEnd - t.bayStart, 0);
    add('E5', t.grossEnd - t.grossStart, t.grossStart - t.bayEnd);
    add('E6', t.exit - t.grossEnd, 0);
  }
  for (const k of Object.keys(acc) as StageId[]) { acc[k].work /= acc[k].n; acc[k].wait /= acc[k].n; }
  return acc;
}

export const segmentsOf = (t: TruckTrace) => [
  { k: 'gate', a: t.arrive, b: t.gateEnd },
  { k: 'scale', a: t.gateEnd, b: t.tareEnd },
  { k: 'wait', a: t.tareEnd, b: t.bayStart },
  { k: 'bay', a: t.bayStart, b: t.fillStart },
  { k: 'fill', a: t.fillStart, b: t.fillEnd },
  { k: 'bay', a: t.fillEnd, b: t.bayEnd },
  { k: 'out', a: t.bayEnd, b: t.exit }
].filter((s) => Number.isFinite(s.a) && Number.isFinite(s.b) && s.b > s.a);
