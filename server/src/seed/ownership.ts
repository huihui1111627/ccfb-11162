import type { OwnershipEdge } from '@consol/shared';

/**
 * 直接持股关系（directPct 为直接持股比例）。
 * 控制权判定规则：
 *  1) 直接/间接持股 > 50% -> 控制，纳入合并；
 *  2) 持股不过半但满足协议控制（董事会多数席位/经营决策主导）-> 实质控制，纳入合并并写明依据；
 *  3) 不具控制权的联营/合营 -> 不纳入合并。
 */
export const OWNERSHIP: OwnershipEdge[] = [
  // 母公司 -> 第一层
  { shareholderId: 'P', investeeId: 'A1', directPct: 0.8, hasControl: true,
    controlNote: '持股80%，绝对控股' },
  { shareholderId: 'P', investeeId: 'A2', directPct: 0.45, hasControl: true,
    controlNote: '根据《一致行动协议》受托行使另18%股权表决权，并在7人董事会占有5席，'
      + '拥有实质控制权，依据《企业会计准则第33号——合并财务报表》第七条纳入合并' },
  { shareholderId: 'P', investeeId: 'B1', directPct: 1.0, hasControl: true,
    controlNote: '全资子公司' },
  { shareholderId: 'P', investeeId: 'C1', directPct: 0.7, hasControl: true,
    controlNote: '持股70%，控股' },
  { shareholderId: 'P', investeeId: 'F1', directPct: 0.4, hasControl: false,
    controlNote: '持股40%且董事会席位不过半，仅具重大影响，属联营企业' },

  // A1 -> 第二层
  { shareholderId: 'A1', investeeId: 'B2', directPct: 0.9, hasControl: true },
  { shareholderId: 'A1', investeeId: 'B3', directPct: 0.6, hasControl: true },
  { shareholderId: 'A1', investeeId: 'B4', directPct: 0.75, hasControl: true },

  // A2 -> 第二层（A2 自身 4 月被收购，其下属公司随同一并购交易并入）
  { shareholderId: 'A2', investeeId: 'C2', directPct: 0.8, hasControl: true },
  { shareholderId: 'A2', investeeId: 'C3', directPct: 0.55, hasControl: true },

  // B1 -> 第二层
  { shareholderId: 'B1', investeeId: 'D2', directPct: 1.0, hasControl: true },
  { shareholderId: 'B1', investeeId: 'D3', directPct: 0.8, hasControl: true },

  // B2 -> 第三层
  { shareholderId: 'B2', investeeId: 'E1', directPct: 0.7, hasControl: true },
  // B3 -> 第三层（40% 但协议控制：实质控制纳入合并的第二层示例）
  { shareholderId: 'B3', investeeId: 'D1', directPct: 0.4, hasControl: true,
    controlNote: '通过《经营管理委托协议》主导 D1 的财务与经营决策、'
      + '有权任免其董事会多数成员，构成实质控制，纳入合并；2026年8月处置后出表' },
];
