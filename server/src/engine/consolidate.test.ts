import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MONTHS, CHART_OF_ACCOUNTS } from '@consol/shared';
import { buildSeedState } from '../seed/index.js';
import { consolidate } from './consolidate.js';
import { determineScope, computeOwnership } from './ownership.js';
import { buildManualWorkbook } from '../manual/manualWorkbook.js';

const state = buildSeedState();

describe('规则1 合并范围：控制权判断', () => {
  test('持股不过半但协议控制的 A2、D1 纳入合并并写明依据', () => {
    const r = consolidate(state, '2026-05');
    const a2 = r.scope.find((s) => s.entityId === 'A2')!;
    assert.equal(a2.included, true);
    assert.match(a2.basis, /实质控制权|一致行动/);
    assert.ok(a2.effectiveOwnership! <= 0.5);
    const d1 = r.scope.find((s) => s.entityId === 'D1')!;
    assert.equal(d1.included, true);
    assert.match(d1.basis, /经营管理委托协议|实质控制/);
  });

  test('联营 F1 持股40%不具控制权，不纳入合并', () => {
    const r = consolidate(state, '2026-05');
    const f1 = r.scope.find((s) => s.entityId === 'F1')!;
    assert.equal(f1.included, false);
    assert.match(f1.basis, /不具有控制权|联营/);
  });

  test('有效持股为链条连乘：B4 有效持股=80%×75%=60%', () => {
    const info = computeOwnership(state.entities, state.ownership);
    assert.equal(Math.round(info.get('B4')!.effectiveOwnership * 10000), 6000);
  });
});

describe('规则6 年中收购与处置按时间并入', () => {
  test('A2/C2 4月收购：3月不纳入、4月起纳入', () => {
    const mar = determineScope(state.entities, state.ownership, '2026-03');
    const apr = determineScope(state.entities, state.ownership, '2026-04');
    assert.equal(mar.find((s) => s.entityId === 'A2')!.included, false);
    assert.equal(apr.find((s) => s.entityId === 'A2')!.included, true);
    assert.equal(apr.find((s) => s.entityId === 'C2')!.included, true);
    const countMar = mar.filter((s) => s.included).length;
    const countApr = apr.filter((s) => s.included).length;
    assert.equal(countApr - countMar, 2);
  });

  test('D1 8月处置：8月仍纳入、9月起出表', () => {
    const aug = determineScope(state.entities, state.ownership, '2026-08');
    const sep = determineScope(state.entities, state.ownership, '2026-09');
    assert.equal(aug.find((s) => s.entityId === 'D1')!.included, true);
    assert.equal(sep.find((s) => s.entityId === 'D1')!.included, false);
  });
});

describe('规则4 外币折算', () => {
  test('USD/EUR 主体产生非零折算差额，CNY 主体折算差额为0', () => {
    const r = consolidate(state, '2026-08');
    const b1 = r.translated.find((t) => t.entityId === 'B1')!;
    const p = r.translated.find((t) => t.entityId === 'P')!;
    assert.ok(Math.abs(b1.ctaCny) > 1);
    assert.ok(Math.abs(p.ctaCny) < 0.01);
  });

  test('资产按期末汇率、利润表按平均汇率折算', () => {
    const r = consolidate(state, '2026-08');
    const b1 = r.translated.find((t) => t.entityId === 'B1')!;
    const fx = state.fxRates.find((x) => x.month === '2026-08' && x.currency === 'USD')!;
    const cashFc = state.trialBalance.find((t) => t.entityId === 'B1' && t.month === '2026-08' && t.line === 'cash')!.amount;
    const revFc = state.trialBalance.find((t) => t.entityId === 'B1' && t.month === '2026-08' && t.line === 'revenue')!.amount;
    assert.equal(b1.lines.cash, Math.round(cashFc * fx.closingRate * 100) / 100);
    assert.equal(b1.lines.revenue, Math.round(revFc * fx.averageRate * 100) / 100);
  });
});

