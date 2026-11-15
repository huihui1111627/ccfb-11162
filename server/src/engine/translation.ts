import type {
  FxRate,
  LineCode,
  SystemState,
  TranslatedEntity,
} from '@consol/shared';
import { BS_LINES, LINE_DEFS } from '@consol/shared';
import { round2 } from '../seed/random.js';
import type { ScopeDecision } from '@consol/shared';

/**
 * 规则4：外币报表折算。
 * - 资产、负债：期末汇率（closingRate）
 * - 利润表收入、费用：期间平均汇率（averageRate）
 * - 实收资本/资本公积：历史汇率（简化按收购/设立时点，这里用首月期末汇率）
 * - 折算差额 = 按期末汇率折算的净资产 - 各权益项目按各自汇率折算数，进 cta（其他综合收益）
 * CNY 主体汇率恒为 1，折算差额为 0。
 */
export function translateAll(
  state: SystemState,
  scope: ScopeDecision[],
  month: string,
): TranslatedEntity[] {
  const includedIds = new Set(scope.filter((s) => s.included).map((s) => s.entityId));
  return state.entities
    .filter((e) => includedIds.has(e.id))
    .map((e) => translateEntity(state, e.id, month));
}

function rateFor(state: SystemState, month: string, currency: string): FxRate {
  if (currency === 'CNY') {
    return { month, currency: 'CNY', closingRate: 1, averageRate: 1 } as unknown as FxRate;
  }
  const found = state.fxRates.find((r) => r.month === month && r.currency === currency);
  if (!found) throw new Error(`缺少汇率: ${currency} @ ${month}`);
  return found;
}

/** 历史汇率：取该主体报告期首月的期末汇率 */
function historicalRate(state: SystemState, entityId: string, month: string): number {
  const entity = state.entities.find((x) => x.id === entityId)!;
  if (entity.functionalCurrency === 'CNY') return 1;
  const firstMonth = entity.acquiredMonth ?? state.fxRates[0].month;
  const r = state.fxRates.find((x) => x.month === firstMonth && x.currency === entity.functionalCurrency);
  // 若主体在首月之前就存在但当月才被查询，仍用其首月期末汇率
  const rMonth = state.fxRates.find((x) => x.currency === entity.functionalCurrency)!;
  return r?.closingRate ?? rMonth.closingRate;
}

export function translateEntity(
  state: SystemState,
  entityId: string,
  month: string,
): TranslatedEntity {
  const entity = state.entities.find((x) => x.id === entityId)!;
  const fx = rateFor(state, month, entity.functionalCurrency);
  const histRate = historicalRate(state, entityId, month);
  const lines: Partial<Record<LineCode, number>> = {};

  const tbMap = new Map<LineCode, number>();
  for (const tb of state.trialBalance) {
    if (tb.entityId === entityId && tb.month === month) tbMap.set(tb.line, tb.amount);
  }

  const put = (code: LineCode, value: number) => {
    lines[code] = round2(value);
  };

  // 1) 资产负债表：资产/负债按期末汇率
  for (const code of BS_LINES) {
    const def = LINE_DEFS[code];
    const fc = tbMap.get(code) ?? 0;
    if (def.derived) continue; // 派生行折算后重算
    if (code === 'paid_in_capital' || code === 'capital_reserve') {
      put(code, fc * histRate); // 权益性投入按历史汇率
    } else if (code === 'cta' || code === 'nci') {
      put(code, 0); // 折算层单独算 cta；nci 在合并层算
    } else {
      put(code, fc * fx.closingRate);
    }
  }

  // 2) 利润表：全部按平均汇率
  for (const [code, fc] of tbMap) {
    const def = LINE_DEFS[code];
    if (def.section !== 'IS' || def.derived) continue;
    put(code, fc * fx.averageRate);
  }
  // 派生 IS 行按折算后重算
  const revenue = (lines.revenue ?? 0) + (lines.ic_revenue ?? 0);
  const costs =
    (lines.cogs ?? 0) + (lines.ic_cogs ?? 0) + (lines.expenses ?? 0) + (lines.tax ?? 0);
  put('net_profit', revenue - costs);
  put('nci_pl', 0);
  put('parent_pl', revenue - costs);

  // 3) 折算差额 CTA：
  // 期末净资产（资产-负债，按期末汇率） - 实收资本/资本公积（历史汇率） - 留存收益（轧平项，见下）
  const assetCodes: LineCode[] = ['cash', 'ar', 'ic_ar', 'inventory', 'ppe', 'ic_investment', 'other_assets'];
  const liabCodes: LineCode[] = ['ap', 'ic_ap', 'other_liab'];
  const totalAssets = assetCodes.reduce((s, c) => s + (lines[c] ?? 0), 0);
  const totalLiab = liabCodes.reduce((s, c) => s + (lines[c] ?? 0), 0);
  const netAssetsClosing = totalAssets - totalLiab;

  const paidIn = lines.paid_in_capital ?? 0;
  const capitalReserve = lines.capital_reserve ?? 0;
  // 留存收益折算：本位币 RE × 平均汇率（利润形成口径，简化处理），保证 CTA 为净资产轧差
  const reFc = tbMap.get('retained_earnings') ?? 0;
  const retainedEarnings = round2(reFc * fx.averageRate);
  put('retained_earnings', retainedEarnings);

  const ctaRaw = netAssetsClosing - paidIn - capitalReserve - retainedEarnings;
  let cta: number;
  if (entity.functionalCurrency === 'CNY') {
    // CNY 主体无外币折算差额：各行分位四舍五入的轧差并入留存收益，保证 CTA 严格为 0 且报表配平
    cta = 0;
    const adjustedRe = round2(retainedEarnings + ctaRaw);
    put('retained_earnings', adjustedRe);
  } else {
    cta = round2(ctaRaw);
  }
  put('cta', cta);

  // 4) 重算 BS 派生合计
  put('total_assets', round2(totalAssets));
  put('total_liab', round2(totalLiab));
  put('total_equity', round2(paidIn + capitalReserve + retainedEarnings + cta));
  put('nci', 0);

  return {
    entityId,
    month,
    functionalCurrency: entity.functionalCurrency,
    included: true,
    lines,
    ctaCny: cta,
  };
}
