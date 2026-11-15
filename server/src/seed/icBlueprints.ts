/**
 * 内部往来/内部交易/内部存货的业务蓝图（生成器据此产生 12 个月明细）。
 * mismatch 用于故意把双方录入做成不一致，并预设差异原因，供核对页面列示。
 */

export interface BalanceBlueprint {
  id: string;
  debtorId: string; // 记内部应收
  creditorId: string; // 记内部应付
  baseAmount: number; // 债务人本位币基准余额
  note: string;
  mismatch?: { fromMonthIndex: number; reasonCode: string; apFactor: number };
}

export interface SaleBlueprint {
  id: string;
  sellerId: string;
  buyerId: string;
  monthlyBase: number; // 卖方本位币月均内部销售
  note: string;
  mismatch?: { fromMonthIndex: number; reasonCode: string; buyerFactor: number };
}

export interface InventoryBlueprint {
  id: string;
  sellerId: string;
  buyerId: string;
  inventoryBase: number; // 买方本位币期末留存存货基准
  retention: number; // 当期内部购入的留存比例（用于演示按比例抵消）
  urpRatio: number; // 存货内含毛利率（未实现利润占存货比）
}

/** 内部应收/应付配对（含跨境、跨币种） */
export const IC_BALANCE_BLUEPRINT: BalanceBlueprint[] = [
  { id: 'B01', debtorId: 'A1', creditorId: 'P', baseAmount: 12000, note: '集团资金拆借' },
  {
    id: 'B02', debtorId: 'B2', creditorId: 'A1', baseAmount: 8000, note: '内部货款挂账',
    mismatch: { fromMonthIndex: 4, reasonCode: 'TIMING', apFactor: 0.93 }, // 5月起在途差异
  },
  {
    id: 'B03', debtorId: 'B4', creditorId: 'B1', baseAmount: 6000, note: '境外子公司间美元往来，折算口径差异',
    mismatch: { fromMonthIndex: 0, reasonCode: 'FX', apFactor: 0.97 },
  },
  {
    id: 'B04', debtorId: 'A2', creditorId: 'P', baseAmount: 15000, note: '收购后并入的内部往来',
    mismatch: { fromMonthIndex: 5, reasonCode: 'OMISSION', apFactor: 0.88 }, // 6月起一方漏记
  },
  {
    id: 'B05', debtorId: 'D2', creditorId: 'B1', baseAmount: 5000, note: '新加坡与香港平台美元往来',
  },
  {
    id: 'B06', debtorId: 'C2', creditorId: 'A2', baseAmount: 4500, note: '收购对价之外的经营往来',
    mismatch: { fromMonthIndex: 6, reasonCode: 'AMOUNT', apFactor: 0.95 },
  },
  { id: 'B07', debtorId: 'E1', creditorId: 'B2', baseAmount: 3200, note: '第三层内部往来' },
  {
    id: 'B08', debtorId: 'D3', creditorId: 'C1', baseAmount: 4000, note: '欧元区内部往来',
    mismatch: { fromMonthIndex: 2, reasonCode: 'TIMING', apFactor: 0.96 },
  },
  {
    id: 'B09', debtorId: 'D1', creditorId: 'B3', baseAmount: 2800, note: '处置前内部往来，8月随处置清零核对',
  },
  { id: 'B10', debtorId: 'C3', creditorId: 'A2', baseAmount: 2600, note: '模具公司内部往来' },
];

/** 内部销售/采购配对（卖方收入 vs 买方采购，YTD 累计） */
export const IC_SALE_BLUEPRINT: SaleBlueprint[] = [
  { id: 'S01', sellerId: 'B2', buyerId: 'A1', monthlyBase: 5000, note: '部件内部供应' },
  {
    id: 'S02', sellerId: 'A1', buyerId: 'P', monthlyBase: 7000, note: '成品内部销售，买方暂估入账偏差',
    mismatch: { fromMonthIndex: 3, reasonCode: 'AMOUNT', buyerFactor: 0.94 },
  },
  {
    id: 'S03', sellerId: 'B1', buyerId: 'D2', monthlyBase: 3500, note: '香港转口贸易，美元口径差异',
    mismatch: { fromMonthIndex: 0, reasonCode: 'FX', buyerFactor: 1.03 },
  },
  {
    id: 'S04', sellerId: 'C1', buyerId: 'D3', monthlyBase: 2800, note: '欧洲装备内部调拨',
    mismatch: { fromMonthIndex: 5, reasonCode: 'TIMING', buyerFactor: 0.96 },
  },
  { id: 'S05', sellerId: 'B4', buyerId: 'B1', monthlyBase: 2600, note: '越南制造回销香港' },
  {
    id: 'S06', sellerId: 'C2', buyerId: 'A2', monthlyBase: 2400, note: '模具内部加工，采购方漏记部分批次',
    mismatch: { fromMonthIndex: 4, reasonCode: 'OMISSION', buyerFactor: 0.9 },
  },
  { id: 'S07', sellerId: 'E1', buyerId: 'B2', monthlyBase: 1800, note: '新材料第三层内部销售' },
  {
    id: 'S08', sellerId: 'B3', buyerId: 'D1', monthlyBase: 1500, note: '对拟处置子公司的内部销售，8月截止',
  },
  { id: 'S09', sellerId: 'C3', buyerId: 'C2', monthlyBase: 1200, note: '表面处理工序内部协作' },
  {
    id: 'S10', sellerId: 'D2', buyerId: 'B1', monthlyBase: 2000, note: '新加坡平台回拨，跨月确认差异',
    mismatch: { fromMonthIndex: 7, reasonCode: 'TIMING', buyerFactor: 0.92 },
  },
];

/** 期末仍留存于买方的内部购入存货（用于未实现内部利润抵消） */
export const IC_INVENTORY_BLUEPRINT: InventoryBlueprint[] = [
  { id: 'I01', sellerId: 'B2', buyerId: 'A1', inventoryBase: 6000, retention: 0.4, urpRatio: 0.25 },
  { id: 'I02', sellerId: 'A1', buyerId: 'P', inventoryBase: 8000, retention: 0.35, urpRatio: 0.22 },
  { id: 'I03', sellerId: 'B1', buyerId: 'D2', inventoryBase: 4000, retention: 0.5, urpRatio: 0.18 },
  { id: 'I04', sellerId: 'C1', buyerId: 'D3', inventoryBase: 3200, retention: 0.45, urpRatio: 0.2 },
  { id: 'I05', sellerId: 'C2', buyerId: 'A2', inventoryBase: 2600, retention: 0.4, urpRatio: 0.24 },
  { id: 'I06', sellerId: 'E1', buyerId: 'B2', inventoryBase: 2000, retention: 0.3, urpRatio: 0.26 },
];
