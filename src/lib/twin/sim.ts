/**
 * Дискретно-событийная модель отгрузки бензина с НПЗ (по описанию представителя заказчика и ТЗ хакатона).
 *
 *  ВНУТРЕННИЙ процесс — «Приготовление и хранение»: установка непрерывно готовит АИ-92 и АИ-95 (класс 5)
 *    по месячному плану → наполняет резервуар (~3000 м³) → анализ качества → резервуар открыт на налив.
 *    Пока один резервуар отгружается, приготовление идёт в другой. Если все резервуары марки полны —
 *    затаривание парка: установка вынуждена снижать выпуск (недовыпуск в тоннах).
 *  ВНЕШНИЙ процесс — «Налив автоцистерн»: прибытие → КПП и документы → ожидание поста и продукта
 *    → налив 20 т → выезд. Что с машиной дальше, заводу не важно.
 *
 * Горизонт — месяц. Модель детерминирована при одинаковом seed.
 */

export type ArrivalProfile = 'uneven' | 'slots';
export const GRADES = ['АИ-92 К5', 'АИ-95 К5'] as const;
export type Grade = 0 | 1;

export interface TwinParams {
  days: number; // горизонт плана, суток
  crudeT: number; // нефть в переработку за месяц, т
  plan92: number; // план АИ-92 за месяц, т
  plan95: number; // план АИ-95 за месяц, т
  tanks92: number; // резервуаров под АИ-92
  tanks95: number; // резервуаров под АИ-95
  tankT: number; // вместимость резервуара, т (≈ 3000 м³)
  qcHours: number; // анализ качества резервуара, ч
  supply: number; // подъезд машин от потребности, доля (1 = ровно столько, сколько нужно)
  profile: ArrivalProfile; // неравномерный подъезд или слоты 24/7
  posts: number; // постов налива
  truckT: number; // тонн в автоцистерне
  loadRate: number; // скорость налива на посту, т/ч
  idleRate: number; // плата перевозчику за час простоя машины, ₽
  seed: number;
}

export const DEFAULT_PARAMS: TwinParams = {
  days: 30,
  crudeT: 100000,
  plan92: 40000,
  plan95: 30000,
  tanks92: 3,
  tanks95: 3,
  tankT: 2200,
  qcHours: 3,
  supply: 1,
  profile: 'uneven',
  posts: 3,
  truckT: 20,
  loadRate: 100,
  idleRate: 1500,
  seed: 42
};

export type ResourceId = 'gate' | 'posts';
export const RESOURCE_LABEL: Record<ResourceId, string> = { gate: 'КПП', posts: 'Посты налива' };

export type TankState = 'fill' | 'qc' | 'ship' | 'empty';
export const TANK_STATE_LABEL: Record<TankState, string> = { fill: 'Наполнение', qc: 'Анализ', ship: 'На наливе', empty: 'Свободен' };

export interface TankInfo { id: number; grade: Grade; name: string }

export interface TruckTrace {
  id: number;
  plate: string;
  component: Grade; // марка бензина
  volume: number; // т
  arrive: number;
  gateStart: number;
  gateEnd: number;
  tareStart: number;
  tareEnd: number;
  prepStart: number;
  orderDone: number;
  qualityDone: number;
  readyAt: number;
  bay: number;
  bayStart: number;
  fillStart: number;
  fillEnd: number;
  bayEnd: number;
  grossStart: number;
  grossEnd: number;
  exit: number;
  tankWait: number; // ожидание из-за отсутствия продукта, мин
  tank: number;
}

export interface TwinEvent {
  t: number;
  kind: 'arrive' | 'gate' | 'bay' | 'fill' | 'exit' | 'alert' | 'tank';
  process: 'internal' | 'external';
  truck?: number;
  text: string;
}

export interface ResourceStat { id: ResourceId; label: string; capacity: number; utilization: number; avgWait: number; maxQueue: number }

export interface DayStat { day: number; plan: number; produced: number; shipped: number; trucks: number; blockedH: number; maxQueue: number }

