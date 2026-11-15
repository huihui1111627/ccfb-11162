import { useEffect, useState } from 'react';
import type { Month } from '@consol/shared';
import { api, type ReconciliationResponse, type IcDocsResponse } from '../api.js';
import { fmt } from '../format.js';

interface Props {
  month: Month;
}

type Tab = 'BALANCE' | 'SALE' | 'URP' | 'DOCS';

export function ReconciliationPage({ month }: Props) {
  const [data, setData] = useState<ReconciliationResponse | null>(null);
  const [docs, setDocs] = useState<IcDocsResponse | null>(null);
  const [tab, setTab] = useState<Tab>('BALANCE');

  useEffect(() => {
    api.reconciliation(month).then(setData);
    api.icDocs(month).then(setDocs);
  }, [month]);

  if (!data || !docs) return <div className="loading">加载中…</div>;

  const nameOf = (id: string) => data.entities.find((e) => e.id === id)?.name ?? id;
  const curOf = (id: string) => data.entities.find((e) => e.id === id)?.functionalCurrency ?? '';
  const rows = data.reconciliations.filter((r) => r.kind === tab);
  const mismatchCount = data.reconciliations.filter((r) => Math.abs(r.difference) > 0.01).length;

  return (
    <div>
      <div className="panel">
        <h2>内部往来与内部交易核对（{month}，双方金额已统一折算为人民币）</h2>
        <div className="tabs">
          <div className={`tab ${tab === 'BALANCE' ? 'active' : ''}`} onClick={() => setTab('BALANCE')}>
            内部应收/应付（{data.reconciliations.filter((r) => r.kind === 'BALANCE').length}）
          </div>
          <div className={`tab ${tab === 'SALE' ? 'active' : ''}`} onClick={() => setTab('SALE')}>
            内部销售/采购（{data.reconciliations.filter((r) => r.kind === 'SALE').length}）
          </div>
          <div className={`tab ${tab === 'URP' ? 'active' : ''}`} onClick={() => setTab('URP')}>
            未实现内部利润（{data.urp.length}）
          </div>
          <div className={`tab ${tab === 'DOCS' ? 'active' : ''}`} onClick={() => setTab('DOCS')}>
            原始来源单据
          </div>
        </div>

        <div className="legend">
          本月共 {data.reconciliations.length} 组内部配对，其中 <strong className={mismatchCount ? 'neg' : 'pos'}>
          {mismatchCount}</strong> 组双方金额不一致；系统按核对一致金额（较小者）抵消，差额保留挂账并标注原因。
        </div>
      </div>

      {(tab === 'BALANCE' || tab === 'SALE') && (
        <div className="panel">
          <h2>{tab === 'BALANCE' ? '内部应收 vs 内部应付' : '内部销售收入 vs 内部采购'}</h2>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>单据号</th>
                  <th>甲方（{tab === 'BALANCE' ? '债务人·应收' : '卖方·收入'}）</th>
                  <th>乙方（{tab === 'BALANCE' ? '债权人·应付' : '买方·采购'}）</th>
                  <th className="num">甲方折CNY</th>
                  <th className="num">乙方折CNY</th>
                  <th className="num">可抵消额</th>
                  <th className="num">差额</th>
                  <th>差异原因</th>
                  <th>抵消分录</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td style={{ whiteSpace: 'normal' }}>{r.partyA}</td>
                    <td style={{ whiteSpace: 'normal' }}>{r.partyB}</td>
                    <td className="num">{fmt(r.amountA)}</td>
                    <td className="num">{fmt(r.amountB)}</td>
                    <td className="num">{fmt(r.matchedAmount)}</td>
                    <td className={`num diff-cell ${Math.abs(r.difference) > 0.01 ? 'neg' : 'pos'}`}>
                      {fmt(r.difference)}
                    </td>
                    <td>
                      <span className={`tag ${r.reasonCode === 'NONE' ? 'tag-ok' : 'tag-warn'}`}>
                        {r.reasonLabel}
                      </span>
                      {r.note && <div className="muted" style={{ fontSize: 12 }}>{r.note}</div>}
                    </td>
                    <td><code>{r.entryId}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'URP' && (
        <div className="panel">
          <h2>期末留存存货的未实现内部利润抵消（按存货留存比例测算）</h2>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>单据号</th>
                  <th>卖方</th>
                  <th>买方</th>
                  <th>交易方向</th>
                  <th className="num">留存内部存货(CNY)</th>
                  <th className="num">未实现利润(CNY)</th>
                  <th>抵消分录</th>
                </tr>
              </thead>
              <tbody>
                {data.urp.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.sellerId} {nameOf(u.sellerId)}（{curOf(u.sellerId)}）</td>
                    <td>{u.buyerId} {nameOf(u.buyerId)}（{curOf(u.buyerId)}）</td>
                    <td>
                      <span className={`tag ${u.direction === 'UPSTREAM' ? 'tag-warn' : 'tag-info'}`}>
                        {u.direction === 'UPSTREAM' ? '逆流（子→母），NCI 分摊' : '顺流（母→子）'}
                      </span>
                    </td>
                    <td className="num">{fmt(u.inventoryCny)}</td>
                    <td className="num neg">{fmt(u.urpCny)}</td>
                    <td><code>{u.entryId}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="legend">
            抵消分录：借 营业成本 / 贷 存货（剔除存货中内含的未实现利润）；逆流交易形成的未实现利润按少数股东比例冲减少数股东损益。
          </div>
        </div>
      )}

      {tab === 'DOCS' && (
        <div>
          <div className="panel">
            <h2>内部往来原始单据（双方本位币原值）</h2>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>单据号</th><th>债务人</th><th>债权人</th>
                    <th className="num">应收原值</th><th className="num">应付原值</th><th>原因</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.balances.map((b) => (
                    <tr key={b.id}>
                      <td>{b.id}</td>
                      <td>{b.debtorId}（{curOf(b.debtorId)}）</td>
                      <td>{b.creditorId}（{curOf(b.creditorId)}）</td>
                      <td className="num">{fmt(b.arAmountFc)}</td>
                      <td className="num">{fmt(b.apAmountFc)}</td>
                      <td>{b.reasonCode ?? 'NONE'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <h2>内部购销原始单据（YTD 本位币原值）</h2>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>单据号</th><th>卖方</th><th>买方</th>
                    <th className="num">卖方收入原值</th><th className="num">买方采购原值</th><th>原因</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.sales.map((s) => (
                    <tr key={s.id}>
                      <td>{s.id}</td>
                      <td>{s.sellerId}（{curOf(s.sellerId)}）</td>
                      <td>{s.buyerId}（{curOf(s.buyerId)}）</td>
                      <td className="num">{fmt(s.sellerRevenueFc)}</td>
                      <td className="num">{fmt(s.buyerPurchaseFc)}</td>
                      <td>{s.reasonCode ?? 'NONE'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <h2>内部留存存货原始单据</h2>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>单据号</th><th>卖方</th><th>买方</th>
                    <th className="num">买方留存存货原值</th><th className="num">内含未实现利润原值</th><th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.inventory.map((v) => (
                    <tr key={v.id}>
                      <td>{v.id}</td>
                      <td>{v.sellerId}</td>
                      <td>{v.buyerId}</td>
                      <td className="num">{fmt(v.inventoryBuyerFc)}</td>
                      <td className="num">{fmt(v.urpSellerFc)}</td>
                      <td className="muted">{v.note}</td>
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
