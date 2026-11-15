import type {
  EliminationEntry,
  FxRate,
  ICBalancePair,
  ICSalePair,
  ReconciliationRow,
  SystemState,
} from '@consol/shared';
import { DIFF_REASONS } from '@consol/shared';
import { round2 } from '../seed/random.js';

function closingRate(state: SystemState, month: string, currency: string): number {
  if (currency === 'CNY') return 1;
  const fx = state.fxRates.find((r) => r.month === month && r.currency === currency) as FxRate;
  return fx.closingRate;
}

/**
 * 规则2：内部应收应付、内部销售采购双方金额核对。
 * 双方按自身记账本位币报送 → 统一按期末汇率折算 CNY → 逐项对比，
 * 列出折算后金额、可抵消额（取较小者）、差额及差异原因。
 */
export function buildReconciliations(
  state: SystemState,
  month: string,
): { rows: ReconciliationRow[]; entries: EliminationEntry[] } {
  const rows: ReconciliationRow[] = [];
  const entries: EliminationEntry[] = [];

  // ===== 内部应收 / 应付 =====
  for (const b of state.icBalances.filter((x) => x.month === month)) {
    const debtor = state.entities.find((e) => e.id === b.debtorId)!;
    const creditor = state.entities.find((e) => e.id === b.creditorId)!;
    const arCny = round2(b.arAmountFc * closingRate(state, month, debtor.functionalCurrency));
    const apCny = round2(b.apAmountFc * closingRate(state, month, creditor.functionalCurrency));
    const matched = round2(Math.min(arCny, apCny));
    const diff = round2(arCny - apCny);
    const reasonCode = b.reasonCode ?? 'NONE';

    const entry = makeBalanceEntry(b, matched);
    entries.push(entry);
    rows.push({
      id: b.id,
      month,
      kind: 'BALANCE',
      partyA: `${b.debtorId}（${debtor.name}·应收）`,
      partyB: `${b.creditorId}（${creditor.name}·应付）`,
      amountA: arCny,
      amountB: apCny,
      matchedAmount: matched,
      difference: diff,
      reasonCode,
      reasonLabel: DIFF_REASONS[reasonCode] ?? reasonCode,
      note: b.note,
      entryId: entry.id,
    });
  }

  // ===== 内部销售 / 采购 =====
  for (const s of state.icSales.filter((x) => x.month === month)) {
    const seller = state.entities.find((e) => e.id === s.sellerId)!;
    const buyer = state.entities.find((e) => e.id === s.buyerId)!;
    const revCny = round2(s.sellerRevenueFc * closingRate(state, month, seller.functionalCurrency));
    const purCny = round2(s.buyerPurchaseFc * closingRate(state, month, buyer.functionalCurrency));
    const matched = round2(Math.min(revCny, purCny));
    const diff = round2(revCny - purCny);
    const reasonCode = s.reasonCode ?? 'NONE';

    const entry = makeSaleEntry(s, matched);
    entries.push(entry);
    rows.push({
      id: s.id,
      month,
      kind: 'SALE',
      partyA: `${s.sellerId}（${seller.name}·销售收入）`,
      partyB: `${s.buyerId}（${buyer.name}·采购）`,
      amountA: revCny,
      amountB: purCny,
      matchedAmount: matched,
      difference: diff,
      reasonCode,
      reasonLabel: DIFF_REASONS[reasonCode] ?? reasonCode,
      note: s.note,
      entryId: entry.id,
    });
  }

  return { rows, entries };
}

/** 内部往来抵消：借 内部应付 / 贷 内部应收（按可核对一致的金额，差额挂账待查，不强行抵消） */
function makeBalanceEntry(b: ICBalancePair, matchedCny: number): EliminationEntry {
  const dr = matchedCny > 0 ? [{ line: 'ic_ap' as const, amountCny: matchedCny }] : [];
  const cr = matchedCny > 0 ? [{ line: 'ic_ar' as const, amountCny: matchedCny }] : [];
  return {
    id: `EL-BAL-${b.id}`,
    month: b.month,
    type: 'IC_BALANCE',
    summary: `抵消内部往来：${b.debtorId} 应收 vs ${b.creditorId} 应付（按核对一致金额）`,
    dr,
    cr,
    source: 'system',
    sourceRefs: { kind: 'icBalancePair', ids: [b.id] },
    balanceCheck: 0,
  };
}

/** 内部购销抵消：借 内部销售收入 / 贷 营业成本（按可核对一致金额） */
function makeSaleEntry(s: ICSalePair, matchedCny: number): EliminationEntry {
  const dr = matchedCny > 0 ? [{ line: 'ic_revenue' as const, amountCny: matchedCny }] : [];
  const cr = matchedCny > 0 ? [{ line: 'cogs' as const, amountCny: matchedCny }] : [];
  return {
    id: `EL-SAL-${s.id}`,
    month: s.month,
    type: 'IC_SALE',
    summary: `抵消内部销售：${s.sellerId} 收入 vs ${s.buyerId} 采购（按核对一致金额）`,
    dr,
    cr,
    source: 'system',
    sourceRefs: { kind: 'icSalePair', ids: [s.id] },
    balanceCheck: 0,
  };
}
