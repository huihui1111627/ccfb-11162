import { useEffect, useState } from 'react';
import type {
  EliminationEntry,
  LineCode,
  ManualEntryInput,
  Month,
  NciRow,
} from '@consol/shared';
import { CHART_OF_ACCOUNTS } from '@consol/shared';
import { api } from '../api.js';
import { fmt, monthLabel } from '../format.js';

interface Props {
  month: Month;
  refreshKey: number;
  onChanged: () => void;
}

const TYPE_LABEL: Record<EliminationEntry['type'], string> = {
  IC_BALANCE: '内部往来抵消',
  IC_SALE: '内部交易抵消',
  URP: '未实现利润抵消',
  INVESTMENT: '长投/权益抵消',
  NCI: '少数股东重分类',
  PROFIT_CARRY: '利润结转',
  FX_RECLASS: '折算重分类',
  MANUAL: '手工调整',
};

const SELECTABLE_LINES = CHART_OF_ACCOUNTS.filter((l) => !l.derived).map((l) => ({
  value: l.code,
  label: l.label,
}));

interface DraftLine {
  line: LineCode;
  amount: string;
}

export function EntriesPage({ month, refreshKey, onChanged }: Props) {
  const [entries, setEntries] = useState<EliminationEntry[]>([]);
  const [nci, setNci] = useState<NciRow[]>([]);
  const [filter, setFilter] = useState<string>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [summary, setSummary] = useState('');
  const [reason, setReason] = useState('');
  const [docIds, setDocIds] = useState('');
  const [drLines, setDrLines] = useState<DraftLine[]>([{ line: 'cogs', amount: '' }]);
  const [crLines, setCrLines] = useState<DraftLine[]>([{ line: 'inventory', amount: '' }]);

  const load = () => {
    api.entries(month).then((r) => setEntries(r.entries));
    api.nci(month).then((r) => setNci(r.nci));
  };

  useEffect(load, [month, refreshKey]);

  const filtered = filter === 'ALL' ? entries : entries.filter((e) => e.type === filter);
  const labelOf = (code: LineCode) => CHART_OF_ACCOUNTS.find((l) => l.code === code)?.label ?? code;

  const sum = (lines: DraftLine[]) =>
    lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const submit = async () => {
    setError(null);
    try {
      const input: ManualEntryInput = {
        month,
        summary,
        reason,
        sourceDocIds: docIds.split(/[,，\s]+/).filter(Boolean),
        dr: drLines.map((l) => ({ line: l.line, amountCny: Number(l.amount) })),
        cr: crLines.map((l) => ({ line: l.line, amountCny: Number(l.amount) })),
      };
      await api.addManualEntry(input);
      setShowForm(false);
      setSummary('');
      setReason('');
      setDocIds('');
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    await api.deleteManualEntry(id);
    onChanged();
  };

  return (
    <div>
      <div className="panel">
        <h2>抵消分录与手工调整（{monthLabel(month)}，金额单位：人民币元）</h2>
        <div className="tabs">
          <div className={`tab ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>
            全部（{entries.length}）
          </div>
          {Object.entries(TYPE_LABEL).map(([k, v]) => {
            const count = entries.filter((e) => e.type === k).length;
            if (count === 0 && k !== 'MANUAL') return null;
            return (
              <div key={k} className={`tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
                {v}（{count}）
              </div>
            );
          })}
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowForm(!showForm)}>
            {showForm ? '收起录入' : '＋ 新增手工调整分录'}
          </button>
        </div>
        <div className="legend">
          系统分录均可点击展开查看借贷明细，并通过"来源单据"字段追溯到内部配对单/存货单/持股快照；
          手工调整必须填写调整理由，且后端强制校验借贷平衡。
        </div>
      </div>

      {showForm && (
        <div className="panel">
          <h2>手工调整分录（理由必填）</h2>
          {error && <div className="error-banner">{error}</div>}
          <div className="form-grid">
            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label>分录摘要</label>
              <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="例如：补提某子公司坏账准备的合并调整" />
            </div>
            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label>调整理由（必填，至少4个字）</label>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="说明调整的业务原因、依据和影响" />
            </div>
            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label>关联原始单据号（逗号分隔，可留空）</label>
              <input value={docIds} onChange={(e) => setDocIds(e.target.value)} placeholder="例如：BAL-B04-2026-08" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <h3>借方（合计 {fmt(sum(drLines))}）</h3>
              {drLines.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select
                    value={l.line}
                    onChange={(e) => setDrLines(drLines.map((x, j) => (j === i ? { ...x, line: e.target.value as LineCode } : x)))}
                  >
                    {SELECTABLE_LINES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input
                    type="number"
                    value={l.amount}
                    onChange={(e) => setDrLines(drLines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                    placeholder="金额"
                    style={{ width: 140 }}
                  />
                  <button className="ghost" onClick={() => setDrLines(drLines.filter((_, j) => j !== i))}>删</button>
                </div>
              ))}
              <button className="ghost" onClick={() => setDrLines([...drLines, { line: 'cogs', amount: '' }])}>＋ 借方行</button>
            </div>
            <div>
              <h3>贷方（合计 {fmt(sum(crLines))}）</h3>
              {crLines.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select
                    value={l.line}
                    onChange={(e) => setCrLines(crLines.map((x, j) => (j === i ? { ...x, line: e.target.value as LineCode } : x)))}
                  >
                    {SELECTABLE_LINES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input
                    type="number"
                    value={l.amount}
                    onChange={(e) => setCrLines(crLines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                    placeholder="金额"
                    style={{ width: 140 }}
                  />
                  <button className="ghost" onClick={() => setCrLines(crLines.filter((_, j) => j !== i))}>删</button>
                </div>
              ))}
              <button className="ghost" onClick={() => setCrLines([...crLines, { line: 'inventory', amount: '' }])}>＋ 贷方行</button>
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={submit}>提交手工分录</button>
            <span className={Math.abs(sum(drLines) - sum(crLines)) <= 0.01 ? 'pos' : 'neg'}>
              借贷差额：{fmt(sum(drLines) - sum(crLines))}（不平衡时后端拒绝）
            </span>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>分录明细（{filtered.length} 笔）</h2>
        {filtered.map((e) => (
          <EntryCard key={e.id} entry={e} labelOf={labelOf} onDelete={e.source === 'manual' ? remove : undefined} />
        ))}
      </div>

      <div className="panel">
        <h2>少数股东权益与损益自动计算（{monthLabel(month)}）</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>子公司</th>
                <th className="num">集团有效持股</th>
                <th className="num">少数股东比例</th>
                <th className="num">折算后净资产</th>
                <th className="num">少数股东权益</th>
                <th className="num">当期净利润</th>
                <th className="num">少数股东损益</th>
              </tr>
            </thead>
            <tbody>
              {nci.map((n) => (
                <tr key={n.entityId}>
                  <td><strong>{n.entityId}</strong></td>
                  <td className="num">{((1 - n.nciPct) * 100).toFixed(2)}%</td>
                  <td className="num">{(n.nciPct * 100).toFixed(2)}%</td>
                  <td className="num">{fmt(n.equityCny)}</td>
                  <td className="num">{fmt(n.nciEquityCny)}</td>
                  <td className="num">{fmt(n.netProfitCny)}</td>
                  <td className="num">{fmt(n.nciPlCny)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend">全资子公司（B1、D2 等）NCI 比例与金额均为 0；逆流交易未实现利润已按 NCI 比例冲减少数股东损益。</div>
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  labelOf,
  onDelete,
}: {
  entry: EliminationEntry;
  labelOf: (c: LineCode) => string;
  onDelete?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const drSum = entry.dr.reduce((s, l) => s + l.amountCny, 0);
  const crSum = entry.cr.reduce((s, l) => s + l.amountCny, 0);
  return (
    <div className="entry-card">
      <div className="entry-head">
        <div>
          <span className={`tag ${entry.source === 'manual' ? 'tag-warn' : 'tag-info'}`}>
            {entry.source === 'manual' ? '手工调整' : '系统生成'}
          </span>
          <span className="tag tag-gray" style={{ marginLeft: 6 }}>{TYPE_LABEL[entry.type]}</span>
          <strong style={{ marginLeft: 8 }}>{entry.id}</strong>
          <div style={{ marginTop: 6 }}>{entry.summary}</div>
          {entry.source === 'manual' && entry.reason && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              <strong>调整理由：</strong>{entry.reason}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            来源追溯：{entry.sourceRefs.kind} → {entry.sourceRefs.ids.join('、') || '（无）'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={Math.abs(entry.balanceCheck) <= 0.01 ? 'pos' : 'neg'}>
            借 {fmt(drSum)} / 贷 {fmt(crSum)}
          </span>
          <button className="ghost" onClick={() => setOpen(!open)}>{open ? '收起' : '展开'}</button>
          {onDelete && <button className="danger" onClick={() => onDelete(entry.id)}>删除</button>}
        </div>
      </div>
      {open && (
        <table>
          <thead>
            <tr><th>方向</th><th>报表项目</th><th className="num">金额(CNY)</th></tr>
          </thead>
          <tbody>
            {entry.dr.map((l, i) => (
              <tr key={`d${i}`}><td>借</td><td>{labelOf(l.line)}</td><td className="num">{fmt(l.amountCny)}</td></tr>
            ))}
            {entry.cr.map((l, i) => (
              <tr key={`c${i}`}><td>贷</td><td>{labelOf(l.line)}</td><td className="num">{fmt(l.amountCny)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
