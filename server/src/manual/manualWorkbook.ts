import type {
  ConsolidationResult,
  LineCode,
  ManualWorkbook,
  SystemState,
  WorksheetRow,
} from '@consol/shared';
import { CHART_OF_ACCOUNTS, LINE_DEFS } from '@consol/shared';
import { consolidate } from '../engine/consolidate.js';
import { round2 } from '../seed/random.js';

/**
 * 独立手工合并底稿（2026-08）。
 * 不调用引擎的汇总逻辑，只从原始种子数据出发，按合并准则手工分步重算：
 *   步骤1 按控制权确定合并范围（人工逐户判断并写明依据）
 *   步骤2 各户报表按期末/平均汇率折算 CNY，轧算折算差额
 *   步骤3 汇总个别数
 *   步骤4 内部往来/购销按核对一致金额编制抵消分录
 *   步骤5 期末留存存货的未实现内部利润抵消
 *   步骤6 长投与子公司收购日权益抵消、商誉、少数股东权益
 *   步骤7 少数股东损益（含逆流交易分摊）
 *   步骤8 利润表抵消结转留存收益
 *   步骤9 逐行得出合并数
 * 最后与引擎结果逐项对比。
 */
const MANUAL_MONTH = '2026-08';

interface ManualStep {
  title: string;
  detail: string;
}

export function buildManualWorkbook(state: SystemState): ManualWorkbook {
  const steps: ManualStep[] = [];
  const system: ConsolidationResult = consolidate(state, MANUAL_MONTH);

  // ---------- 步骤1：合并范围（人工判断） ----------
  const manualScope = manualDetermineScope(state, MANUAL_MONTH, steps);

  // ---------- 步骤2：逐户折算（独立实现，与引擎 translation 无关） ----------
  const translated = manualTranslate(state, manualScope, MANUAL_MONTH, steps);

  // ---------- 步骤3：汇总个别数 ----------
  const individual = new Map<LineCode, number>();
  for (const [id, lines] of translated) {
    for (const def of CHART_OF_ACCOUNTS) {
      individual.set(def.code, round2((individual.get(def.code) ?? 0) + (lines.get(def.code) ?? 0)));
    }
    void id;
  }
  steps.push({
    title: '步骤3 汇总个别报表数',
    detail: `将 ${translated.size} 家纳入主体折算后的 CNY 报表逐行加总，得到合并底稿"个别数"栏。`,
  });

  // ---------- 步骤4-8：手工编制抵消分录（独立重算金额） ----------
  const elim = new Map<LineCode, { dr: number; cr: number }>();
  const bump = (code: LineCode, dr: number, cr: number) => {
    const cur = elim.get(code) ?? { dr: 0, cr: 0 };
    cur.dr = round2(cur.dr + dr);
    cur.cr = round2(cur.cr + cr);
    elim.set(code, cur);
  };

  manualEliminateBalances(state, MANUAL_MONTH, bump, steps);
  manualEliminateSales(state, MANUAL_MONTH, bump, steps);
  const upstreamNci = manualEliminateUrp(state, MANUAL_MONTH, bump, steps);
  manualEliminateInvestments(state, MANUAL_MONTH, translated, bump, steps);
  const nciPlTotal = manualNci(state, MANUAL_MONTH, translated, upstreamNci, bump, steps);
  const carry = manualProfitCarry(state, MANUAL_MONTH, bump, steps);

  // ---------- 步骤9：逐行合并数 ----------
  const manualRows = CHART_OF_ACCOUNTS.map((def) => {
    const ind = individual.get(def.code) ?? 0;
    const el = elim.get(def.code) ?? { dr: 0, cr: 0 };
    let consolidated: number;
    if (def.derived) {
      consolidated = manualDerived(def.code, (c) => lineValue(c, individual, elim));
    } else {
      consolidated =
        def.kind === 'debit'
          ? round2(ind + el.dr - el.cr)
          : round2(ind + el.cr - el.dr);
    }
    return { line: def.code, label: def.label, individual: round2(ind), elimDr: el.dr, elimCr: el.cr, consolidated };
  });

  // 少数股东损益单列、重算归母净利润
  const rowMap = new Map(manualRows.map((r) => [r.line, r]));
  rowMap.get('nci_pl')!.consolidated = round2(nciPlTotal);
  rowMap.get('parent_pl')!.consolidated = round2(rowMap.get('net_profit')!.consolidated - nciPlTotal);

  // ---------- 与系统逐项核对 ----------
  const sysMap = new Map<LineCode, WorksheetRow>(system.worksheet.map((r) => [r.line, r]));
  const comparison = manualRows.map((r) => {
    const sys = sysMap.get(r.line)!;
    const diff = round2(r.consolidated - sys.consolidated);
    return {
      line: r.line,
      label: r.label,
      manual: r.consolidated,
      system: sys.consolidated,
      diff,
      match: Math.abs(diff) <= 0.05,
    };
  });
  const allMatch = comparison.every((c) => c.match);

  const totalAssets = rowMap.get('total_assets')!.consolidated;
  const totalLiab = rowMap.get('total_liab')!.consolidated;
  const totalEquity = rowMap.get('total_equity')!.consolidated;

  const metrics = [
    { name: '纳入合并主体数', value: translated.size, formula: '控制权判断：14家（含4月收购A2/C2，不含联营F1，D1处置月仍纳入）' },
    { name: '合并资产总计', value: totalAssets, formula: '各资产行折算汇总 ± 抵消' },
    { name: '合并负债合计', value: totalLiab, formula: '各负债行折算汇总 ± 抵消' },
    { name: '合并所有者权益合计', value: totalEquity, formula: '母公司权益 + 少数股东权益 + 折算差额' },
    { name: '配平差额(资产-负债-权益)', value: round2(totalAssets - totalLiab - totalEquity), formula: '应为 0' },
    { name: '少数股东损益合计', value: round2(nciPlTotal), formula: 'Σ子公司净利润×NCI% − 逆流URP×NCI%' },
    { name: '利润结转留存收益', value: carry, formula: '利润表抵消事项对净利润的影响结转' },
  ];

  return { month: MANUAL_MONTH, steps, manualRows, metrics, comparison, allMatch };
}

