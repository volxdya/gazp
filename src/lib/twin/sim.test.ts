import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from './sim';
import { SCENARIOS } from './scenarios';
import { signToken, verifyToken, hashPassword, verifyPassword } from '../server/crypto';

test('модель детерминирована при одинаковом seed', () => {
  assert.deepEqual(simulate({ seed: 7 }).metrics, simulate({ seed: 7 }).metrics);
});

test('уровень в резервуарах всегда от 0 до 100%', () => {
  for (const sc of SCENARIOS) {
    const r = simulate(sc.params);
    for (const s of r.tankSeries) for (const v of s.lv) assert.ok(v >= -1e-9 && v <= 1 + 1e-9, `${sc.id}: ${v}`);
  }
});

test('машина наливается только из открытого резервуара своей марки', () => {
  const r = simulate();
  for (const t of r.trucks.filter((x) => Number.isFinite(x.bayStart))) {
    assert.ok(t.tank >= 0);
    assert.equal(r.tanks[t.tank].grade, t.component);
    assert.ok(t.gateEnd <= t.bayStart);
    if (Number.isFinite(t.exit)) assert.ok(t.fillStart <= t.fillEnd && t.bayEnd <= t.exit);
  }
});

test('на посту одновременно не больше одной машины', () => {
  const r = simulate({ days: 7 });
  const by = new Map<number, [number, number][]>();
  for (const t of r.trucks) if (t.bay >= 0) by.set(t.bay, [...(by.get(t.bay) ?? []), [t.bayStart, t.bayEnd]]);
  for (const l of by.values()) { l.sort((a, b) => a[0] - b[0]); for (let i = 1; i < l.length; i++) assert.ok(l[i][0] >= l[i - 1][1] - 1e-9); }
});

test('отгружено не больше, чем произведено плюс стартовый запас', () => {
  const r = simulate();
  const start = r.tankSeries[0].lv.reduce((a, b) => a + b, 0) * r.params.tankT;
  assert.ok(r.metrics.shippedT <= r.metrics.producedT + start + 1e-6);
});

test('нехватка машин приводит к затариванию и недовыпуску', () => {
  const base = simulate();
  const short = simulate({ supply: 0.85 });
  assert.ok(short.metrics.blockedHours > base.metrics.blockedHours + 10);
  assert.ok(short.metrics.lostT > 0 && short.metrics.planDone < base.metrics.planDone);
});

test('слоты 24/7 сокращают ожидание налива на нескольких seed', () => {
  for (const seed of [1, 7, 42]) {
    const a = simulate({ seed }), b = simulate({ seed, profile: 'slots' });
    assert.ok(b.metrics.avgWait < a.metrics.avgWait * 0.6, `seed ${seed}`);
  }
});

test('план месяца по умолчанию: 40 000 т АИ-92 и 30 000 т АИ-95', () => {
  const r = simulate();
  assert.equal(r.metrics.planT, 70000);
  assert.ok(Math.abs(r.metrics.arrived - 3500) < 150);
});

test('токен сессии подписывается и отвергается при подделке', async () => {
  const token = await signToken({ sub: 'u1', role: 'admin', name: 'Тест', exp: Date.now() + 60_000 });
  assert.equal((await verifyToken(token))?.role, 'admin');
  const forged = token.replace(/^[^.]+/, Buffer.from(JSON.stringify({ sub: 'u1', role: 'admin', name: 'X', exp: Date.now() + 1e9 })).toString('base64url'));
  assert.equal(await verifyToken(forged), null);
  assert.equal(await verifyToken(await signToken({ sub: 'u', role: 'guest', name: 'x', exp: Date.now() - 1 })), null);
});

test('пароль хранится как соль+хеш', async () => {
  const h = await hashPassword('Secret#123');
  assert.ok(!h.includes('Secret'));
  assert.equal(await verifyPassword('Secret#123', h), true);
  assert.equal(await verifyPassword('wrong', h), false);
});
