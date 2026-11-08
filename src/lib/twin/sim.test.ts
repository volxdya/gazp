import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from './sim';
import { SCENARIOS } from './scenarios';
import { signToken, verifyToken, hashPassword, verifyPassword } from '../server/crypto';

test('модель детерминирована при одинаковом seed', () => {
  const a = simulate({ seed: 7 });
  const b = simulate({ seed: 7 });
  assert.deepEqual(a.metrics, b.metrics);
});

test('цистерна сливается только после входного контроля и в порядке этапов', () => {
  for (const sc of SCENARIOS) {
    const r = simulate(sc.params);
    for (const t of r.trucks.filter((x) => Number.isFinite(x.fillStart))) {
      assert.ok(t.qualityDone <= t.fillStart, `${sc.id}: ${t.plate} слита до одобрения пробы`);
      assert.ok(t.gateEnd <= t.tareStart && t.tareEnd <= t.bayStart && t.bayEnd <= t.grossStart && t.grossEnd <= t.exit);
    }
  }
});

test('уровень в резервуарах не выходит за пределы ёмкости', () => {
  for (const seed of [1, 7, 42]) for (const sc of SCENARIOS) {
    const r = simulate({ ...sc.params, seed });
    for (const l of r.levelSeries) {
      assert.ok(l.a >= -1e-9 && l.a <= 1 + 1e-9, `A=${l.a}`);
      assert.ok(l.b >= -1e-9 && l.b <= 1 + 1e-9, `B=${l.b}`);
    }
  }
});

test('партия фасуется только после смешивания и контроля качества', () => {
  const r = simulate();
  for (const b of r.batches.filter((x) => Number.isFinite(x.lineStart))) {
    assert.ok(b.feedEnd <= b.blendStart && b.blendEnd <= b.qcStart && b.qcEnd <= b.lineStart && b.lineEnd <= b.done);
  }
});

test('на посту слива одновременно не больше одной цистерны', () => {
  const r = simulate({ bays: 2, trucksPerHour: 3 });
  const byBay = new Map<number, [number, number][]>();
  for (const t of r.trucks) if (t.bay >= 0) byBay.set(t.bay, [...(byBay.get(t.bay) ?? []), [t.bayStart, t.bayEnd]]);
  for (const list of byBay.values()) {
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < list.length; i++) assert.ok(list[i][0] >= list[i - 1][1] - 1e-9);
  }
});

test('загрузка ресурсов в пределах 0..100%', () => {
  const r = simulate({ trucksPerHour: 4, batches: 14 });
  for (const x of r.resources) assert.ok(x.utilization >= 0 && x.utilization <= 1, x.id);
});

test('комплексный сценарий: оборот короче, план и маржа не хуже — на нескольких seed', () => {
  for (const seed of [1, 7, 42, 99]) {
    const base = simulate({ ...SCENARIOS[0].params, seed });
    const smart = simulate({ ...SCENARIOS[3].params, seed });
    assert.ok(smart.metrics.avgTurnaround < base.metrics.avgTurnaround * 0.75, `seed ${seed}: оборот`);
    assert.ok(smart.metrics.planDone >= base.metrics.planDone, `seed ${seed}: план`);
    assert.ok(smart.metrics.margin > base.metrics.margin, `seed ${seed}: маржа`);
  }
});

test('третий пост слива не увеличивает выпуск — узкое место в цехе', () => {
  const base = simulate(SCENARIOS[0].params);
  const bay = simulate(SCENARIOS[1].params);
  assert.equal(bay.metrics.batchesDone, base.metrics.batchesDone);
  assert.ok(bay.metrics.margin < base.metrics.margin);
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
