import type { LineCode, LineDef } from './types.js';

/** 报表项目字典：顺序即合并底稿展示顺序 */
export const CHART_OF_ACCOUNTS: LineDef[] = [
  // ===== 资产负债表 =====
  { code: 'cash', label: '货币资金', section: 'BS', kind: 'debit' },
  { code: 'ar', label: '应收账款（外部）', section: 'BS', kind: 'debit' },
  { code: 'ic_ar', label: '内部应收', section: 'BS', kind: 'debit' },
  { code: 'inventory', label: '存货', section: 'BS', kind: 'debit' },
  { code: 'ppe', label: '固定资产', section: 'BS', kind: 'debit' },
  { code: 'ic_investment', label: '长期股权投资（内部）', section: 'BS', kind: 'debit' },
  { code: 'other_assets', label: '其他资产', section: 'BS', kind: 'debit' },
  { code: 'total_assets', label: '资产总计', section: 'BS', kind: 'debit', derived: true },
  { code: 'ap', label: '应付账款（外部）', section: 'BS', kind: 'credit' },
  { code: 'ic_ap', label: '内部应付', section: 'BS', kind: 'credit' },
  { code: 'other_liab', label: '其他负债', section: 'BS', kind: 'credit' },
  { code: 'total_liab', label: '负债合计', section: 'BS', kind: 'credit', derived: true },
  { code: 'paid_in_capital', label: '实收资本', section: 'BS', kind: 'credit' },
  { code: 'capital_reserve', label: '资本公积', section: 'BS', kind: 'credit' },
  { code: 'retained_earnings', label: '留存收益', section: 'BS', kind: 'credit' },
  { code: 'cta', label: '外币报表折算差额', section: 'BS', kind: 'credit' },
  { code: 'nci', label: '少数股东权益', section: 'BS', kind: 'credit' },
  { code: 'total_equity', label: '所有者权益合计', section: 'BS', kind: 'credit', derived: true },
  // ===== 利润表 =====
  { code: 'revenue', label: '营业收入（外部）', section: 'IS', kind: 'credit' },
  { code: 'ic_revenue', label: '内部销售收入', section: 'IS', kind: 'credit' },
  { code: 'cogs', label: '营业成本（外部）', section: 'IS', kind: 'debit' },
  { code: 'ic_cogs', label: '内部销售成本', section: 'IS', kind: 'debit' },
  { code: 'expenses', label: '期间费用', section: 'IS', kind: 'debit' },
  { code: 'tax', label: '所得税费用', section: 'IS', kind: 'debit' },
  { code: 'net_profit', label: '净利润', section: 'IS', kind: 'credit', derived: true },
  { code: 'nci_pl', label: '少数股东损益', section: 'IS', kind: 'debit' },
  { code: 'parent_pl', label: '归属于母公司所有者的净利润', section: 'IS', kind: 'credit', derived: true },
];

export const LINE_DEFS: Record<LineCode, LineDef> = Object.fromEntries(
  CHART_OF_ACCOUNTS.map((d) => [d.code, d]),
) as Record<LineCode, LineDef>;

/** 主体需要逐行报送的非派生项目 */
export const REPORTABLE_LINES = CHART_OF_ACCOUNTS.filter((l) => !l.derived).map((l) => l.code);

export const BS_LINES = CHART_OF_ACCOUNTS.filter((l) => l.section === 'BS').map((l) => l.code);
export const IS_LINES = CHART_OF_ACCOUNTS.filter((l) => l.section === 'IS').map((l) => l.code);
