import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeedState } from '../seed/index.js';
import { buildManualWorkbook } from './manualWorkbook.js';
import { fmt2 } from '../seed/random.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const reportPath = resolve(__dirname, '../../runtime/manual-report.json');

const state = buildSeedState();
const wb = buildManualWorkbook(state);

console.log(`\n================ 手工合并底稿 vs 系统结果 逐项核对（${wb.month}） ================\n`);
for (const s of wb.steps) {
  console.log(`【${s.title}】`);
  console.log(s.detail);
  console.log('');
}

console.log('---------------- 关键指标 ----------------');
for (const m of wb.metrics) {
  console.log(`${m.name}: ${fmt2(m.value)}    [${m.formula}]`);
}

console.log('\n---------------- 逐行核对（手工 / 系统 / 差额） ----------------');
console.log('报表行'.padEnd(28) + '手工合并数'.padStart(18) + '系统合并数'.padStart(18) + '差额'.padStart(12) + '  结果');
for (const c of wb.comparison) {
  console.log(
    c.label.padEnd(28) +
      fmt2(c.manual).padStart(18) +
      fmt2(c.system).padStart(18) +
      fmt2(c.diff).padStart(12) +
      `  ${c.match ? '✓ 一致' : '✗ 不符'}`,
  );
}

console.log(`\n核对结论：${wb.allMatch ? '全部报表行手工数与系统数完全一致 ✓' : '存在不符项，需检查 ✗'}\n`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(wb, null, 2), 'utf-8');
console.log(`报告已写入: ${reportPath}`);

if (!wb.allMatch) process.exitCode = 1;
