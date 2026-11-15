import type {
  ICBalancePair,
  ICSalePair,
  ICInventory,
  LegalEntity,
  TrialBalanceLine,
  LineCode,
} from '@consol/shared';
import { MONTHS, monthIndex } from '@consol/shared';
import { ENTITIES, ENTITY_MAP } from './entities.js';
import { mulberry32, hashString, roundInt } from './random.js';
import {
  IC_BALANCE_BLUEPRINT,
  IC_SALE_BLUEPRINT,
  IC_INVENTORY_BLUEPRINT,
} from './icBlueprints.js';
import { ACQUISITION_SNAPSHOTS } from './acquisitionSnapshots.js';
import { OWNERSHIP } from './ownership.js';

/** 某主体账上对各直接被投资单位的长期股权投资（成本法，CNY；外币主体按其本位币近似列示） */
const INVESTMENT_BY_HOLDER: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const edge of OWNERSHIP) {
    const snap = ACQUISITION_SNAPSHOTS.find((s) => s.entityId === edge.investeeId);
    if (!snap) continue;
    map[edge.shareholderId] = (map[edge.shareholderId] ?? 0) + snap.consideration;
  }
  return map;
})();

function investmentByHolder(entityId: string): number {
  return INVESTMENT_BY_HOLDER[entityId] ?? 0;
}

/** 主体经营规模（本位币，月度基准量级） */
const SCALE: Record<string, number> = {
  P: 90000,
  A1: 42000, A2: 30000, B1: 18000, C1: 12000, F1: 20000,
  B2: 16000, B3: 12000, B4: 9000, C2: 11000, C3: 8000,
  D2: 7000, D3: 6000, E1: 9000, D1: 7000,
};

/** 该主体在该月是否处于集团报告期内（A2 系 4 月起；D1 8 月止） */
function isActive(e: LegalEntity, month: string): boolean {
  const i = monthIndex(month);
  if (e.acquiredMonth && i < monthIndex(e.acquiredMonth)) return false;
  if (e.disposedMonth && i > monthIndex(e.disposedMonth)) return false;
  return true;
}

interface RawIC {
  balances: ICBalancePair[];
  sales: ICSalePair[];
  inventory: ICInventory[];
}