export interface TwinResult {
  params: TwinParams;
  horizon: number;
  trucks: TruckTrace[];
  tanks: TankInfo[];
  tankSeries: { t: number; lv: number[]; st: TankState[] }[];
  blocks: { grade: Grade; from: number; to: number }[];
  events: TwinEvent[];
  resources: ResourceStat[];
  queueSeries: { t: number; onSite: number; waitingBay: number }[];
  daily: DayStat[];
  metrics: {
    arrived: number;
    served: number;
    avgWait: number; // ожидание налива, мин
    p90Wait: number;
    maxQueue: number;
    idleHours: number; // простой машин, машино-ч
    idleCost: number; // плата за простой, ₽
    planT: number;
    producedT: number;
    shippedT: number;
    planDone: number; // произведено от плана
    shippedShare: number; // отгружено от произведённого
    blockedHours: number; // затаривание (сумма по маркам), ч
    lostT: number; // недовыпуск из-за затаривания, т
    minFree: number; // минимальная свободная ёмкость парка, доля
    postUtil: number;
    bottleneck: 'posts' | 'tanks' | 'trucks' | 'none';
    // совместимость со старыми экранами
    avgTurnaround: number;
    volume: number;
  };
}

/* ---------- инфраструктура ---------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const tri = (r: Rng, min: number, mode: number, max: number) => {
  const u = r();
  const c = (mode - min) / (max - min);
  return u < c ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
};
const expo = (r: Rng, mean: number) => -Math.log(1 - r()) * mean;

interface QItem { t: number; seq: number; fn: () => void }

class EventQueue {
  private heap: QItem[] = [];
  private seq = 0;
  now = 0;
  at(t: number, fn: () => void) {
    const item = { t, seq: this.seq++, fn };
    const h = this.heap;
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(h[p], h[i])) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  after(dt: number, fn: () => void) { this.at(this.now + dt, fn); }
  private less(a: QItem, b: QItem) { return a.t < b.t || (a.t === b.t && a.seq < b.seq); }
  run(limit: number) {
    const h = this.heap;
    let guard = 0;
    while (h.length && guard++ < 500_000) {
      const top = h[0];
      const last = h.pop()!;
      if (h.length) {
        h[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < h.length && this.less(h[l], h[m])) m = l;
          if (r < h.length && this.less(h[r], h[m])) m = r;
          if (m === i) break;
          [h[m], h[i]] = [h[i], h[m]];
          i = m;
        }
      }
      if (top.t > limit) break;
      this.now = top.t;
      top.fn();
    }
  }
}

class Resource {
  busy = 0;
  busyTime = 0;
  lastChange = 0;
  waitSum = 0;
  waitCount = 0;
  maxQueue = 0;
  private queue: { since: number; cb: (unit: number) => void }[] = [];
  private freeUnits: number[];
  constructor(private q: EventQueue, public capacity: number) {
    this.freeUnits = Array.from({ length: capacity }, (_, i) => i);
  }
  private account() {
    this.busyTime += this.busy * (this.q.now - this.lastChange);
    this.lastChange = this.q.now;
  }
  get queued() { return this.queue.length; }
  request(cb: (unit: number) => void) {
    if (this.busy < this.capacity) {
      this.account();
      this.busy++;
      this.waitCount++;
      cb(this.freeUnits.shift()!);
    } else {
      this.queue.push({ since: this.q.now, cb });
      this.maxQueue = Math.max(this.maxQueue, this.queue.length);
    }
  }
  release(unit: number) {
    const next = this.queue.shift();
    if (next) {
      this.waitSum += this.q.now - next.since;
      this.waitCount++;
      next.cb(unit);
    } else {
      this.account();
      this.busy--;
      this.freeUnits.push(unit);
      this.freeUnits.sort((a, b) => a - b);
    }
  }
  finish(horizon: number) {
    this.busyTime += this.busy * (horizon - this.lastChange);
    this.lastChange = horizon;
  }
}

const REGIONS = ['77', '50', '199', '750', '97', '177'];
const LETTERS = 'АВЕКМНОРСТУХ';
function plate(r: Rng) {
  const l = () => LETTERS[Math.floor(r() * LETTERS.length)];
  return `${l()}${100 + Math.floor(r() * 899)}${l()}${l()} ${REGIONS[Math.floor(r() * REGIONS.length)]}`;
}

export const fmtClock = (min: number) => {
  const t = Math.max(0, Math.round(min));
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
/** «д.3 14:20» — день плана и время */
export const fmtDayTime = (min: number) => `д.${Math.floor(Math.max(0, min) / 1440) + 1} ${fmtClock(min)}`;

/** Интенсивность подъезда в момент t (множитель к среднему): днём больше, ночью и в выходные меньше */
function arrivalFactor(t: number, profile: ArrivalProfile) {
  if (profile === 'slots') return 1;
  const h = (t / 60) % 24;
  const dow = Math.floor(t / 1440) % 7; // 0 — понедельник
  const day = h >= 7 && h < 21 ? 1.45 : 0.42;
  const week = dow >= 5 ? 0.55 : 1.14;
  return day * week;
}

