import { useEffect, useState } from 'react';
import type { Month, ScopeDecision } from '@consol/shared';
import { api, type OrgResponse } from '../api.js';
import { currencyTag, pct } from '../format.js';

interface Props {
  month: Month;
}

export function OrgPage({ month }: Props) {
  const [org, setOrg] = useState<OrgResponse | null>(null);
  const [scope, setScope] = useState<ScopeDecision[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.org().then(setOrg);
  }, []);

  useEffect(() => {
    api.scope(month).then((r) => setScope(r.scope));
  }, [month]);

  if (!org || !scope) return <div className="loading">加载中…</div>;

  const scopeMap = new Map(scope.map((s) => [s.entityId, s]));
  const childrenOf = (id: string) => org.edges.filter((e) => e.shareholderId === id);

  const renderNode = (id: string, depth: number): JSX.Element => {
    const entity = org.entities.find((e) => e.id === id)!;
    const info = org.ownershipInfo[id];
    const decision = scopeMap.get(id);
    const included = decision?.included;
    return (
      <div className="org-node" key={id}>
        <div className="entity-card">
          <strong>{entity.id}</strong>
          <span>{entity.name}</span>
          <span className={`tag ${entity.functionalCurrency === 'CNY' ? 'tag-gray' : 'tag-info'}`}>
            {currencyTag(entity.functionalCurrency).label}
          </span>
          {info && entity.tier > 0 && (
            <span className="tag tag-info">有效持股 {pct(info.effectiveOwnership)}</span>
          )}
          {entity.acquiredMonth && <span className="tag tag-warn">收购月 {entity.acquiredMonth}</span>}
          {entity.disposedMonth && <span className="tag tag-warn">处置月 {entity.disposedMonth}</span>}
          <span className={`tag ${included ? 'tag-ok' : 'tag-bad'}`}>
            {included ? '本月纳入合并' : '本月不纳入'}
          </span>
          <button className="ghost" onClick={() => setSelected(selected === id ? null : id)}>
            {selected === id ? '收起依据' : '判定依据'}
          </button>
        </div>
        {selected === id && decision && (
          <div className="basis-box">
            <div><strong>持股链：</strong>{decision.chain}</div>
            <div style={{ marginTop: 6 }}><strong>纳入判断：</strong>{decision.basis}</div>
            {entity.note && <div style={{ marginTop: 6 }} className="muted">主体说明：{entity.note}</div>}
            {info?.controlBasis && <div style={{ marginTop: 6 }} className="muted">控制依据：{info.controlBasis}</div>}
          </div>
        )}
        {childrenOf(id).length > 0 && (
          <div className="org-children">
            {childrenOf(id).map((edge) => {
              const child = org.entities.find((e) => e.id === edge.investeeId)!;
              return (
                <div key={edge.investeeId}>
                  <div className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                    └ 直接持股 {(edge.directPct * 100).toFixed(1)}%
                    {!edge.hasControl && '（不控制）'}
                  </div>
                  {renderNode(child.id, depth + 1)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const includedCount = scope.filter((s) => s.included).length;

  return (
    <div>
      <div className="panel">
        <h2>集团三层持股结构（{month}）</h2>
        <div className="org-tree">{renderNode('P', 0)}</div>
        <div className="legend">
          共 {org.entities.length} 家法人主体，本月纳入合并 <strong>{includedCount}</strong> 家；
          其中 A2（持股45%但一致行动+董事会多数）、D1（持股40%但受托经营）为持股不过半的实质控制案例；
          F1 为持股40%的联营企业，不纳入合并。
        </div>
      </div>

      <div className="panel">
        <h2>全部主体合并范围判定一览</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>主体</th>
                <th>名称</th>
                <th>层级</th>
                <th>本位币</th>
                <th className="num">有效持股</th>
                <th>本月是否纳入</th>
                <th>年中事件</th>
                <th>判定依据</th>
              </tr>
            </thead>
            <tbody>
              {scope.map((s) => {
                const e = org.entities.find((x) => x.id === s.entityId)!;
                return (
                  <tr key={s.entityId}>
                    <td><strong>{s.entityId}</strong></td>
                    <td>{e.name}</td>
                    <td>第{e.tier}层</td>
                    <td>{e.functionalCurrency}</td>
                    <td className="num">{s.effectiveOwnership === null ? '-' : pct(s.effectiveOwnership)}</td>
                    <td>
                      <span className={`tag ${s.included ? 'tag-ok' : 'tag-bad'}`}>
                        {s.included ? '纳入' : '不纳入'}
                      </span>
                    </td>
                    <td>
                      {s.periodEvent === 'ACQUIRED' && <span className="tag tag-warn">收购并入</span>}
                      {s.periodEvent === 'DISPOSED' && <span className="tag tag-warn">处置</span>}
                      {!s.periodEvent && <span className="muted">-</span>}
                    </td>
                    <td style={{ whiteSpace: 'normal', minWidth: 380 }}>{s.basis}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
