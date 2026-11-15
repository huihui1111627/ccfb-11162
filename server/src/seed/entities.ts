import type { LegalEntity } from '@consol/shared';

/**
 * 虚构集团：华源集团
 * 三层持股，15 家法人主体（母公司 1 + 子公司 13 + 联营 1），
 * 记账本位币覆盖 CNY / USD / EUR。
 *
 * 年中事件：
 *  - A2 华南智造：2026-04 收购，自 4 月起纳入合并（按月份折算并入）
 *  - D1 西北材料：2026-08 处置，8 月处置后自 9 月起出表
 */
export const ENTITIES: LegalEntity[] = [
  // 第 0 层：母公司
  {
    id: 'P',
    name: '华源集团股份有限公司',
    functionalCurrency: 'CNY',
    tier: 0,
    acquiredMonth: null,
    disposedMonth: null,
    note: '母公司，出具合并报表',
  },

  // ===== 第 1 层：母公司直接持股 =====
  {
    id: 'A1',
    name: '华源华东科技有限公司',
    functionalCurrency: 'CNY',
    tier: 1,
    acquiredMonth: null,
    disposedMonth: null,
  },
  {
    id: 'A2',
    name: '华南智造有限公司',
    functionalCurrency: 'CNY',
    tier: 1,
    acquiredMonth: '2026-04',
    disposedMonth: null,
    note: '2026年4月完成股权收购，收购日起纳入合并',
  },
  {
    id: 'B1',
    name: '华源香港贸易有限公司',
    functionalCurrency: 'USD',
    tier: 1,
    acquiredMonth: null,
    disposedMonth: null,
  },
  {
    id: 'C1',
    name: '华源欧洲装备 GmbH',
    functionalCurrency: 'EUR',
    tier: 1,
    acquiredMonth: null,
    disposedMonth: null,
  },
  {
    id: 'F1',
    name: '北方能源合营有限公司',
    functionalCurrency: 'CNY',
    tier: 1,
    acquiredMonth: null,
    disposedMonth: null,
    note: '联营/合营企业，持股40%且不具控制权，不纳入合并范围，按权益法核算',
  },

  // ===== 第 2 层：A1 系 =====
  {
    id: 'B2',
    name: '苏州精密部件有限公司',
    functionalCurrency: 'CNY',
    tier: 2,
    acquiredMonth: null,
    disposedMonth: null,
  },
  {
    id: 'B3',
    name: '杭州软件服务有限公司',
    functionalCurrency: 'CNY',
    tier: 2,
    acquiredMonth: null,
    disposedMonth: null,
  },
  {
    id: 'B4',
    name: '华源越南制造有限公司',
    functionalCurrency: 'USD',
    tier: 2,
    acquiredMonth: null,
    disposedMonth: null,
  },

  // ===== 第 2 层：A2 系 =====
  {
    id: 'C2',
    name: '佛山模具科技有限公司',
    functionalCurrency: 'CNY',
    tier: 2,
    acquiredMonth: '2026-04',
    disposedMonth: null,
    note: '随母公司 A2 一并于 4 月收购并入',
  },
  {
    id: 'C3',
    name: '东莞表面处理有限公司',
    functionalCurrency: 'CNY',
    tier: 2,
    acquiredMonth: null,
    disposedMonth: null,
    note: 'A2 收购前已持有，A2 并入后随集团间接控制纳入',
  },

  // ===== 第 2 层：B1 系（境外 USD/EUR） =====
  {
    id: 'D2',
    name: '华源新加坡商贸 Pte Ltd',
    functionalCurrency: 'USD',
    tier: 2,
    acquiredMonth: null,
    disposedMonth: null,
  },
  {
    id: 'D3',
    name: '华源德国销售 GmbH',
    functionalCurrency: 'EUR',
    tier: 2,
    acquiredMonth: null,
    disposedMonth: null,
  },

  // ===== 第 3 层 =====
  {
    id: 'E1',
    name: '常州新材料有限公司',
    functionalCurrency: 'CNY',
    tier: 3,
    acquiredMonth: null,
    disposedMonth: null,
  },
  {
    id: 'D1',
    name: '西北材料有限公司',
    functionalCurrency: 'CNY',
    tier: 3,
    acquiredMonth: null,
    disposedMonth: '2026-08',
    note: '2026年8月处置全部股权，9月起不再纳入合并',
  },
];

export const ENTITY_MAP = Object.fromEntries(ENTITIES.map((e) => [e.id, e]));
