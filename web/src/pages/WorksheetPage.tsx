import { useEffect, useState } from 'react';
import type {
  ConsolidationResult,
  ManualWorkbook,
  Month,
} from '@consol/shared';
import { api } from '../api.js';
import { fmt, monthLabel } from '../format.js';

interface Props {
  month: Month;
  refreshKey: number;
}

type Tab = 'WORKSHEET' | 'CHECKS' | 'MANUAL';

export function WorksheetPage({ month, refreshKey }: Props) {
  const [data, setData] = useState<ConsolidationResult | null>(null);
  const [manual, setManual] = useState<ManualWorkbook | null>(null);
  const [tab, setTab] = useState<Tab>('WORKSHEET');

  useEffect(() => {
    api.consolidation(month).then(setData);
  }, [month, refreshKey]);

  useEffect(() => {
    api.manualWorkbook().then(setManual);
  }, []);

  if (!data) return <div className="loading">加载中…</div>;

  const bs = data.worksheet.filter((r) => r.section === 'BS');
  const isRows = data.worksheet.filter((r) => r.section === 'IS');

  return (
    <div>
      <div className="panel">
        <h2>合并工作底稿（{monthLabel(month)}，单位：人民币元）</h2>
        <div className="tabs">
          <div className={`tab ${tab === 'WORKSHEET' ? 'active' : ''}`} onClick={() => setTab('WORKSHEET')}>合并底稿</div>
          <div className={`tab ${tab === 'CHECKS' ? 'active' : ''}`} onClick={() => setTab('CHECKS')}>
            配平校验（{data.checks.filter((c) => c.ok).length}/{data.checks.length} 通过）
          </div>
          <div className={`tab ${tab === 'MANUAL' ? 'active' : ''}`} onClick={() => setTab('MANUAL')}>
            手工底稿核对（{manual?.month}）
          </div>
        </div>
        <div className="legend">
          个别数 = 纳入合并各主体折算后 CNY 报表汇总；借方科目 合并数 = 个别数 + 抵消借 − 抵消贷，
          贷方科目 合并数 = 个别数 + 抵消贷 − 抵消借；合计行由合并后明细重新计算。
        </div>
      </div>

      {tab === 'WORKSHEET' && (
        <>
          <SheetTable title="一、合并资产负债表底稿" rows={bs} />
          <SheetTable title="二、合并利润表底稿" rows={isRows} />
        </>
      )}

      {tab === 'CHECKS' && (
        <div className="panel">
          <h2>合并结果自动校验</h2>
          <div className="checks">
            {data.checks.map((c) => (
              <div key={c.name} className={`check-item ${c.ok ? 'ok' : 'fail'}`}>
                <strong>
                  <span className={`tag ${c.ok ? 'tag-ok' : 'tag-bad'}`}>{c.ok ? '通过' : '异常'}</span>{' '}
                  {c.name}
                </strong>
                <div className="detail">{c.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'MANUAL' && manual && (
        <div>
          <div className="panel">
            <h2>独立手工合并底稿（{manual.month}）与系统结果逐项核对</h2>
            <div className={`tag ${manual.allMatch ? 'tag-ok' : 'tag-bad'}`} style={{ fontSize: 14, padding: '6px 14px' }}>
              {manual.allMatch
                ? `✓ 全部 ${manual.comparison.length} 个报表行手工重算与系统结果完全一致，差额均为 0`
                : '✗ 存在不符项，请排查'}
            </div>
            <h3>手工编制步骤（独立于引擎，从原始数据按准则重算）</h3>
            {manual.steps.map((s, i) => (
              <div key={i} className="basis-box" style={{ marginBottom: 8 }}>
                <strong>{s.title}</strong>
                <div style={{ marginTop: 6, whiteSpace: 'pre-line' }}>{s.detail}</div>
              </div>
            ))}
            <h3>关键指标</h3>
            <table>
              <thead><tr><th>指标</th><th className="num">数值</th><th>计算口径</th></tr></thead>
              <tbody>
                {manual.metrics.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td className="num">{fmt(m.value)}</td>
                    <td className="muted">{m.formula}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h2>逐行核对：手工数 vs 系统数</h2>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>报表行</th>
                    <th className="num">手工合并数</th>
                    <th className="num">系统合并数</th>
                    <th className="num">差额</th>
                    <th>核对结果</th>
                  </tr>
                </thead>
                <tbody>
                  {manual.comparison.map((c) => (
                    <tr key={c.line}>
                      <td>{c.label}</td>
                      <td className="num">{fmt(c.manual)}</td>
                      <td className="num">{fmt(c.system)}</td>
                      <td className="num diff-cell">{fmt(c.diff)}</td>
                      <td>
                        <span className={c.match ? 'match-ok' : 'match-bad'}>
                          {c.match ? '✓ 一致' : '✗ 不符'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SheetTable({
  title,
  rows,
}: {
  title: string;
  rows: ConsolidationResult['worksheet'];
}) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>报表项目</th>
              <th className="num">个别数（汇总）</th>
              <th className="num">抵消借方</th>
              <th className="num">抵消贷方</th>
              <th className="num">合并数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.line} className={r.line.startsWith('total') || ['net_profit', 'parent_pl'].includes(r.line) ? 'section-row' : ''}>
                <td>{r.label}</td>
                <td className="num">{fmt(r.individual)}</td>
                <td className="num">{r.elimDr ? fmt(r.elimDr) : '-'}</td>
                <td className="num">{r.elimCr ? fmt(r.elimCr) : '-'}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmt(r.consolidated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
