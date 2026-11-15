/**
 * 合并报表系统共享领域模型
 * 金额约定：各主体账面金额以其记账本位币列示；合并层统一折算为人民币 CNY。
 * 报表口径：月报报送的是【年初至本月末的累计数(YTD)】，资产负债表为时点数。
 */

export type Currency = 'CNY' | 'USD' | 'EUR';

/** 月份，格式 YYYY-MM */
export type Month = string;

/** 折算方向：外币 1 单位 = rate 人民币 */
export interface FxRate {
  month: Month;
  currency: Exclude<Currency, 'CNY'>;
  /** 期末汇率（资产负债表项目） */
  closingRate: number;
  /** 期间平均汇率（利润表项目） */
  averageRate: number;
}

/** 报表行项目代码 */
export type LineCode =
  // 资产负债表
  | 'cash'
  | 'ar'
  | 'ic_ar'
  | 'inventory'
  | 'ppe'
  | 'ic_investment'
  | 'other_assets'
  | 'total_assets'
  | 'ap'
  | 'ic_ap'
  | 'other_liab'
  | 'total_liab'
  | 'paid_in_capital'
  | 'capital_reserve'
  | 'retained_earnings'
  | 'cta'
  | 'nci'
  | 'total_equity'
  // 利润表
  | 'revenue'
  | 'ic_revenue'
  | 'cogs'
  | 'ic_cogs'
  | 'expenses'
  | 'tax'
  | 'net_profit'
  | 'nci_pl'
  | 'parent_pl';

export type StatementSection = 'BS' | 'IS';
/** debit=借方科目（资产/成本费用），credit=贷方科目（负债/权益/收入） */
export type LineKind = 'debit' | 'credit';

export interface LineDef {
  code: LineCode;
  label: string;
  section: StatementSection;
  kind: LineKind;
  /** 派生行（小计/合计），不由主体直接报送 */
  derived?: boolean;
}

/** 持股关系：shareholder 直接持有 investee 的 pct%（0~1） */
export interface OwnershipEdge {
  shareholderId: string;
  investeeId: string;
  directPct: number;
  /** 是否拥有实质控制权（协议控制/董事会多数等），用于持股不过半但纳入合并的情形 */
  hasControl: boolean;
  controlNote?: string;
}

export interface LegalEntity {
  id: string;
  name: string;
  /** 记账本位币 */
  functionalCurrency: Currency;
  /** 集团层级：0=母公司 */
  tier: number;
  /** 年中收购：自该月起纳入（含当月，按月折算）；null=期初已在集团内 */
  acquiredMonth: Month | null;
  /** 年中处置：该月处置，处置后次月起出表；null=期末仍在集团内 */
  disposedMonth: Month | null;
  /** 主体备注，例如控制权依据 */
  note?: string;
}

/** 单家主体单月报送的一行（本位币、YTD 累计口径，BS 为时点数） */
export interface TrialBalanceLine {
  entityId: string;
  month: Month;
  line: LineCode;
  /** 正数报送；借贷方向由 LineDef.kind 决定 */
  amount: number;
}

/**
 * 内部往来（资金/应收应付）一条配对。
 * 债务方账上记内部应收(ic_ar)，债权方账上记内部应付(ic_ap)，
 * 双方各按自身记账本位币报送，折算为 CNY 后核对。
 */
export interface ICBalancePair {
  id: string;
  month: Month;
  /** 债务人（记内部应收的一方） */
  debtorId: string;
  /** 债权人（记内部应付的一方） */
  creditorId: string;
  /** 债务人账面内部应收，债务人本位币 */
  arAmountFc: number;
  /** 债权人账面内部应付，债权人本位币 */
  apAmountFc: number;
  /** 双方差异原因代码（见 DIFF_REASONS），空表示未标注 */
  reasonCode?: string;
  note?: string;
}

/**
 * 内部购销一条配对：卖方确认内部收入，买方确认内部采购（含于营业成本/存货）。
 * 各按自身本位币报送 YTD 累计数，折算 CNY 后核对。
 */
export interface ICSalePair {
  id: string;
  month: Month;
  sellerId: string;
  buyerId: string;
  /** 卖方账面内部销售收入 YTD，卖方本位币 */
  sellerRevenueFc: number;
  /** 买方账面内部采购额 YTD，买方本位币 */
  buyerPurchaseFc: number;
  reasonCode?: string;
  note?: string;
}

/**
 * 期末仍留存于买方的内部购入存货，及其内含的未实现内部利润。
 * inventoryBuyerFc：买方账上该批存货余额（买方本位币，时点数）
 * urpSellerFc：该存货中内含的卖方未实现利润（卖方本位币）
 */
export interface ICInventory {
  id: string;
  month: Month;
  sellerId: string;
  buyerId: string;
  inventoryBuyerFc: number;
  urpSellerFc: number;
  note?: string;
}

/** 差异原因代码字典 */
export const DIFF_REASONS: Record<string, string> = {
  NONE: '无差异',
  TIMING: '时间性差异：在途单据/跨月入账，下月应自动消除',
  FX: '汇率差异：双方按各自记账本位币折算口径不同形成',
  OMISSION: '漏记差异：一方已入账另一方尚未入账，需补记',
  AMOUNT: '金额差异：开票/结算金额不一致，需核对原始单据',
};

/** 分录行 */
export interface EntryLine {
  line: LineCode;
  amountCny: number;
}

