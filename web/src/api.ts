import type {
  ConsolidationResult,
  ICBalancePair,
  ICSalePair,
  ICInventory,
  LegalEntity,
  LineCode,
  ManualEntryInput,
  Month,
  OwnershipEdge,
} from '@consol/shared';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `请求失败 ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface OrgResponse {
  entities: LegalEntity[];
  edges: OwnershipEdge[];
  ownershipInfo: Record<string, {
    chain: string[];
    effectiveOwnership: number;
    controlled: boolean;
    parentId: string | null;
    controlBasis: string;
  }>;
}

export interface CollectionResponse {
  lineDefs: { code: LineCode; label: string; section: string; kind: string; derived?: boolean }[];
  fxRates: { month: Month; currency: string; closingRate: number; averageRate: number }[];
  trialBalance: { entityId: string; month: Month; line: LineCode; amount: number }[];
  entities: LegalEntity[];
}

export interface ReconciliationResponse {
  month: Month;
  reconciliations: ConsolidationResult['reconciliations'];
  urp: ConsolidationResult['urp'];
  entities: LegalEntity[];
}

export interface IcDocsResponse {
  balances: ICBalancePair[];
  sales: ICSalePair[];
  inventory: ICInventory[];
}

export const api = {
  org: () => http<OrgResponse>('/api/org'),
  scope: (month: Month) => http<{ month: Month; scope: ConsolidationResult['scope'] }>(`/api/scope/${month}`),
  collection: (entityId?: string, month?: Month) =>
    http<CollectionResponse>(
      `/api/collection?${new URLSearchParams({
        ...(entityId ? { entityId } : {}),
        ...(month ? { month } : {}),
      })}`,
    ),
  reconciliation: (month: Month) => http<ReconciliationResponse>(`/api/reconciliation/${month}`),
  icDocs: (month: Month) => http<IcDocsResponse>(`/api/ic-documents/${month}`),
  entries: (month: Month) =>
    http<{ month: Month; entries: ConsolidationResult['entries'] }>(`/api/entries/${month}`),
  nci: (month: Month) => http<{ month: Month; nci: ConsolidationResult['nci'] }>(`/api/nci/${month}`),
  worksheet: (month: Month) =>
    http<{
      month: Month;
      worksheet: ConsolidationResult['worksheet'];
      checks: ConsolidationResult['checks'];
      translated: ConsolidationResult['translated'];
    }>(`/api/worksheet/${month}`),
  consolidation: (month: Month) => http<ConsolidationResult>(`/api/consolidation/${month}`),
  manualWorkbook: () => http<import('@consol/shared').ManualWorkbook>('/api/manual-workbook'),
  addManualEntry: (input: ManualEntryInput) =>
    http<unknown>('/api/manual-entries', { method: 'POST', body: JSON.stringify(input) }),
  deleteManualEntry: (id: string) =>
    http<{ ok: boolean }>(`/api/manual-entries/${id}`, { method: 'DELETE' }),
  reset: () => http<unknown>('/api/reset', { method: 'POST' }),
};
