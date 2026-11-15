import type {
  EliminationEntry,
  NciRow,
  SystemState,
  TranslatedEntity,
} from '@consol/shared';
import { round2 } from '../seed/random.js';
import type { OwnershipInfo } from './ownership.js';

/**
 * 规则5：长期股权投资与子公司权益抵消 + 少数股东权益/损益。
 *
 * 每家子公司两笔分录：
 *  ① 收购日（或期初）投资抵消（成本法口径，长期平衡）：
 *     借：实收资本/资本公积/留存收益（收购日子公司可辨认权益）
 *     借：商誉（计入其他资产）
 *     贷：长期股权投资（合并成本）
 *     贷：少数股东权益（收购日 NCI 份额）
 *
 *  ② 收购后/本期变动的 NCI 调整：把收购日后子公司净资产增量中归属于少数股东的部分，
 *     从留存收益/折算差额重分类至少数股东权益：
 *     借：留存收益（NCI 份额）、借/贷：折算差额（NCI 份额）
 *     贷：少数股东权益
 *
 * 少数股东损益 = 子公司当期净利润 × NCI% － 逆流交易归属于 NCI 的未实现利润。
 */
export function buildInvestmentAndNci(
  state: SystemState,
  month: string,
  translated: TranslatedEntity[],
  ownership: Map<string, OwnershipInfo>,
  upstreamUrpNci: Map<string, number>,
): { entries: EliminationEntry[]; nciRows: NciRow[] } {
  const entries: EliminationEntry[] = [];
  const nciRows: NciRow[] = [];

  for (const t of translated) {
    if (t.entityId === 'P') continue;
    const info = ownership.get(t.entityId);
    if (!info || !info.controlled) continue;
    const snapshot = state.acquisitionSnapshots.find((s) => s.entityId === t.entityId);
    if (!snapshot) continue;

    const ownershipPct = info.effectiveOwnership;
    const nciPct = round4(1 - ownershipPct);
    const L = t.lines;

    const equityCny = round2(
      (L.paid_in_capital ?? 0) +
        (L.capital_reserve ?? 0) +
        (L.retained_earnings ?? 0) +
        (L.cta ?? 0),
    );
    const netProfitCny = L.net_profit ?? 0;
    const acqEquity = snapshot.netAssetsAtAcquisition;
    const postAcqChange = round2(equityCny - acqEquity);

    // ===== 分录①：收购日/期初投资抵消 =====
    const dr1: EliminationEntry['dr'] = [
      { line: 'paid_in_capital', amountCny: snapshot.paidInCapital },
      { line: 'capital_reserve', amountCny: snapshot.capitalReserve },
      { line: 'retained_earnings', amountCny: snapshot.retainedEarnings },
    ];
    if (snapshot.goodwill > 0) {
      dr1.push({ line: 'other_assets', amountCny: snapshot.goodwill });
    }
    const cr1: EliminationEntry['cr'] = [
      { line: 'ic_investment', amountCny: snapshot.consideration },
    ];
    if (snapshot.nciAtAcquisition > 0) {
      cr1.push({ line: 'nci' as const, amountCny: snapshot.nciAtAcquisition });
    }
    const dr1Sum = dr1.reduce((s, x) => s + x.amountCny, 0);
    const cr1Sum = cr1.reduce((s, x) => s + x.amountCny, 0);
    entries.push({
      id: `EL-INV-${t.entityId}-${month}`,
      month,
      type: 'INVESTMENT',
      summary:
        `抵消对 ${t.entityId} 的长期股权投资与收购日/期初子公司权益，商誉 ${snapshot.goodwill.toFixed(2)} 元，` +
        `收购日少数股东权益 ${snapshot.nciAtAcquisition.toFixed(2)} 元`,
      dr: dr1,
      cr: cr1,
      source: 'system',
      sourceRefs: { kind: 'ownership+snapshot', ids: [t.entityId, snapshot.month] },
      balanceCheck: round2(dr1Sum - cr1Sum),
    });

    // ===== 分录②：收购后净资产变动的 NCI 调整（全资子公司 NCI=0，无需该分录） =====
    const nciPostAcq = round2(postAcqChange * nciPct);
    if (nciPct > 0) {
      const ctaNci = round2((L.cta ?? 0) * nciPct);
      const reNci = round2(nciPostAcq - ctaNci);
      const dr2: EliminationEntry['dr'] = [];
      const cr2: EliminationEntry['cr'] = [];
      if (reNci >= 0) dr2.push({ line: 'retained_earnings', amountCny: reNci });
      else cr2.push({ line: 'retained_earnings', amountCny: -reNci });
      if (ctaNci >= 0) dr2.push({ line: 'cta', amountCny: ctaNci });
      else cr2.push({ line: 'cta', amountCny: -ctaNci });
      cr2.push({ line: 'nci', amountCny: round2(Math.abs(nciPostAcq)) });
      entries.push({
        id: `EL-NCI-${t.entityId}-${month}`,
        month,
        type: 'NCI',
        summary:
          `将 ${t.entityId} 收购日后净资产增量 ${postAcqChange.toFixed(2)} 元中 ${(nciPct * 100).toFixed(2)}% ` +
          `的少数股东份额（${nciPostAcq.toFixed(2)} 元）重分类至少数股东权益`,
        dr: dr2,
        cr: cr2,
        source: 'system',
        sourceRefs: { kind: 'nci', ids: [t.entityId] },
        balanceCheck: round2(dr2.reduce((s, x) => s + x.amountCny, 0) - cr2.reduce((s, x) => s + x.amountCny, 0)),
      });
    }

    // ===== NCI 计算结果 =====
    const urpNciAdjust = upstreamUrpNci.get(t.entityId) ?? 0;
    const nciPlCny = round2(netProfitCny * nciPct - urpNciAdjust);
    const nciEquityCny = round2(snapshot.nciAtAcquisition + nciPostAcq);
    nciRows.push({
      entityId: t.entityId,
      effectiveOwnership: round4(ownershipPct),
      nciPct,
      equityCny,
      nciEquityCny,
      netProfitCny: round2(netProfitCny),
      nciPlCny,
    });
  }

  return { entries, nciRows };
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
