import type { SystemState } from '@consol/shared';
import { ENTITIES } from './entities.js';
import { OWNERSHIP } from './ownership.js';
import { FX_RATES } from './fxRates.js';
import { generateTrialBalance } from './trialBalance.js';
import { ACQUISITION_SNAPSHOTS } from './acquisitionSnapshots.js';

/** 生成一份全新的虚构集团数据（手工调整分录初始为空） */
export function buildSeedState(): SystemState {
  const { tb, ic } = generateTrialBalance();
  return {
    entities: ENTITIES,
    ownership: OWNERSHIP,
    fxRates: FX_RATES,
    trialBalance: tb,
    icBalances: ic.balances,
    icSales: ic.sales,
    icInventory: ic.inventory,
    acquisitionSnapshots: ACQUISITION_SNAPSHOTS,
    manualEntries: [],
  };
}
