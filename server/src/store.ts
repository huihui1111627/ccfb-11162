import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SystemState, ManualEntryInput, EliminationEntry } from '@consol/shared';
import { buildSeedState } from './seed/index.js';

/**
 * 轻量 JSON 持久化：数据量为 15 家主体 × 12 月，单文件足够。
 * 写入采用临时文件 + 原子 rename，避免半写状态。
 */
export class Store {
  private state: SystemState;

  constructor(private readonly filePath: string) {
    if (existsSync(filePath)) {
      this.state = JSON.parse(readFileSync(filePath, 'utf-8')) as SystemState;
    } else {
      this.state = buildSeedState();
      this.persist();
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf-8');
    renameSync(tmp, this.filePath);
  }

  get(): SystemState {
    return this.state;
  }

  /** 重置为初始虚构数据（清空全部手工分录） */
  reset(): SystemState {
    this.state = buildSeedState();
    this.persist();
    return this.state;
  }

  addManualEntry(input: ManualEntryInput): EliminationEntry {
    const drSum = input.dr.reduce((s, l) => s + l.amountCny, 0);
    const crSum = input.cr.reduce((s, l) => s + l.amountCny, 0);
    const entry: EliminationEntry = {
      id: `MAN-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      month: input.month,
      type: 'MANUAL',
      summary: input.summary,
      dr: input.dr,
      cr: input.cr,
      source: 'manual',
      sourceRefs: { kind: 'manual-doc', ids: input.sourceDocIds },
      reason: input.reason,
      balanceCheck: Math.round((drSum - crSum) * 100) / 100,
    };
    this.state.manualEntries.push(entry);
    this.persist();
    return entry;
  }

  deleteManualEntry(id: string): boolean {
    const before = this.state.manualEntries.length;
    this.state.manualEntries = this.state.manualEntries.filter((e) => e.id !== id);
    const changed = this.state.manualEntries.length !== before;
    if (changed) this.persist();
    return changed;
  }
}