// ================= 手工各步骤（独立实现） =================

function manualDetermineScope(state: SystemState, month: string, steps: ManualStep[]): string[] {
  const mIdx = Number(month.split('-')[1]) - 1;
  const included: string[] = [];
  const lines: string[] = [];
  for (const e of state.entities) {
    if (e.tier === 0) {
      included.push(e.id);
      continue;
    }
    // 沿持股链找母公司路径并计算有效持股与控制
    const path = findPath(state, 'P', e.id);
    if (!path) continue;
    let pct = 1;
    let controlled = true;
    for (let k = 0; k < path.length - 1; k++) {
      const edge = state.ownership.find((o) => o.shareholderId === path[k] && o.investeeId === path[k + 1])!;
      pct *= edge.directPct;
      controlled = controlled && edge.hasControl;
    }
    const acquired = e.acquiredMonth ? mIdx >= Number(e.acquiredMonth.split('-')[1]) - 1 : true;
    const disposed = e.disposedMonth ? mIdx <= Number(e.disposedMonth.split('-')[1]) - 1 : true;
    const inPeriod = acquired && disposed;
    if (controlled && inPeriod) {
      included.push(e.id);
      lines.push(`· ${e.id} ${e.name}：有效持股 ${(pct * 100).toFixed(2)}%，${pct <= 0.5 ? '持股未过半但协议实质控制，' : ''}纳入合并`);
    } else {
      lines.push(`· ${e.id} ${e.name}：${!controlled ? '不具控制权（联营），不纳入' : '不在报告期，不纳入'}`);
    }
  }
  steps.push({
    title: '步骤1 合并范围判定（控制权基础）',
    detail: `纳入 ${included.length} 家：${included.join('、')}。\n` + lines.join('\n'),
  });
  return included;
}

function findPath(state: SystemState, from: string, to: string): string[] | null {
  if (from === to) return [from];
  for (const edge of state.ownership.filter((o) => o.shareholderId === from)) {
    const sub = findPath(state, edge.investeeId, to);
    if (sub) return [from, ...sub];
  }
  return null;
}

