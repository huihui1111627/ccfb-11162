import { useEffect, useMemo, useState } from 'react';
import type { Month } from '@consol/shared';
import { api, type CollectionResponse } from '../api.js';
import { currencyTag, fmt } from '../format.js';

interface Props {
  month: Month;
}

export function CollectionPage({ month }: Props) {
  const [data, setData] = useState<CollectionResponse | null>(null);
  const [entityId, setEntityId] = useState<string>('P');

  useEffect(() => {
    api.collection(entityId, month).then(setData);
  }, [entityId, month]);

  const entity = useMemo(() => data?.entities.find((e) => e.id === entityId), [data, entityId]);
  const rates = useMemo(
    () => data?.fxRates.filter((r) => r.month === month) ?? [],
    [data, month],
  );

  if (!data || !entity) return <div className="loading">加载中…</div>;

  const rows = data.trialBalance.filter((t) => t.entityId === entityId && t.month === month);
  const bs = rows.filter((r) => data.lineDefs.find((d) => d.code === r.line)?.section === 'BS');
  const is = rows.filter((r) => data.lineDefs.find((d) => d.code === r.line)?.section === 'IS');
  const labelOf = (code: string) => data.lineDefs.find((d) => d.code === code)?.label ?? code;

  return (
    <div>
      <div className="panel">
        <h2>报表采集（各子公司月报 · 本位币 · 年初至本月末 YTD 累计口径）</h2>
        <div className="form-grid">
          <div className="form-field">
            <label>选择报送主体</label>
            <select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {data.entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id} · {e.name}（{e.functionalCurrency}）
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>记账本位币</label>
            <div style={{ paddingTop: 8 }}>
              <span className={`tag tag-info ${currencyTag(entity.functionalCurrency).cls}`}>
                {currencyTag(entity.functionalCurrency).label}
              </span>
            </div>
          </div>
          <div className="form-field">
            <label>报告期备注</label>
            <div style={{ paddingTop: 8 }} className="muted">
              {entity.acquiredMonth && `收购月：${entity.acquiredMonth}；`}
              {entity.disposedMonth && `处置月：${entity.disposedMonth}；`}
              {!entity.acquiredMonth && !entity.disposedMonth && '全年在集团内；'}
              资产负债表为时点数，利润表为 YTD 累计数
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>当月汇率（1 外币 = X 人民币）</h2>
        <table>
          <thead>
            <tr>
              <th>币种</th>
              <th className="num">期末汇率（资产负债表用）</th>
              <th className="num">平均汇率（利润表用）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CNY 人民币</td>
              <td className="num">1.0000</td>
              <td className="num">1.0000</td>
            </tr>
            {rates.map((r) => (
              <tr key={r.currency}>
                <td>{r.currency}</td>
                <td className="num">{r.closingRate.toFixed(4)}</td>
                <td className="num">{r.averageRate.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>资产负债表（{entity.functionalCurrency}，期末时点数）</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr><th>项目</th><th className="num">本位币金额</th></tr>
            </thead>
            <tbody>
              {bs.map((r) => (
                <tr key={r.line} className={data.lineDefs.find((d) => d.code === r.line)?.derived ? 'section-row' : ''}>
                  <td>{labelOf(r.line)}</td>
                  <td className="num">{fmt(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>利润表（{entity.functionalCurrency}，YTD 累计）</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr><th>项目</th><th className="num">本位币金额</th></tr>
            </thead>
            <tbody>
              {is.map((r) => (
                <tr key={r.line} className={data.lineDefs.find((d) => d.code === r.line)?.derived ? 'section-row' : ''}>
                  <td>{labelOf(r.line)}</td>
                  <td className="num">{fmt(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
