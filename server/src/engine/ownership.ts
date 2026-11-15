import type {
  LegalEntity,
  OwnershipEdge,
  ScopeDecision,
} from '@consol/shared';
import { monthIndex } from '@consol/shared';

export interface OwnershipInfo {
  /** 从母公司到该主体的持股链（含母公司与自身） */
  chain: string[];
  /** 链条上各段直接持股比例的乘积（集团有效持股） */
  effectiveOwnership: number;
  /** 链条上各段是否均具控制权 */
  controlled: boolean;
  /** 直接母公司 id */
  parentId: string | null;
  /** 控制权依据说明（取关键控制边的备注） */
  controlBasis: string;
  /** 直接持股边（直接母公司 → 本主体）的控制备注，用于持股不过半场景 */
  directControlNote?: string;
}

/**
 * 在持股图上从母公司出发做 DFS，计算每个主体的持股链、有效持股比例与控制权。
 * 有效持股 = 链上各段直接持股比例连乘；
 * 控制 = 链上每一段都具有控制权（>50% 控股或协议实质控制）。
 */
export function computeOwnership(
  entities: LegalEntity[],
  edges: OwnershipEdge[],
): Map<string, OwnershipInfo> {
  const result = new Map<string, OwnershipInfo>();
  const parent = entities.find((e) => e.tier === 0)!;

  const outgoing = new Map<string, OwnershipEdge[]>();
  for (const e of edges) {
    const list = outgoing.get(e.shareholderId) ?? [];
    list.push(e);
    outgoing.set(e.shareholderId, list);
  }

  const walk = (
    nodeId: string,
    chain: string[],
    effective: number,
    controlled: boolean,
    basis: string,
  ) => {
    for (const edge of outgoing.get(nodeId) ?? []) {
      const nextEffective = effective * edge.directPct;
      const nextControlled = controlled && edge.hasControl;
      const nextChain = [...chain, edge.investeeId];
      const nextBasis = edge.controlNote
        ? basis
          ? `${basis}；${edge.controlNote}`
          : edge.controlNote
        : basis;

      const existing = result.get(edge.investeeId);
      // 取有效持股最高且受控的路径
      if (!existing || nextEffective > existing.effectiveOwnership) {
        result.set(edge.investeeId, {
          chain: nextChain,
          effectiveOwnership: nextEffective,
          controlled: nextControlled,
          parentId: nodeId,
          controlBasis: nextBasis,
          directControlNote: edge.controlNote,
        });
      }
      walk(edge.investeeId, nextChain, nextEffective, nextControlled, nextBasis);
    }
  };

  result.set(parent.id, {
    chain: [parent.id],
    effectiveOwnership: 1,
    controlled: true,
    parentId: null,
    controlBasis: '母公司',
  });
  walk(parent.id, [parent.id], 1, true, '');

  return result;
}

/**
 * 判定指定月份的合并范围。
 * 纳入条件：受控 且 该月处于报告期（收购月起、处置月止）。
 */
export function determineScope(
  entities: LegalEntity[],
  edges: OwnershipEdge[],
  month: string,
): ScopeDecision[] {
  const ownership = computeOwnership(entities, edges);
  const mIdx = monthIndex(month);

  return entities.map((e): ScopeDecision => {
    if (e.tier === 0) {
      return {
        entityId: e.id,
        included: true,
        basis: '母公司，编制合并报表的主体',
        effectiveOwnership: 1,
        chain: e.id,
      };
    }
    const info = ownership.get(e.id);
    const chainText = info ? info.chain.join(' → ') : e.id;

    // 报告期判断（规则6：年中收购/处置按时间折算并入）
    let periodEvent: 'ACQUIRED' | 'DISPOSED' | null = null;
    let inPeriod = true;
    if (e.acquiredMonth && mIdx < monthIndex(e.acquiredMonth)) {
      inPeriod = false;
      periodEvent = 'ACQUIRED';
    }
    if (e.disposedMonth && mIdx > monthIndex(e.disposedMonth)) {
      inPeriod = false;
      periodEvent = 'DISPOSED';
    }

    const controlled = info?.controlled ?? false;
    const effective = info ? round4(info.effectiveOwnership) : null;

    let basis: string;
    let included: boolean;
    if (!info) {
      basis = '持股图中无法从母公司到达，不纳入合并';
      included = false;
    } else if (!controlled) {
      basis =
        `集团有效持股 ${(effective! * 100).toFixed(2)}%，不具有控制权（${info.controlBasis || '仅具重大影响'}），` +
        '按权益法核算，不纳入合并范围';
      included = false;
    } else if (!inPeriod) {
      const evtText =
        periodEvent === 'ACQUIRED'
          ? `将于 ${e.acquiredMonth} 收购，收购前不在报告期`
          : `已于 ${e.disposedMonth} 处置，处置后不在报告期`;
      basis =
        `具控制权、有效持股 ${(effective! * 100).toFixed(2)}%，但${evtText}，本月不纳入合并；` +
        '并入期间按实际持有月份折算';
      included = false;
    } else {
      const overHalf = effective! > 0.5;
      basis = overHalf
        ? `集团有效持股 ${(effective! * 100).toFixed(2)}%，超过半数表决权，具控制权，纳入合并。持股链：${chainText}`
        : `集团有效持股 ${(effective! * 100).toFixed(2)}% 未过半，但直接股东 ${info.parentId} ` +
          `${info.directControlNote || '通过协议安排拥有实质控制权'}。持股链：${chainText}`;
      if (e.acquiredMonth && month === e.acquiredMonth) {
        basis += `；本月（${e.acquiredMonth}）为收购首月，按收购日起的期间并入`;
        periodEvent = 'ACQUIRED';
      }
      if (e.disposedMonth && month === e.disposedMonth) {
        basis += `；本月（${e.disposedMonth}）为处置月，仍纳入当月合并，次月起出表`;
        periodEvent = 'DISPOSED';
      }
      included = true;
    }

    return {
      entityId: e.id,
      included,
      basis,
      effectiveOwnership: effective,
      chain: chainText,
      periodEvent,
    };
  });
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