describe('规则2 内部核对与差额原因', () => {
  test('双方不一致的配对列出非零差额和原因代码', () => {
    const r = consolidate(state, '2026-08');
    const mismatched = r.reconciliations.filter((x) => Math.abs(x.difference) > 0.01);
    assert.ok(mismatched.length > 0);
    for (const m of mismatched) {
      assert.ok(m.reasonCode && m.reasonCode !== 'NONE');
      assert.ok(m.reasonLabel.length > 0);
    }
  });

  test('抵消按核对一致金额（较小者），差额不强行抵消', () => {
    const r = consolidate(state, '2026-08');
    const row = r.reconciliations.find((x) => x.kind === 'BALANCE' && Math.abs(x.difference) > 0.01)!;
    assert.equal(row.matchedAmount, Math.min(row.amountA, row.amountB));
  });
});

describe('规则3 未实现内部利润', () => {
  test('每条留存存货生成 借营业成本/贷存货 的URP抵消分录', () => {
    const r = consolidate(state, '2026-08');
    assert.ok(r.urp.length > 0);
    for (const u of r.urp) {
      const e = r.entries.find((x) => x.id === u.entryId)!;
      assert.equal(e.dr[0].line, 'cogs');
      assert.equal(e.cr[0].line, 'inventory');
      assert.equal(e.dr[0].amountCny, u.urpCny);
    }
  });

  test('逆流交易方向识别正确（卖方层级高于买方）', () => {
    const r = consolidate(state, '2026-08');
    const up = r.urp.filter((u) => u.direction === 'UPSTREAM');
    for (const u of up) {
      const seller = state.entities.find((e) => e.id === u.sellerId)!;
      const buyer = state.entities.find((e) => e.id === u.buyerId)!;
      assert.ok(seller.tier > buyer.tier);
    }
  });
});

describe('规则5 少数股东权益与损益', () => {
  test('非全资子公司 NCI 比例 = 1 - 有效持股，金额为正', () => {
    const r = consolidate(state, '2026-08');
    const a1 = r.nci.find((n) => n.entityId === 'A1')!;
    assert.equal(Math.round(a1.nciPct * 100), 20);
    assert.ok(a1.nciEquityCny > 0);
    assert.ok(a1.nciPlCny > 0);
  });

  test('全资子公司 B1、D2 的 NCI 比例与金额均为 0', () => {
    const r = consolidate(state, '2026-08');
    for (const id of ['B1', 'D2']) {
      const row = r.nci.find((n) => n.entityId === id)!;
      assert.equal(row.nciPct, 0);
      assert.equal(row.nciEquityCny, 0);
      assert.equal(row.nciPlCny, 0);
    }
  });
});

describe('规则7 可追溯与手工调整', () => {
  test('系统分录均带来源单据引用', () => {
    const r = consolidate(state, '2026-08');
    for (const e of r.entries.filter((x) => x.source === 'system')) {
      assert.ok(e.sourceRefs.ids.length > 0, `${e.id} 缺少来源引用`);
    }
  });
});

describe('规则8 合并底稿与整体校验', () => {
  test('底稿每行包含个别数、抵消借/贷、合并数四栏', () => {
    const r = consolidate(state, '2026-08');
    for (const row of r.worksheet) {
      assert.ok(typeof row.individual === 'number');
      assert.ok(typeof row.elimDr === 'number');
      assert.ok(typeof row.elimCr === 'number');
      assert.ok(typeof row.consolidated === 'number');
    }
  });

  test('全年12个月：资产负债表配平、利润表勾稽、分录平衡', () => {
    for (const m of MONTHS) {
      const r = consolidate(state, m);
      for (const c of r.checks) {
        assert.equal(c.ok, true, `${m} ${c.name}: ${c.detail}`);
      }
    }
  });
});

describe('手工底稿独立核对', () => {
  test('2026-08 手工重算与系统结果全部报表行逐项一致', () => {
    const wb = buildManualWorkbook(state);
    assert.equal(wb.comparison.length, CHART_OF_ACCOUNTS.length);
    assert.equal(wb.allMatch, true);
    const bad = wb.comparison.filter((c) => !c.match);
    assert.equal(bad.length, 0);
  });
});