function manualTranslate(
  state: SystemState,
  scope: string[],
  month: string,
  steps: ManualStep[],
): Map<string, Map<LineCode, number>> {
  const out = new Map<string, Map<LineCode, number>>();
  let ctaTotal = 0;
  for (const entityId of scope) {
    const entity = state.entities.find((e) => e.id === entityId)!;
    const cur = entity.functionalCurrency;
    const closing = cur === 'CNY' ? 1 : state.fxRates.find((r) => r.month === month && r.currency === cur)!.closingRate;
    const average = cur === 'CNY' ? 1 : state.fxRates.find((r) => r.month === month && r.currency === cur)!.averageRate;
    const firstMonth = entity.acquiredMonth ?? state.fxRates[0].month;
    const historical = cur === 'CNY' ? 1 : state.fxRates.find((r) => r.month === firstMonth && r.currency === cur)!.closingRate;

    const fc = new Map<LineCode, number>();
    for (const tb of state.trialBalance) {
      if (tb.entityId === entityId && tb.month === month) fc.set(tb.line, tb.amount);
    }
    const cn = new Map<LineCode, number>();
    const assetCodes: LineCode[] = ['cash', 'ar', 'ic_ar', 'inventory', 'ppe', 'ic_investment', 'other_assets'];
    const liabCodes: LineCode[] = ['ap', 'ic_ap', 'other_liab'];
    for (const c of assetCodes) cn.set(c, round2((fc.get(c) ?? 0) * closing));
    for (const c of liabCodes) cn.set(c, round2((fc.get(c) ?? 0) * closing));
    cn.set('paid_in_capital', round2((fc.get('paid_in_capital') ?? 0) * historical));
    cn.set('capital_reserve', round2((fc.get('capital_reserve') ?? 0) * historical));
    cn.set('retained_earnings', round2((fc.get('retained_earnings') ?? 0) * average));
    const isCodes: LineCode[] = ['revenue', 'ic_revenue', 'cogs', 'ic_cogs', 'expenses', 'tax', 'nci_pl'];
    for (const c of isCodes) cn.set(c, round2((fc.get(c) ?? 0) * average));

    const assets = assetCodes.reduce((s, c) => s + cn.get(c)!, 0);
    const liab = liabCodes.reduce((s, c) => s + cn.get(c)!, 0);
    const ctaRaw = assets - liab - cn.get('paid_in_capital')! - cn.get('capital_reserve')! - cn.get('retained_earnings')!;
    let cta: number;
    if (cur === 'CNY') {
      cta = 0;
      cn.set('retained_earnings', round2(cn.get('retained_earnings')! + ctaRaw));
    } else {
      cta = round2(ctaRaw);
    }
    cn.set('cta', cta);
    ctaTotal = round2(ctaTotal + cta);
    cn.set('total_assets', round2(assets));
    cn.set('total_liab', round2(liab));
    cn.set('total_equity', round2(assets - liab));
    cn.set('nci', 0);
    cn.set('net_profit', round2(
      cn.get('revenue')! + cn.get('ic_revenue')! - cn.get('cogs')! - cn.get('ic_cogs')! - cn.get('expenses')! - cn.get('tax')!,
    ));
    cn.set('parent_pl', cn.get('net_profit')!);
    out.set(entityId, cn);
  }
  steps.push({
    title: '步骤2 外币报表折算（期末汇率/平均汇率）',
    detail:
      '资产负债按期末汇率、收入费用按平均汇率、实收资本/资本公积按历史汇率折算，' +
      `折算差额轧差计入"外币报表折算差额"。本月折算差额合计 ${ctaTotal.toFixed(2)} 元（CNY 主体为 0，USD/EUR 主体产生）。`,
  });
  return out;
}

function rateClosing(state: SystemState, month: string, currency: string): number {
  if (currency === 'CNY') return 1;
  return state.fxRates.find((r) => r.month === month && r.currency === currency)!.closingRate;
}

function manualEliminateBalances(state: SystemState, month: string, bump: (c: LineCode, d: number, c2: number) => void, steps: ManualStep[]) {
  let total = 0;
  let diffTotal = 0;
  for (const b of state.icBalances.filter((x) => x.month === month)) {
    const debtor = state.entities.find((e) => e.id === b.debtorId)!;
    const creditor = state.entities.find((e) => e.id === b.creditorId)!;
    const ar = round2(b.arAmountFc * rateClosing(state, month, debtor.functionalCurrency));
    const ap = round2(b.apAmountFc * rateClosing(state, month, creditor.functionalCurrency));
    const matched = round2(Math.min(ar, ap));
    bump('ic_ap', matched, 0);
    bump('ic_ar', 0, matched);
    total = round2(total + matched);
    diffTotal = round2(diffTotal + Math.abs(ar - ap));
  }
  steps.push({
    title: '步骤4a 内部应收应付抵消',
    detail: `双方金额折 CNY 后按较小者（核对一致部分）抵消，借 内部应付 / 贷 内部应收，本月抵消 ${total.toFixed(2)} 元；` +
      `未抵消差额合计 ${diffTotal.toFixed(2)} 元保留挂账并在核对页标注原因（在途/汇率/漏记/金额差异）。`,
  });
}

