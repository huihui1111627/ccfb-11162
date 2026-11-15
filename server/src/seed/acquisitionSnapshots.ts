import type { AcquisitionSnapshot } from '@consol/shared';

/**
 * 收购日/期初子公司可辨认净资产快照与合并成本（CNY 口径）。
 * 年中收购的 A2、C2 按实际收购月（2026-04）建快照；
 * 其余子公司视为集团成立时即已持有，期初快照用于长投与权益抵消。
 * 商誉 = 合并成本 + 收购日少数股东份额 - 可辨认净资产公允价值。
 */
export const ACQUISITION_SNAPSHOTS: AcquisitionSnapshot[] = [
  // 年中收购：A2（母公司持股45%但实质控制，按100%合并，NCI=55%）
  {
    entityId: 'A2', month: '2026-04',
    paidInCapital: 66000, capitalReserve: 15000, retainedEarnings: 25000,
    netAssetsAtAcquisition: 106000,
    consideration: 52000,
    nciAtAcquisition: 58300,
    goodwill: 4300,
  },
  // 年中收购：C2（A2 持股80%，随同一并购交易并入，NCI=20%）
  {
    entityId: 'C2', month: '2026-04',
    paidInCapital: 24200, capitalReserve: 5500, retainedEarnings: 9000,
    netAssetsAtAcquisition: 38700,
    consideration: 32000,
    nciAtAcquisition: 7740,
    goodwill: 1040,
  },
  // 期初已持有的子公司：长投成本与期初净资产对应，简化为无商誉
  { entityId: 'A1', month: '2026-01', paidInCapital: 92400, capitalReserve: 21000,
    retainedEarnings: 38000, netAssetsAtAcquisition: 151400, consideration: 121120,
    nciAtAcquisition: 30280, goodwill: 0 },
  { entityId: 'B1', month: '2026-01', paidInCapital: 39600, capitalReserve: 9000,
    retainedEarnings: 14000, netAssetsAtAcquisition: 62600, consideration: 62600,
    nciAtAcquisition: 0, goodwill: 0 },
  { entityId: 'C1', month: '2026-01', paidInCapital: 26400, capitalReserve: 6000,
    retainedEarnings: 11000, netAssetsAtAcquisition: 43400, consideration: 30380,
    nciAtAcquisition: 13020, goodwill: 0 },
  { entityId: 'B2', month: '2026-01', paidInCapital: 35200, capitalReserve: 8000,
    retainedEarnings: 13000, netAssetsAtAcquisition: 56200, consideration: 50580,
    nciAtAcquisition: 5620, goodwill: 0 },
  { entityId: 'B3', month: '2026-01', paidInCapital: 26400, capitalReserve: 6000,
    retainedEarnings: 9000, netAssetsAtAcquisition: 41400, consideration: 24840,
    nciAtAcquisition: 16560, goodwill: 0 },
  { entityId: 'B4', month: '2026-01', paidInCapital: 19800, capitalReserve: 4500,
    retainedEarnings: 7000, netAssetsAtAcquisition: 31300, consideration: 23475,
    nciAtAcquisition: 7825, goodwill: 0 },
  { entityId: 'C3', month: '2026-01', paidInCapital: 17600, capitalReserve: 4000,
    retainedEarnings: 6000, netAssetsAtAcquisition: 27600, consideration: 15180,
    nciAtAcquisition: 12420, goodwill: 0 },
  { entityId: 'D2', month: '2026-01', paidInCapital: 15400, capitalReserve: 3500,
    retainedEarnings: 5500, netAssetsAtAcquisition: 24400, consideration: 24400,
    nciAtAcquisition: 0, goodwill: 0 },
  { entityId: 'D3', month: '2026-01', paidInCapital: 13200, capitalReserve: 3000,
    retainedEarnings: 4500, netAssetsAtAcquisition: 20700, consideration: 16560,
    nciAtAcquisition: 4140, goodwill: 0 },
  { entityId: 'E1', month: '2026-01', paidInCapital: 19800, capitalReserve: 4500,
    retainedEarnings: 7000, netAssetsAtAcquisition: 31300, consideration: 19719,
    nciAtAcquisition: 11581, goodwill: 0 },
  { entityId: 'D1', month: '2026-01', paidInCapital: 15400, capitalReserve: 3500,
    retainedEarnings: 5000, netAssetsAtAcquisition: 23900, consideration: 9560,
    nciAtAcquisition: 14340, goodwill: 0 },
];

export const SNAPSHOT_MAP = Object.fromEntries(
  ACQUISITION_SNAPSHOTS.map((s) => [s.entityId, s]),
);
