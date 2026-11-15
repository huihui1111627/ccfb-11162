import { MONTHS } from '@consol/shared';
import { buildSeedState } from './seed/index.js';
import { consolidate } from './engine/consolidate.js';

const state = buildSeedState();
for (const month of MONTHS) {
  const r = consolidate(state, month);
  const included = r.scope.filter((s) => s.included).length;
  const allOk = r.checks.every((c) => c.ok);
  console.log(`\n===== ${month} | 纳入 ${included} 家 | 分录 ${r.entries.length} 笔 | 校验 ${allOk ? '全部通过' : '存在异常'} =====`);
  for (const c of r.checks) {
    console.log(`  [${c.ok ? 'OK' : 'FAIL'}] ${c.name}: ${c.detail}`);
  }
  if (!allOk) break;
}