/** 生成 12 个月内部往来/内部交易/留存存货数据，故意制造双方不一致并标注差异原因 */
function generateIC(): RawIC {
  const balances: ICBalancePair[] = [];
  const sales: ICSalePair[] = [];
  const inventory: ICInventory[] = [];

  for (const bp of IC_BALANCE_BLUEPRINT) {
    for (const month of MONTHS) {
      const debtor = ENTITY_MAP[bp.debtorId];
      const creditor = ENTITY_MAP[bp.creditorId];
      if (!isActive(debtor, month) || !isActive(creditor, month)) continue;
      const rng = mulberry32(hashString(`bal|${bp.id}|${month}`));
      const i = monthIndex(month);
      // 债务人内部应收余额（债务人本位币），随业务温和增长
      const base = bp.baseAmount * (1 + 0.03 * i) * (0.92 + rng() * 0.16);
      const arAmountFc = roundInt(base);
      let apAmountFc = arAmountFc;
      let reasonCode = 'NONE';
      if (bp.mismatch && i >= bp.mismatch.fromMonthIndex) {
        reasonCode = bp.mismatch.reasonCode;
        // 债权人账面金额按预设偏差（如 -6%），形成双方不一致
        apAmountFc = roundInt(arAmountFc * bp.mismatch.apFactor);
      }
      balances.push({
        id: `BAL-${bp.id}-${month}`,
        month,
        debtorId: bp.debtorId,
        creditorId: bp.creditorId,
        arAmountFc,
        apAmountFc,
        reasonCode,
        note: reasonCode === 'NONE' ? undefined : `${bp.note}（${reasonCode}）`,
      });
    }
  }

  for (const sp of IC_SALE_BLUEPRINT) {
    for (const month of MONTHS) {
      const seller = ENTITY_MAP[sp.sellerId];
      const buyer = ENTITY_MAP[sp.buyerId];
      if (!isActive(seller, month) || !isActive(buyer, month)) continue;
      const rng = mulberry32(hashString(`sale|${sp.id}|${month}`));
      const i = monthIndex(month);
      // YTD 累计内部销售（卖方本位币）
      const ytd = roundInt(sp.monthlyBase * (i + 1) * (0.95 + rng() * 0.1));
      let buyerPurchaseFc = ytd;
      let reasonCode = 'NONE';
      if (sp.mismatch && i >= sp.mismatch.fromMonthIndex) {
        reasonCode = sp.mismatch.reasonCode;
        buyerPurchaseFc = roundInt(ytd * sp.mismatch.buyerFactor);
      }
      sales.push({
        id: `SAL-${sp.id}-${month}`,
        month,
        sellerId: sp.sellerId,
        buyerId: sp.buyerId,
        sellerRevenueFc: ytd,
        buyerPurchaseFc,
        reasonCode,
        note: reasonCode === 'NONE' ? undefined : `${sp.note}（${reasonCode}）`,
      });
    }
  }

  for (const ip of IC_INVENTORY_BLUEPRINT) {
    for (const month of MONTHS) {
      const seller = ENTITY_MAP[ip.sellerId];
      const buyer = ENTITY_MAP[ip.buyerId];
      if (!isActive(seller, month) || !isActive(buyer, month)) continue;
      const rng = mulberry32(hashString(`inv|${ip.id}|${month}`));
      const i = monthIndex(month);
      // 期末留存存货（买方本位币），内含未实现利润（卖方本位币）
      const inventoryBuyerFc = roundInt(ip.inventoryBase * (1 + 0.02 * i) * (0.9 + rng() * 0.2));
      const urpSellerFc = roundInt(inventoryBuyerFc * ip.urpRatio * 0.85);
      inventory.push({
        id: `INV-${ip.id}-${month}`,
        month,
        sellerId: ip.sellerId,
        buyerId: ip.buyerId,
        inventoryBuyerFc,
        urpSellerFc,
        note: `留存比例约${Math.round(ip.retention * 100)}%，毛利率${Math.round(ip.urpRatio * 100)}%`,
      });
    }
  }

  return { balances, sales, inventory };
}

/** 汇总某主体某月的内部往来余额（本位币） */
function sumIcBalanceForEntity(raw: RawIC, entityId: string, month: string) {
  let icAr = 0;
  let icAp = 0;
  for (const b of raw.balances) {
    if (b.month !== month) continue;
    if (b.debtorId === entityId) icAr += b.arAmountFc;
    if (b.creditorId === entityId) icAp += b.apAmountFc;
  }
  return { icAr, icAp };
}

/** 汇总某主体某月内部购销 YTD（本位币） */
function sumIcSaleForEntity(raw: RawIC, entityId: string, month: string) {
  let icRevenue = 0;
  let icPurchase = 0;
  for (const s of raw.sales) {
    if (s.month !== month) continue;
    if (s.sellerId === entityId) icRevenue += s.sellerRevenueFc;
    if (s.buyerId === entityId) icPurchase += s.buyerPurchaseFc;
  }
  return { icRevenue, icPurchase };
}

function sumIcInventoryForEntity(raw: RawIC, entityId: string, month: string) {
  let inv = 0;
  for (const v of raw.inventory) {
    if (v.month !== month) continue;
    if (v.buyerId === entityId) inv += v.inventoryBuyerFc;
  }
  return inv;
}

/**
 * 生成全部主体 12 个月试算表（本位币、整数、YTD 累计口径，BS 为时点数）。
 * 每张表用留存收益轧平，保证 资产 = 负债 + 所有者权益。
 */
