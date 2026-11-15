import type {
  EliminationEntry,
  ICInventory,
  SystemState,
} from '@consol/shared';
import { round2 } from '../seed/random.js';
import type { OwnershipInfo } from './ownership.js';

export interface UrpResult {
  id: string;
  sellerId: string;
  buyerId: string;
  direction: 'UPSTREAM' | 'DOWNSTREAM';
  inventoryCny: number;
  urpCny: number;
  entryId: string;
}

function closingRate(state: SystemState, month: string, currency: string): number {
  if (currency === 'CNY') return 1;
  return state.fxRates.find((r) => r.month === month && r.currency === currency)!.closingRate;
}

/**
 * 规则3：未实现内部利润抵消。
 * 数据蓝图中 inventoryBuyerFc 已是"期末仍留存的内部购入存货"（即已按留存比例计量），
 * urpSellerFc 为该批存货内含的卖方未实现利润。
 * 抵消分录：借 营业成本（恢复被内部加价虚增的成本）/ 贷 存货（剔除存货中未实现利润）。
 * 逆流交易（子公司卖给母公司/上层）形成的未实现利润，按比例分摊给少数股东。
 */
export function buildUrp(
  state: SystemState,
  month: string,
  ownership: Map<string, OwnershipInfo>,
): { results: UrpResult[]; entries: EliminationEntry[]; nciAdjustments: Map<string, number> } {
  const results: UrpResult[] = [];
  const entries: EliminationEntry[] = [];
  // 对每个卖方主体累计应归属少数股东的逆流未实现利润（负数冲减其 NCI 损益）
  const nciAdjustments = new Map<string, number>();

  for (const v of state.icInventory.filter((x) => x.month === month)) {
    const seller = state.entities.find((e) => e.id === v.sellerId)!;
    const buyer = state.entities.find((e) => e.id === v.buyerId)!;
    const inventoryCny = round2(v.inventoryBuyerFc * closingRate(state, month, buyer.functionalCurrency));
    const urpCny = round2(v.urpSellerFc * closingRate(state, month, seller.functionalCurrency));

    // 顺流：母公司/上层卖给下层；逆流：下层卖给上层。用持股链层级判断。
    const sellerTier = seller.tier;
    const buyerTier = buyer.tier;
    const direction: UrpResult['direction'] = sellerTier < buyerTier ? 'DOWNSTREAM' : 'UPSTREAM';

    const entry: EliminationEntry = {
      id: `EL-URP-${v.id}`,
      month,
      type: 'URP',
      summary:
        `抵消未实现内部利润：${v.sellerId}→${v.buyerId}，` +
        `期末留存内部存货 ${inventoryCny.toFixed(2)} 元，按留存比例测算内含未实现利润 ${urpCny.toFixed(2)} 元` +
        (direction === 'UPSTREAM' ? '（逆流交易，部分归属于少数股东）' : '（顺流交易，全部归属于母公司）'),
      dr: [{ line: 'cogs', amountCny: urpCny }],
      cr: [{ line: 'inventory', amountCny: urpCny }],
      source: 'system',
      sourceRefs: { kind: 'icInventory', ids: [v.id] },
      balanceCheck: 0,
    };
    entries.push(entry);
    results.push({
      id: v.id,
      sellerId: v.sellerId,
      buyerId: v.buyerId,
      direction,
      inventoryCny,
      urpCny,
      entryId: entry.id,
    });

    if (direction === 'UPSTREAM') {
      // 逆流交易：未实现利润体现在卖方（子公司）账上，NCI 按比例分担
      const info = ownership.get(v.sellerId);
      const nciPct = info ? 1 - info.effectiveOwnership : 0;
      const nciShare = round2(urpCny * nciPct);
      nciAdjustments.set(v.sellerId, (nciAdjustments.get(v.sellerId) ?? 0) + nciShare);
    }
  }

  return { results, entries, nciAdjustments };
}
