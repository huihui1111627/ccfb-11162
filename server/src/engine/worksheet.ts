import type {
  EliminationEntry,
  LineCode,
  TranslatedEntity,
  WorksheetRow,
} from '@consol/shared';
import { CHART_OF_ACCOUNTS, LINE_DEFS } from '@consol/shared';
import { round2 } from '../seed/random.js';

export interface WorksheetBuildResult {
  rows: WorksheetRow[];
  /** 按行汇总抵消借贷（含手工分录） */
  elimByLine: Map<LineCode, { dr: number; cr: number }>;
}

/**
 * 规则8：合并底稿逐项显示 个别数（各主体折算后汇总）、抵消借/贷、合并数。
 * 借方科目：合并数 = 个别数 + 抵消借 - 抵消贷
 * 贷方科目：合并数 = 个别数 + 抵消贷 - 抵消借
 * 派生合计行由合并后的明细行重新计算。
 */
export function buildWorksheet(
  translated: TranslatedEntity[],
  entries: EliminationEntry[],
): WorksheetBuildResult {
  const individual = new Map<LineCode, number>();
  for (const t of translated) {
    for (const def of CHART_OF_ACCOUNTS) {
      const v = t.lines[def.code] ?? 0;
      individual.set(def.code, round2((individual.get(def.code) ?? 0) + v));
    }
  }

  const elimByLine = new Map<LineCode, { dr: number; cr: number }>();
  const bump = (code: LineCode, dr: number, cr: number) => {
    const cur = elimByLine.get(code) ?? { dr: 0, cr: 0 };
    cur.dr = round2(cur.dr + dr);
    cur.cr = round2(cur.cr + cr);
    elimByLine.set(code, cur);
  };
  for (const e of entries) {
    for (const l of e.dr) bump(l.line, l.amountCny, 0);
    for (const l of e.cr) bump(l.line, 0, l.amountCny);
  }

  const valueOf = (code: LineCode): number => {
    const def = LINE_DEFS[code];
    const ind = individual.get(code) ?? 0;
    const el = elimByLine.get(code) ?? { dr: 0, cr: 0 };
    return def.kind === 'debit'
      ? round2(ind + el.dr - el.cr)
      : round2(ind + el.cr - el.dr);
  };

  const rows: WorksheetRow[] = CHART_OF_ACCOUNTS.map((def) => {
    const ind = individual.get(def.code) ?? 0;
    const el = elimByLine.get(def.code) ?? { dr: 0, cr: 0 };
    let consolidated: number;
    if (def.derived) {
      consolidated = deriveConsolidated(def.code, valueOf);
    } else {
      consolidated =
        def.kind === 'debit'
          ? round2(ind + el.dr - el.cr)
          : round2(ind + el.cr - el.dr);
    }
    return {
      line: def.code,
      label: def.label,
      section: def.section,
      kind: def.kind,
      individual: round2(ind),
      elimDr: el.dr,
      elimCr: el.cr,
      consolidated,
    };
  });

  return { rows, elimByLine };
}

/** 合并层面派生合计行 */
function deriveConsolidated(
  code: LineCode,
  valueOf: (c: LineCode) => number,
): number {
  switch (code) {
    case 'total_assets':
      return round2(
        ['cash', 'ar', 'ic_ar', 'inventory', 'ppe', 'ic_investment', 'other_assets']
          .reduce((s, c) => s + valueOf(c as LineCode), 0),
      );
    case 'total_liab':
      return round2(
        ['ap', 'ic_ap', 'other_liab'].reduce((s, c) => s + valueOf(c as LineCode), 0),
      );
    case 'total_equity':
      return round2(
        ['paid_in_capital', 'capital_reserve', 'retained_earnings', 'cta', 'nci']
          .reduce((s, c) => s + valueOf(c as LineCode), 0),
      );
    case 'net_profit': {
      const credit = valueOf('revenue') + valueOf('ic_revenue');
      const debit = valueOf('cogs') + valueOf('ic_cogs') + valueOf('expenses') + valueOf('tax');
      return round2(credit - debit);
    }
    case 'parent_pl':
      return round2(valueOf('net_profit') - valueOf('nci_pl'));
    default:
      return 0;
  }
}