export function generateTrialBalance(raw?: RawIC): {
  tb: TrialBalanceLine[];
  ic: RawIC;
} {
  const ic = raw ?? generateIC();
  const tb: TrialBalanceLine[] = [];

  const push = (entityId: string, month: string, line: LineCode, amount: number) => {
    tb.push({ entityId, month, line, amount: roundInt(amount) });
  };

  for (const e of ENTITIES) {
    for (const month of MONTHS) {
      if (!isActive(e, month)) continue;
      const rng = mulberry32(hashString(`${e.id}|${month}`));
      const i = monthIndex(month);
      const scale = SCALE[e.id] ?? 10000;
      const growth = 1 + 0.04 * i;
      const jitter = 0.9 + rng() * 0.2;
      const vol = scale * growth * jitter; // 当月经营量

      // ===== 利润表（YTD 累计） =====
      const { icRevenue } = sumIcSaleForEntity(ic, e.id, month);
      const { icPurchase } = sumIcSaleForEntity(ic, e.id, month);
      const totalRevenueYtd = vol * (i + 1) * 1.6;
      const revenue = Math.max(0, totalRevenueYtd - icRevenue);
      const cogsExternal = Math.max(0, totalRevenueYtd * 0.62 - icPurchase);
      const icCogs = icRevenue * 0.7; // 内部销售对应成本（卖方）
      const expenses = totalRevenueYtd * (0.12 + rng() * 0.03);
      const profitBeforeTax =
        totalRevenueYtd - cogsExternal - icCogs - expenses;
      const tax = Math.max(0, profitBeforeTax * 0.25);

      // ===== 资产负债表（时点数） =====
      const { icAr, icAp: icAp0 } = sumIcBalanceForEntity(ic, e.id, month);
      const icInv = sumIcInventoryForEntity(ic, e.id, month);
      const cash = vol * 0.9 + 4000;
      const ar = vol * 0.55;
      const inventory = vol * 0.5 + icInv;
      const ppe = vol * 1.4 + 20000;
      const otherAssets = vol * 0.25 + 3000;
      // 长期股权投资按成本法列示：对各直接被投资单位的合并成本之和（与收购快照勾稽，
      // 合并时与子公司收购日权益抵消；联营 F1 不纳入合并，其投资在合并报表保留）
      const icInvestment = investmentByHolder(e.id);

      const ap = vol * 0.45;
      const icAp = icAp0;
      const otherLiab = vol * 0.35 + 5000;
      const paidInCapital = scale * 2.2;
      const capitalReserve = scale * 0.5;

      const totalAssets =
        cash + ar + icAr + inventory + ppe + otherAssets + icInvestment;
      const totalLiab = ap + icAp + otherLiab;

      // 本年 YTD 净利润（含内部交易，个别报表层面）
      const netProfit = profitBeforeTax - tax;
      // 用留存收益轧平：RE = 资产 - 负债 - 实收资本 - 资本公积
      // 再加一部分历史滚存，保证为正且大于本年利润
      const retainedEarnings =
        totalAssets - totalLiab - paidInCapital - capitalReserve;

      // ---- 写入利润表 ----
      push(e.id, month, 'revenue', revenue);
      push(e.id, month, 'ic_revenue', icRevenue);
      push(e.id, month, 'cogs', cogsExternal);
      push(e.id, month, 'ic_cogs', icCogs);
      push(e.id, month, 'expenses', expenses);
      push(e.id, month, 'tax', tax);
      push(e.id, month, 'net_profit', netProfit);
      push(e.id, month, 'nci_pl', 0); // 个别报表无少数股东损益
      push(e.id, month, 'parent_pl', netProfit);

      // ---- 写入资产负债表 ----
      push(e.id, month, 'cash', cash);
      push(e.id, month, 'ar', ar);
      push(e.id, month, 'ic_ar', icAr);
      push(e.id, month, 'inventory', inventory);
      push(e.id, month, 'ppe', ppe);
      push(e.id, month, 'ic_investment', icInvestment);
      push(e.id, month, 'other_assets', otherAssets);
      push(e.id, month, 'total_assets', totalAssets);
      push(e.id, month, 'ap', ap);
      push(e.id, month, 'ic_ap', icAp);
      push(e.id, month, 'other_liab', otherLiab);
      push(e.id, month, 'total_liab', totalLiab);
      push(e.id, month, 'paid_in_capital', paidInCapital);
      push(e.id, month, 'capital_reserve', capitalReserve);
      push(e.id, month, 'retained_earnings', retainedEarnings);
      push(e.id, month, 'cta', 0); // 个别报表折算前无折算差额
      push(e.id, month, 'nci', 0); // 个别报表无少数股东权益
      push(e.id, month, 'total_equity', paidInCapital + capitalReserve + retainedEarnings);
    }
  }

  return { tb, ic };
}

export { generateIC };