/** 抵消/调整分录（合并层，金额均为 CNY） */
export interface EliminationEntry {
  id: string;
  month: Month;
  /** 分录类型 */
  type:
    | 'IC_BALANCE'
    | 'IC_SALE'
    | 'URP'
    | 'INVESTMENT'
    | 'NCI'
    | 'PROFIT_CARRY'
    | 'FX_RECLASS'
    | 'MANUAL';
  summary: string;
  dr: EntryLine[];
  cr: EntryLine[];
  /** system=系统生成；manual=手工录入 */
  source: 'system' | 'manual';
  /** 可追溯的来源数据 id（配对单/存货单/持股关系等） */
  sourceRefs: { kind: string; ids: string[] };
  /** 手工调整理由（手工分录必填） */
  reason?: string;
  /** 借贷平衡差额，正常为 0 */
  balanceCheck: number;
}

/** 手工调整分录的录入请求 */
export interface ManualEntryInput {
  month: Month;
  summary: string;
  dr: EntryLine[];
  cr: EntryLine[];
  reason: string;
  sourceDocIds: string[];
}

/** 单家主体的折算结果 */
export interface TranslatedEntity {
  entityId: string;
  month: Month;
  functionalCurrency: Currency;
  included: boolean;
  /** 折算后各报表行 CNY 金额（保持正数报送口径，方向看 LineDef） */
  lines: Partial<Record<LineCode, number>>;
  /** 折算差额（资产负债表轧差数，进 cta） */
  ctaCny: number;
}

/** 内部往来核对结果行 */
export interface ReconciliationRow {
  id: string;
  month: Month;
  kind: 'BALANCE' | 'SALE';
  partyA: string;
  partyB: string;
  /** 双方折算 CNY 金额 */
  amountA: number;
  amountB: number;
  /** 核对基准（取较小者作为可抵消额） */
  matchedAmount: number;
  /** 差额 = A - B */
  difference: number;
  reasonCode: string;
  reasonLabel: string;
  note?: string;
  /** 该配对生成的抵消分录 id */
  entryId?: string;
}

/** 少数股东权益/损益计算明细 */
export interface NciRow {
  entityId: string;
  /** 集团有效持股比例 0~1 */
  effectiveOwnership: number;
  /** 少数股东比例 0~1 */
  nciPct: number;
  /** 该主体折算后期末净资产 CNY */
  equityCny: number;
  /** 少数股东权益 CNY */
  nciEquityCny: number;
  /** 该主体当期 YTD 净利润 CNY */
  netProfitCny: number;
  /** 少数股东损益 CNY */
  nciPlCny: number;
}

/** 合并范围判定 */
export interface ScopeDecision {
  entityId: string;
  included: boolean;
  /** 判定依据说明 */
  basis: string;
  effectiveOwnership: number | null;
  /** 持股链条描述，如 母公司 -> 甲 -> 乙 */
  chain: string;
  /** 年中事件 */
  periodEvent?: 'ACQUIRED' | 'DISPOSED' | null;
}

/** 合并底稿一行 */
export interface WorksheetRow {
  line: LineCode;
  label: string;
  section: StatementSection;
  kind: LineKind;
  /** 各主体个别数之和（折算 CNY） */
  individual: number;
  /** 抵消借方合计 */
  elimDr: number;
  /** 抵消贷方合计 */
  elimCr: number;
  /** 合并数 */
  consolidated: number;
}

/** 单月完整合并结果 */
export interface ConsolidationResult {
  month: Month;
  scope: ScopeDecision[];
  translated: TranslatedEntity[];
  reconciliations: ReconciliationRow[];
  urp: {
    id: string;
    sellerId: string;
    buyerId: string;
    direction: 'UPSTREAM' | 'DOWNSTREAM';
    inventoryCny: number;
    urpCny: number;
    entryId: string;
  }[];
  entries: EliminationEntry[];
  nci: NciRow[];
  worksheet: WorksheetRow[];
  /** 校验信息 */
  checks: { name: string; ok: boolean; detail: string }[];
}

/** 收购日子公司可辨认净资产快照（CNY），用于投资抵消与商誉计算 */
export interface AcquisitionSnapshot {
  entityId: string;
  month: Month;
  paidInCapital: number;
  capitalReserve: number;
  retainedEarnings: number;
  /** 收购日可辨认净资产公允价值合计（= 实收资本+资本公积+留存收益，收购时点无折算差额） */
  netAssetsAtAcquisition: number;
  /** 母公司（或上层投资公司）支付的合并成本 */
  consideration: number;
  /** 收购日少数股东按公允价值确认的份额（= 净资产 × NCI%，简化按比例份额法） */
  nciAtAcquisition: number;
  /** 商誉 = 合并成本 + NCI - 净资产 */
  goodwill: number;
}

/** 手工合并底稿（独立于引擎的重算与逐项核对结果） */
export interface ManualWorkbook {
  month: string;
  steps: { title: string; detail: string }[];
  manualRows: {
    line: LineCode;
    label: string;
    individual: number;
    elimDr: number;
    elimCr: number;
    consolidated: number;
  }[];
  metrics: { name: string; value: number; formula: string }[];
  comparison: {
    line: LineCode;
    label: string;
    manual: number;
    system: number;
    diff: number;
    match: boolean;
  }[];
  allMatch: boolean;
}

/** 系统全部静态/运行期数据 */
export interface SystemState {
  entities: LegalEntity[];
  ownership: OwnershipEdge[];
  fxRates: FxRate[];
  trialBalance: TrialBalanceLine[];
  icBalances: ICBalancePair[];
  icSales: ICSalePair[];
  icInventory: ICInventory[];
  acquisitionSnapshots: AcquisitionSnapshot[];
  manualEntries: EliminationEntry[];
}
