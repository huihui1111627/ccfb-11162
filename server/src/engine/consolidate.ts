import type {
  ConsolidationResult,
  EliminationEntry,
  LineCode,
  SystemState,
} from '@consol/shared';
import { LINE_DEFS } from '@consol/shared';
import { determineScope, computeOwnership } from './ownership.js';
import { translateAll } from './translation.js';
import { buildReconciliations } from './reconciliation.js';
import { buildUrp } from './urp.js';
import { buildInvestmentAndNci } from './investments.js';
import { buildWorksheet } from './worksheet.js';
import { buildProfitCarry } from './profitCarry.js';
import { round2 } from '../seed/random.js';

/**
 * 合并总入口：按月份执行完整合并流程
 * 范围判定 → 外币折算 → 内部核对/抵消 → 未实现利润 → 投资抵消/NCI → 合并底稿 → 校验
 */
export function consolidate(state: SystemState, month: string): ConsolidationResult {
  // 1) 合并范围（规则1、规则6）
  const scope = determineScope(state.entities, state.ownership, month);
  const ownership = computeOwnership(state.entities, state.ownership);

  // 2) 外币折算（规则4）
  const translated = translateAll(state, scope, month);

  // 3) 内部往来/购销核对与抵消（规则2）
  const { rows: reconciliations, entries: reconEntries } = buildReconciliations(state, month);

  // 4) 未实现内部利润（规则3）
  const { results: urp, entries: urpEntries, nciAdjustments } = buildUrp(state, month, ownership);

  // 5) 投资抵消与少数股东（规则5）
  const { entries: invEntries, nciRows } = buildInvestmentAndNci(
    state, month, translated, ownership, nciAdjustments,
  );

  // 6) 手工调整分录（规则7：必须填理由）
  const manualEntries = state.manualEntries.filter((e) => e.month === month);

  const baseEntries: EliminationEntry[] = [
    ...reconEntries,
    ...urpEntries,
    ...invEntries,
    ...manualEntries,
  ];

  // 6.1) 利润表抵消事项结转留存收益，保证合并资产负债表配平
  const carryEntry = buildProfitCarry(baseEntries, month);
  const entries: EliminationEntry[] =
    carryEntry.dr.length > 0 || carryEntry.cr.length > 0
      ? [...baseEntries, carryEntry]
      : baseEntries;

  // 7) 合并底稿（规则8）
  const { rows: worksheet } = buildWorksheet(translated, entries);

  // 8) 少数股东损益写入利润表派生行（在合并数层面单列）
  const totalNciPl = round2(nciRows.reduce((s, r) => s + r.nciPlCny, 0));
  const wsMap = new Map(worksheet.map((r) => [r.line, r]));
  const nciPlRow = wsMap.get('nci_pl');
  if (nciPlRow) nciPlRow.consolidated = totalNciPl;
  const npRow = wsMap.get('net_profit')!;
  const parentPlRow = wsMap.get('parent_pl')!;
  parentPlRow.consolidated = round2(npRow.consolidated - totalNciPl);

  // 9) 校验
  const checks = runChecks(entries, worksheet, scope, translated);

  return {
    month,
    scope,
    translated,
    reconciliations,
    urp,
    entries,
    nci: nciRows,
    worksheet,
    checks,
  };
}

function runChecks(
  entries: EliminationEntry[],
  worksheet: ReturnType<typeof buildWorksheet>['rows'],
  scope: ConsolidationResult['scope'],
  translated: ConsolidationResult['translated'],
): ConsolidationResult['checks'] {
  const checks: ConsolidationResult['checks'] = [];
  const ws = new Map(worksheet.map((r) => [r.line, r]));
  const num = (c: LineCode) => ws.get(c)?.consolidated ?? 0;

  // 校验1：每笔分录借贷平衡
  const unbalanced = entries.filter((e) => Math.abs(e.balanceCheck) > 0.01);
  checks.push({
    name: '抵消分录借贷平衡',
    ok: unbalanced.length === 0,
    detail:
      unbalanced.length === 0
        ? `${entries.length} 笔分录全部借贷平衡`
        : `不平衡分录：${unbalanced.map((e) => `${e.id}(差${e.balanceCheck})`).join('；')}`,
  });

  // 校验2：合并资产负债表 资产 = 负债 + 权益
  const assets = num('total_assets');
  const liab = num('total_liab');
  const equity = num('total_equity');
  const bsDiff = round2(assets - liab - equity);
  checks.push({
    name: '合并资产负债表配平（资产=负债+所有者权益）',
    ok: Math.abs(bsDiff) <= 0.05,
    detail: `资产 ${assets.toFixed(2)} = 负债 ${liab.toFixed(2)} + 权益 ${equity.toFixed(2)}，差额 ${bsDiff.toFixed(2)}`,
  });

  // 校验3：各主体折算后个别报表自身配平
  const badEntity = translated.filter((t) => {
    const L = t.lines;
    const a =
      (L.cash ?? 0) + (L.ar ?? 0) + (L.ic_ar ?? 0) + (L.inventory ?? 0) +
      (L.ppe ?? 0) + (L.ic_investment ?? 0) + (L.other_assets ?? 0);
    const l = (L.ap ?? 0) + (L.ic_ap ?? 0) + (L.other_liab ?? 0);
    const q =
      (L.paid_in_capital ?? 0) + (L.capital_reserve ?? 0) +
      (L.retained_earnings ?? 0) + (L.cta ?? 0);
    return Math.abs(a - l - q) > 0.05;
  });
  checks.push({
    name: '各主体折算后个别报表配平',
    ok: badEntity.length === 0,
    detail:
      badEntity.length === 0
        ? `${translated.length} 家纳入主体折算后全部配平`
        : `不配平主体：${badEntity.map((t) => t.entityId).join('、')}`,
  });

  // 校验4：合并范围主体数量
  const included = scope.filter((s) => s.included).length;
  checks.push({
    name: '合并范围完整',
    ok: included === translated.length,
    detail: `纳入合并 ${included} 家，实际折算汇总 ${translated.length} 家；联营 F1 不纳入`,
  });

  // 校验5：利润表勾稽 净利润 = 归属母公司 + 少数股东损益
  const np = num('net_profit');
  const pp = num('parent_pl');
  const ncipl = num('nci_pl');
  const isDiff = round2(np - pp - ncipl);
  checks.push({
    name: '利润表勾稽（净利润=母公司份额+少数股东损益）',
    ok: Math.abs(isDiff) <= 0.05,
    detail: `净利润 ${np.toFixed(2)} = 母公司 ${pp.toFixed(2)} + 少数股东 ${ncipl.toFixed(2)}，差额 ${isDiff.toFixed(2)}`,
  });

  return checks;
}
