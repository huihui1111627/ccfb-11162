import { useState } from 'react';
import type { Month } from '@consol/shared';
import { MONTHS, monthLabel } from './format.js';
import { OrgPage } from './pages/OrgPage.js';
import { CollectionPage } from './pages/CollectionPage.js';
import { ReconciliationPage } from './pages/ReconciliationPage.js';
import { EntriesPage } from './pages/EntriesPage.js';
import { WorksheetPage } from './pages/WorksheetPage.js';

const NAV = [
  { key: 'org', label: '组织架构与合并范围' },
  { key: 'collection', label: '报表采集' },
  { key: 'reconciliation', label: '内部往来核对' },
  { key: 'entries', label: '抵消分录' },
  { key: 'worksheet', label: '合并底稿' },
] as const;

type NavKey = (typeof NAV)[number]['key'];

export function App() {
  const [page, setPage] = useState<NavKey>('org');
  const [month, setMonth] = useState<Month>('2026-08');
  const [refreshKey, setRefreshKey] = useState(0);

  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          华源集团合并报表系统
          <small>内部往来抵消 · 外币折算 · 少数股东权益</small>
        </div>
        <nav className="nav">
          {NAV.map((n, i) => (
            <div
              key={n.key}
              className={`nav-item ${page === n.key ? 'active' : ''}`}
              onClick={() => setPage(n.key)}
            >
              <span className="idx">{i + 1}</span>
              {n.label}
            </div>
          ))}
        </nav>
      </aside>
      <div className="content">
        <div className="topbar">
          <h1>{NAV.find((n) => n.key === page)!.label}</h1>
          <div className="controls">
            <span className="muted">报告期间</span>
            <select value={month} onChange={(e) => setMonth(e.target.value as Month)}>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <main>
          {page === 'org' && <OrgPage month={month} />}
          {page === 'collection' && <CollectionPage month={month} />}
          {page === 'reconciliation' && <ReconciliationPage month={month} />}
          {page === 'entries' && <EntriesPage month={month} refreshKey={refreshKey} onChanged={bump} />}
          {page === 'worksheet' && <WorksheetPage month={month} refreshKey={refreshKey} />}
        </main>
      </div>
    </div>
  );
}