function manualEliminateSales(state: SystemState, month: string, bump: (c: LineCode, d: number, c2: number) => void, steps: ManualStep[]) {
  let total = 0;
  for (const s of state.icSales.filter((x) => x.month === month)) {
    const seller = state.entities.find((e) => e.id === s.sellerId)!;
    const buyer = state.entities.find((e) => e.id === s.buyerId)!;
    const rev = round2(s.sellerRevenueFc * rateClosing(state, month, seller.functionalCurrency));
    const pur = round2(s.buyerPurchaseFc * rateClosing(state, month, buyer.functionalCurrency));
    const matched = round2(Math.min(rev, pur));
    bump('ic_revenue', matched, 0);
    bump('cogs', 0, matched);
    total = round2(total + matched);
  }
  steps.push({
    title: '步骤4b 内部销售收入与采购抵消',
    detail: `按核对一致金额抵消，借 内部销售收入 / 贷 营业成本，本月抵消 ${total.toFixed(2)} 元，双方差额列示原因不强行抵消。`,
  });
}

function manualEliminateUrp(state: SystemState, month: string, bump: (c: LineCode, d: number, c2: number) => void, steps: ManualStep[]): Map<string, number> {
  const upstreamNci = new Map<string, number>();
  let total = 0;
  for (const v of state.icInventory.filter((x) => x.month === month)) {
    const seller = state.entities.find((e) => e.id === v.sellerId)!;
    const buyer = state.entities.find((e) => e.id === v.buyerId)!;
    const urp = round2(v.urpSellerFc * rateClosing(state, month, seller.functionalCurrency));
    bump('cogs', urp, 0);
    bump('inventory', 0, urp);
    total = round2(total + urp);
    if (seller.tier > buyer.tier) {
      // 逆流：找卖方有效 NCI%
      const path = findPath(state, 'P', seller.id)!;
      let pct = 1;
      for (let k = 0; k < path.length - 1; k++) {
        pct *= state.ownership.find((o) => o.shareholderId === path[k] && o.investeeId === path[k + 1])!.directPct;
      }
      upstreamNci.set(seller.id, round2((upstreamNci.get(seller.id) ?? 0) + urp * (1 - pct)));
    }
  }
  steps.push({
    title: '步骤5 未实现内部利润抵消（按存货留存比例）',
    detail: `对期末仍留存于买方的内部购入存货，按内含毛利抵消未实现利润，借 营业成本 / 贷 存货，本月 ${total.toFixed(2)} 元；` +
      '逆流交易形成的部分按少数股东比例分摊。',
  });
  return upstreamNci;
}

function manualEliminateInvestments(
  state: SystemState,
  month: string,
  translated: Map<string, Map<LineCode, number>>,
  bump: (c: LineCode, d: number, c2: number) => void,
  steps: ManualStep[],
) {
  let goodwill = 0;
  for (const [entityId, cn] of translated) {
    if (entityId === 'P') continue;
    const snap = state.acquisitionSnapshots.find((s) => s.entityId === entityId)!;
    const path = findPath(state, 'P', entityId)!;
    let pct = 1;
    for (let k = 0; k < path.length - 1; k++) {
      pct *= state.ownership.find((o) => o.shareholderId === path[k] && o.investeeId === path[k + 1])!.directPct;
    }
    const nciPct = 1 - pct;
    // 收购日/期初权益抵消
    bump('paid_in_capital', snap.paidInCapital, 0);
    bump('capital_reserve', snap.capitalReserve, 0);
    bump('retained_earnings', snap.retainedEarnings, 0);
    bump('other_assets', snap.goodwill, 0);
    bump('ic_investment', 0, snap.consideration);
    bump('nci', 0, snap.nciAtAcquisition);
    goodwill = round2(goodwill + snap.goodwill);
    // 收购后净资产增量的 NCI 份额
    const equityNow = round2(cn.get('paid_in_capital')! + cn.get('capital_reserve')! + cn.get('retained_earnings')! + cn.get('cta')!);
    const post = round2(equityNow - snap.netAssetsAtAcquisition);
    const nciPost = round2(post * nciPct);
    const ctaNci = round2((cn.get('cta') ?? 0) * nciPct);
    const reNci = round2(nciPost - ctaNci);
    if (reNci >= 0) bump('retained_earnings', reNci, 0);
    else bump('retained_earnings', 0, -reNci);
    if (ctaNci >= 0) bump('cta', ctaNci, 0);
    else bump('cta', 0, -ctaNci);
    bump('nci', 0, Math.abs(nciPost));
  }
  steps.push({
    title: '步骤6 长期股权投资与子公司权益抵消',
    detail: `借 子公司收购日实收资本/资本公积/留存收益 + 商誉（${goodwill.toFixed(2)} 元），贷 长期股权投资（合并成本）、贷 少数股东权益（收购日份额）；` +
      '收购后净资产增量再按 NCI 比例重分类至少数股东权益。',
  });
}

