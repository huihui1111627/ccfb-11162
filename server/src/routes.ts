import { Router } from 'express';
import type { ManualEntryInput } from '@consol/shared';
import { LINE_DEFS } from '@consol/shared';
import type { Store } from './store.js';
import { consolidate } from './engine/consolidate.js';
import { computeOwnership } from './engine/ownership.js';
import { buildManualWorkbook } from './manual/manualWorkbook.js';

export function createApi(store: Store): Router {
  const router = Router();

  // 组织架构：主体 + 持股边 + 有效持股/控制链
  router.get('/org', (_req, res) => {
    const state = store.get();
    const ownership = computeOwnership(state.entities, state.ownership);
    res.json({
      entities: state.entities,
      edges: state.ownership,
      ownershipInfo: Object.fromEntries(ownership),
    });
  });

  // 指定月份合并范围判定（含依据）
  router.get('/scope/:month', (req, res) => {
    const result = consolidate(store.get(), req.params.month);
    res.json({ month: req.params.month, scope: result.scope });
  });

  // 报表采集：某主体（或全部）12 个月试算表 + 汇率
  router.get('/collection', (req, res) => {
    const state = store.get();
    const entityId = typeof req.query.entityId === 'string' ? req.query.entityId : undefined;
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const tb = state.trialBalance.filter(
      (t) => (!entityId || t.entityId === entityId) && (!month || t.month === month),
    );
    res.json({
      lineDefs: Object.values(LINE_DEFS),
      fxRates: state.fxRates,
      trialBalance: tb,
      entities: state.entities,
    });
  });

  // 内部往来/交易核对（指定月份）
  router.get('/reconciliation/:month', (req, res) => {
    const result = consolidate(store.get(), req.params.month);
    res.json({
      month: req.params.month,
      reconciliations: result.reconciliations,
      urp: result.urp,
      entities: store.get().entities,
    });
  });

  // 原始内部单据（往来/购销/存货），用于来源追溯
  router.get('/ic-documents/:month', (req, res) => {
    const state = store.get();
    const month = req.params.month;
    res.json({
      balances: state.icBalances.filter((x) => x.month === month),
      sales: state.icSales.filter((x) => x.month === month),
      inventory: state.icInventory.filter((x) => x.month === month),
    });
  });

  // 抵消分录（指定月份，含系统与手工，带来源追溯）
  router.get('/entries/:month', (req, res) => {
    const result = consolidate(store.get(), req.params.month);
    res.json({ month: req.params.month, entries: result.entries });
  });

  // 少数股东权益/损益明细
  router.get('/nci/:month', (req, res) => {
    const result = consolidate(store.get(), req.params.month);
    res.json({ month: req.params.month, nci: result.nci });
  });

  // 合并底稿 + 校验
  router.get('/worksheet/:month', (req, res) => {
    const result = consolidate(store.get(), req.params.month);
    res.json({
      month: req.params.month,
      worksheet: result.worksheet,
      checks: result.checks,
      translated: result.translated,
    });
  });

  // 完整合并结果（一次取全）
  router.get('/consolidation/:month', (req, res) => {
    res.json(consolidate(store.get(), req.params.month));
  });

  // 手工底稿独立核对报告
  router.get('/manual-workbook', (_req, res) => {
    res.json(buildManualWorkbook(store.get()));
  });

  // 新增手工调整分录（必须填写理由，后端再校验一次）
  router.post('/manual-entries', (req, res) => {
    const input = req.body as ManualEntryInput;
    if (!input.month || !input.summary || !Array.isArray(input.dr) || !Array.isArray(input.cr)) {
      res.status(400).json({ error: '分录字段不完整' });
      return;
    }
    if (!input.reason || input.reason.trim().length < 4) {
      res.status(400).json({ error: '手工调整必须填写调整理由（至少4个字）' });
      return;
    }
    if (input.dr.length === 0 || input.cr.length === 0) {
      res.status(400).json({ error: '借贷方至少各一行' });
      return;
    }
    const drSum = input.dr.reduce((s, l) => s + l.amountCny, 0);
    const crSum = input.cr.reduce((s, l) => s + l.amountCny, 0);
    if (Math.abs(drSum - crSum) > 0.01) {
      res.status(400).json({ error: `借贷不平衡：借方 ${drSum}，贷方 ${crSum}` });
      return;
    }
    const entry = store.addManualEntry(input);
    res.status(201).json(entry);
  });

  // 删除手工分录
  router.delete('/manual-entries/:id', (req, res) => {
    const ok = store.deleteManualEntry(req.params.id);
    if (!ok) {
      res.status(404).json({ error: '分录不存在' });
      return;
    }
    res.json({ ok: true });
  });

  // 重置数据（清空手工分录，恢复种子）
  router.post('/reset', (_req, res) => {
    res.json(store.reset());
  });

  return router;
}
