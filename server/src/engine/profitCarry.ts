import type { EliminationEntry, LineCode } from '@consol/shared';
import { LINE_DEFS } from '@consol/shared';
import { round2 } from '../seed/random.js';

/**
 * 利润结转分录：把全部跨表（利润表侧）抵消/手工调整对净利润的影响结转到留存收益，
 * 使合并资产负债表保持 资产 = 负债 + 权益。
 *
 * 对每笔含利润表行的分录，计算其对净利润的影响：
 *   贷方收入类增加利润（+），借方收入类减少利润（-）；
 *   借方成本费用类减少利润（-），贷方成本费用类增加利润（+）。
 * 影响为负（合并净利润减少）→ 借：留存收益；为正 → 贷：留存收益。
 */
export function buildProfitCarry(entries: EliminationEntry[], month: string): EliminationEntry {
  let deltaProfit = 0;
  const refs: string[] = [];

  const side = (line: LineCode, amount: number, isDebit: boolean): number => {
    const def = LINE_DEFS[line];
    if (def.section !== 'IS') return 0;
    if (line === 'nci_pl' || line === 'parent_pl') return 0; // 利润分配行，不进留存收益结转
    // 收入类（credit kind）：贷方增加利润；成本费用类（debit kind）：借方减少利润
    if (def.kind === 'credit') return isDebit ? -amount : amount;
    return isDebit ? -amount : amount;
  };

  for (const e of entries) {
    let touched = false;
    for (const l of e.dr) {
      const d = side(l.line, l.amountCny, true);
      if (d !== 0) touched = true;
      deltaProfit += d;
    }
    for (const l of e.cr) {
      const d = side(l.line, l.amountCny, false);
      if (d !== 0) touched = true;
      deltaProfit += d;
    }
    if (touched) refs.push(e.id);
  }

  deltaProfit = round2(deltaProfit);
  const dr: EliminationEntry['dr'] = [];
  const cr: EliminationEntry['cr'] = [];
  if (deltaProfit < 0) {
    dr.push({ line: 'retained_earnings', amountCny: -deltaProfit });
  } else if (deltaProfit > 0) {
    cr.push({ line: 'retained_earnings', amountCny: deltaProfit });
  }

  return {
    id: `EL-CARRY-${month}`,
    month,
    type: 'PROFIT_CARRY',
    summary:
      `利润表抵消事项结转留存收益：本期抵消使合并净利润${deltaProfit < 0 ? '减少' : '增加'} ` +
      `${Math.abs(deltaProfit).toFixed(2)} 元，对应调整合并留存收益`,
    dr,
    cr,
    source: 'system',
    sourceRefs: { kind: 'derived-from-entries', ids: refs },
    balanceCheck: 0,
  };
}