function manualNci(
  state: SystemState,
  month: string,
  translated: Map<string, Map<LineCode, number>>,
  upstreamNci: Map<string, number>,
  bump: (c: LineCode, d: number, c2: number) => void,
  steps: ManualStep[],
): number {
  let total = 0;
  for (const [entityId, cn] of translated) {
    if (entityId === 'P') continue;
    const path = findPath(state, 'P', entityId)!;
    let pct = 1;
    for (let k = 0; k < path.length - 1; k++) {
      pct *= state.ownership.find((o) => o.shareholderId === path[k] && o.investeeId === path[k + 1])!.directPct;
    }
    const nciPct = 1 - pct;
    const nciPl = round2(cn.get('net_profit')! * nciPct - (upstreamNci.get(entityId) ?? 0));
    total = round2(total + nciPl);
  }
  void bump;
  steps.push({
    title: '步骤7 少数股东损益',
    detail: `逐户按 子公司折算后净利润 × 少数股东比例 计算，逆流交易未实现利润按 NCI 比例冲减，本月少数股东损益合计 ${total.toFixed(2)} 元，单列于利润表。`,
  });
  return total;
}

function manualProfitCarry(
  state: SystemState,
  month: string,
  bump: (c: LineCode, d: number, c2: number) => void,
  steps: ManualStep[],
): number {
  // 利润表侧抵消对净利润的影响：内部销售抵消（收入借/成本贷，净额）、URP（成本借）
  let delta = 0;
  for (const s of state.icSales.filter((x) => x.month === month)) {
    const seller = state.entities.find((e) => e.id === s.sellerId)!;
    const buyer = state.entities.find((e) => e.id === s.buyerId)!;
    const rev = round2(s.sellerRevenueFc * rateClosing(state, month, seller.functionalCurrency));
    const pur = round2(s.buyerPurchaseFc * rateClosing(state, month, buyer.functionalCurrency));
    delta -= Math.min(rev, pur); // 借收入 -m，贷成本 +m → 对净利润净影响 0
    delta += Math.min(rev, pur);
  }
  for (const v of state.icInventory.filter((x) => x.month === month)) {
    const seller = state.entities.find((e) => e.id === v.sellerId)!;
    delta -= round2(v.urpSellerFc * rateClosing(state, month, seller.functionalCurrency)); // 借成本，减少利润
  }
  delta = round2(delta);
  if (delta < 0) bump('retained_earnings', -delta, 0);
  else if (delta > 0) bump('retained_earnings', 0, delta);
  steps.push({
    title: '步骤8 利润表抵消事项结转留存收益',
    detail: `内部销售抵消对净利润净影响为 0（收入与成本同额对冲）；未实现利润抵消使净利润减少 ${Math.abs(delta).toFixed(2)} 元，借 留存收益，保证资产负债表配平。`,
  });
  return delta;
}

function lineValue(code: LineCode, individual: Map<LineCode, number>, elim: Map<LineCode, { dr: number; cr: number }>): number {
  const def = LINE_DEFS[code];
  const ind = individual.get(code) ?? 0;
  const el = elim.get(code) ?? { dr: 0, cr: 0 };
  return def.kind === 'debit' ? round2(ind + el.dr - el.cr) : round2(ind + el.cr - el.dr);
}

function manualDerived(code: LineCode, valueOf: (c: LineCode) => number): number {
  switch (code) {
    case 'total_assets':
      return round2(['cash', 'ar', 'ic_ar', 'inventory', 'ppe', 'ic_investment', 'other_assets'].reduce((s, c) => s + valueOf(c as LineCode), 0));
    case 'total_liab':
      return round2(['ap', 'ic_ap', 'other_liab'].reduce((s, c) => s + valueOf(c as LineCode), 0));
    case 'total_equity':
      return round2(['paid_in_capital', 'capital_reserve', 'retained_earnings', 'cta', 'nci'].reduce((s, c) => s + valueOf(c as LineCode), 0));
    case 'net_profit':
      return round2(valueOf('revenue') + valueOf('ic_revenue') - valueOf('cogs') - valueOf('ic_cogs') - valueOf('expenses') - valueOf('tax'));
    case 'parent_pl':
      return round2(valueOf('net_profit') - valueOf('nci_pl'));
    default:
      return 0;
  }
}