/* ---------- модель ---------- */

export function simulate(input: Partial<TwinParams> = {}): TwinResult {
  const p: TwinParams = { ...DEFAULT_PARAMS, ...input };
  const rnd = mulberry32(p.seed);
  const q = new EventQueue();
  const horizon = p.days * 1440;
  const events: TwinEvent[] = [];
  const log = (e: Omit<TwinEvent, 't'>) => events.push({ t: q.now, ...e });
  const gate = new Resource(q, 2);

  /* ----- резервуары ----- */
  const rate: [number, number] = [p.plan92 / (p.days * 1440), p.plan95 / (p.days * 1440)]; // т/мин
  const counts: [number, number] = [p.tanks92, p.tanks95];
  const tanks: TankInfo[] = [];
  const lv: number[] = [];
  const st: TankState[] = [];
  const reserved: number[] = [];
  const fillSince: number[] = [];
  const openedAt: number[] = [];
  ([0, 1] as Grade[]).forEach((g) => {
    for (let k = 0; k < counts[g]; k++) {
      const id = tanks.length;
      tanks.push({ id, grade: g, name: `${g === 0 ? '92' : '95'}-${k + 1}` });
      // стартовое состояние: первый на наливе, второй наполняется, остальные свободны
      // стартовое состояние: на наливе 1–2 резервуара с запасом, один наполняется, остальные свободны
      const last = counts[g] - 1;
      const role = k === last ? 'fill' : k < Math.min(2, last) ? 'ship' : 'empty';
      lv.push(role === 'ship' ? p.tankT * (k === 0 ? 0.5 : 0.95) : role === 'fill' ? p.tankT * 0.2 : 0);
      st.push(role);
      reserved.push(0);
      fillSince.push(0);
      openedAt.push(role === 'ship' ? k - 2 : Infinity);
    }
  });
  const filling: (number | null)[] = [0, 1].map((g) => tanks.findIndex((t) => t.grade === g && st[t.id] === 'fill')).map((i) => (i >= 0 ? i : null));
  const blockedSince: (number | null)[] = [null, null];
  const blocks: TwinResult['blocks'] = [];
  const produced = [0, 0];
  let lostT = 0;
  const fullEventToken = [0, 0];

  const levelNow = (i: number) => (st[i] === 'fill' ? Math.min(p.tankT, lv[i] + rate[tanks[i].grade] * (q.now - fillSince[i])) : lv[i]);

  const startFilling = (g: Grade, i: number) => {
    st[i] = 'fill';
    fillSince[i] = q.now;
    filling[g] = i;
    const token = ++fullEventToken[g];
    const dt = (p.tankT - lv[i]) / Math.max(1e-9, rate[g]);
    q.after(dt, () => { if (token === fullEventToken[g]) onFull(g, i); });
  };
  const onFull = (g: Grade, i: number) => {
    produced[g] += p.tankT - lv[i];
    lv[i] = p.tankT;
    st[i] = 'qc';
    filling[g] = null;
    log({ kind: 'tank', process: 'internal', text: `Резервуар ${tanks[i].name} наполнен — отбор пробы на анализ` });
    q.after(p.qcHours * 60 * tri(rnd, 0.85, 1, 1.25), () => {
      st[i] = 'ship';
      openedAt[i] = q.now;
      log({ kind: 'tank', process: 'internal', text: `Резервуар ${tanks[i].name}: анализ пройден, открыт на налив` });
      dispatch();
    });
    const next = tanks.find((t) => t.grade === g && st[t.id] === 'empty');
    if (next) startFilling(g, next.id);
    else {
      blockedSince[g] = q.now;
      log({ kind: 'alert', process: 'internal', text: `Затаривание: все резервуары ${GRADES[g]} заполнены — установка снижает выпуск` });
    }
  };
  const onEmpty = (i: number) => {
    const g = tanks[i].grade;
    st[i] = 'empty';
    openedAt[i] = Infinity;
    if (blockedSince[g] != null) {
      const from = blockedSince[g]!;
      blocks.push({ grade: g, from, to: q.now });
      lostT += rate[g] * (q.now - from);
      blockedSince[g] = null;
      log({ kind: 'tank', process: 'internal', text: `Резервуар ${tanks[i].name} освободился — выпуск ${GRADES[g]} восстановлен` });
      startFilling(g, i);
    }
  };
  const shipTank = (g: Grade) => {
    let best = -1;
    for (const t of tanks) if (t.grade === g && st[t.id] === 'ship' && lv[t.id] - reserved[t.id] >= p.truckT && (best < 0 || openedAt[t.id] < openedAt[best])) best = t.id;
    return best;
  };

  /* ----- посты налива и очередь ----- */
  const freePosts: number[] = Array.from({ length: p.posts }, (_, i) => i);
  let postBusy = 0, postBusyTime = 0, postLast = 0;
  const accountPosts = () => { postBusyTime += postBusy * (q.now - postLast); postLast = q.now; };
  const waiting: TruckTrace[] = [];
  let maxQueue = 0;
  let waitSum = 0, waitN = 0;

  const dispatch = () => {
    for (let k = 0; k < waiting.length && freePosts.length; ) {
      const t = waiting[k];
      const tk = shipTank(t.component);
      if (tk < 0) { k++; continue; }
      waiting.splice(k, 1);
      const post = freePosts.shift()!;
      accountPosts();
      postBusy++;
      reserved[tk] += p.truckT;
      t.readyAt = q.now;
      t.bay = post;
      t.tank = tk;
      t.bayStart = q.now;
      waitSum += q.now - t.gateEnd;
      waitN++;
      q.after(tri(rnd, 3, 5, 8), () => {
        t.fillStart = q.now;
        q.after((p.truckT / p.loadRate) * 60 * tri(rnd, 0.95, 1, 1.1), () => {
          t.fillEnd = q.now;
          lv[tk] -= p.truckT;
          reserved[tk] -= p.truckT;
          q.after(tri(rnd, 2, 4, 6), () => {
            t.bayEnd = q.now;
            t.grossStart = t.grossEnd = q.now;
            accountPosts();
            postBusy--;
            freePosts.push(post);
            freePosts.sort((a, b) => a - b);
            q.after(tri(rnd, 2, 3, 5), () => { t.exit = q.now; });
            if (lv[tk] - reserved[tk] < p.truckT && reserved[tk] === 0) onEmpty(tk);
            dispatch();
          });
        });
      });
    }
  };

  const truckFlow = (t: TruckTrace) => {
    gate.request((gi) => {
      t.gateStart = q.now;
      q.after(tri(rnd, 3, 5, 9), () => {
        gate.release(gi);
        t.gateEnd = t.tareStart = t.tareEnd = t.prepStart = t.orderDone = t.qualityDone = q.now;
        waiting.push(t);
        maxQueue = Math.max(maxQueue, waiting.length);
        dispatch();
        if (shipTank(t.component) < 0) t.tankWait = -q.now; // пометка: продукта не было при постановке в очередь
      });
    });
  };

  /* ----- подъезд машин (поток с переменной интенсивностью, метод прореживания) ----- */
  const trucks: TruckTrace[] = [];
  const share92 = p.plan92 / Math.max(1, p.plan92 + p.plan95);
  const perMin = (((p.plan92 + p.plan95) / p.truckT) * p.supply) / (p.days * 1440);
  const fmax = p.profile === 'slots' ? 1 : 1.45 * 1.14;
  let tArr = 0, id = 1;
  const mkTruck = (at: number) => {
    const t: TruckTrace = {
      id: id++, plate: plate(rnd), component: rnd() < share92 ? 0 : 1, volume: p.truckT, arrive: at,
      gateStart: NaN, gateEnd: NaN, tareStart: NaN, tareEnd: NaN, prepStart: NaN, orderDone: NaN, qualityDone: NaN, readyAt: NaN,
      bay: -1, bayStart: NaN, fillStart: NaN, fillEnd: NaN, bayEnd: NaN, grossStart: NaN, grossEnd: NaN, exit: NaN, tankWait: 0, tank: -1
    };
    trucks.push(t);
    q.at(at, () => truckFlow(t));
  };
  if (perMin > 0) {
    if (p.profile === 'slots') {
      const step = 1 / perMin;
      for (tArr = step * rnd(); tArr < horizon; tArr += step) mkTruck(Math.max(0, tArr + (rnd() - 0.5) * step * 0.6));
    } else {
      for (;;) {
        tArr += expo(rnd, 1 / (perMin * fmax));
        if (tArr >= horizon) break;
        if (rnd() < arrivalFactor(tArr, p.profile) / fmax) mkTruck(tArr);
      }
    }
  }

  /* ----- срезы для графиков и 3D ----- */
  const tankSeries: TwinResult['tankSeries'] = [];
  const queueSeries: TwinResult['queueSeries'] = [];
  const snap = () => {
    tankSeries.push({ t: q.now, lv: tanks.map((t) => levelNow(t.id) / p.tankT), st: st.slice() });
    let onSite = 0;
    for (const t of trucks) if (t.arrive <= q.now && !(t.exit <= q.now)) onSite++;
    queueSeries.push({ t: q.now, onSite, waitingBay: waiting.length });
    if (q.now + 30 <= horizon) q.after(30, snap);
  };
  ([0, 1] as Grade[]).forEach((g) => { if (filling[g] != null) startFilling(g, filling[g]!); });
  q.at(0, snap);
  q.run(horizon);
  // закрываем открытые интервалы
  ([0, 1] as Grade[]).forEach((g) => {
    if (blockedSince[g] != null) { blocks.push({ grade: g, from: blockedSince[g]!, to: horizon }); lostT += rate[g] * (horizon - blockedSince[g]!); }
    if (filling[g] != null) produced[g] += levelNow(filling[g]!) - lv[filling[g]!];
  });
  accountPosts();
  gate.finish(horizon);

  // ожидание из-за отсутствия продукта
  for (const t of trucks) if (t.tankWait < 0) t.tankWait = Number.isFinite(t.bayStart) ? t.bayStart + t.tankWait : horizon + t.tankWait;

  const served = trucks.filter((t) => Number.isFinite(t.fillEnd));
  const waits = trucks.filter((t) => Number.isFinite(t.bayStart)).map((t) => t.bayStart - t.gateEnd).sort((a, b) => a - b);
  const stuck = trucks.filter((t) => Number.isFinite(t.gateEnd) && !Number.isFinite(t.bayStart)).map((t) => horizon - t.gateEnd);
  const idleMin = waits.reduce((s, w) => s + w, 0) + stuck.reduce((s, w) => s + w, 0);
  const shippedT = served.length * p.truckT;
  const producedT = produced[0] + produced[1];
  const planT = p.plan92 + p.plan95;
  const blockedHours = blocks.reduce((s, b) => s + (b.to - b.from), 0) / 60;
  const capacity = tanks.length * p.tankT;
  const minFree = tankSeries.length ? Math.min(...tankSeries.map((x) => 1 - x.lv.reduce((a, b) => a + b, 0) / Math.max(1, tanks.length))) : 1;
  const postUtil = postBusyTime / (horizon * Math.max(1, p.posts));
  const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
  void capacity;

  const daily: DayStat[] = Array.from({ length: p.days }, (_, d) => {
    const a = d * 1440, b = a + 1440;
    const dayTrucks = served.filter((t) => t.fillEnd >= a && t.fillEnd < b);
    const blk = blocks.reduce((s, x) => s + Math.max(0, Math.min(b, x.to) - Math.max(a, x.from)), 0) / 60;
    const mq = Math.max(0, ...queueSeries.filter((x) => x.t >= a && x.t < b).map((x) => x.waitingBay));
    return { day: d + 1, plan: planT / p.days, produced: ((rate[0] + rate[1]) * 1440) - blk * 60 * ((rate[0] + rate[1]) / 2), shipped: dayTrucks.length * p.truckT, trucks: dayTrucks.length, blockedH: blk, maxQueue: mq };
  });

  const bottleneck: TwinResult['metrics']['bottleneck'] = blockedHours > 4 ? 'tanks' : avgWait > 45 ? 'posts' : shippedT < producedT * 0.9 ? 'trucks' : 'none';
  events.sort((a, b) => a.t - b.t);

  return {
    params: p, horizon, trucks, tanks, tankSeries, blocks, events,
    resources: [
      { id: 'posts', label: RESOURCE_LABEL.posts, capacity: p.posts, utilization: Math.min(1, postUtil), avgWait, maxQueue },
      { id: 'gate', label: RESOURCE_LABEL.gate, capacity: 2, utilization: Math.min(1, gate.busyTime / (horizon * 2)), avgWait: gate.waitCount ? gate.waitSum / gate.waitCount : 0, maxQueue: gate.maxQueue }
    ],
    queueSeries, daily,
    metrics: {
      arrived: trucks.length, served: served.length, avgWait, p90Wait: waits.length ? waits[Math.floor(waits.length * 0.9)] : 0,
      maxQueue, idleHours: idleMin / 60, idleCost: (idleMin / 60) * p.idleRate,
      planT, producedT, shippedT, planDone: planT ? producedT / planT : 1, shippedShare: producedT ? shippedT / producedT : 1,
      blockedHours, lostT, minFree, postUtil: Math.min(1, postUtil), bottleneck,
      avgTurnaround: avgWait, volume: shippedT
    }
  };
}
