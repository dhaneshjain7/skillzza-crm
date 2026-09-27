import { useState } from 'react';
import API from '../../api/axios';
import { exportPDF, exportExcel, exportWord, exportCSV } from '../../utils/exportReport';

// "Ask about your data" — read-only AI Q&A + 7 named BI dashboards, shared by
// the SuperAdmin Admins page (full-platform view) and the Admin Activity page
// (automatically scoped server-side to just that admin's assigned schools —
// see server/controllers/aiController.js). The component itself never scopes
// anything; it just calls the same endpoint and renders whatever comes back.

const EXPORT_FORMATS = [
  { key: 'pdf',   label: 'PDF',   icon: '📄' },
  { key: 'excel', label: 'Excel', icon: '📊' },
  { key: 'word',  label: 'Word',  icon: '📝' },
  { key: 'csv',   label: 'CSV',   icon: '📃' },
];

// Flattens either shape of AI-generated visualization into export-ready rows.
const buildVizExportRows = (viz) => {
  if (!viz) return [];
  if (viz.type === 'table') {
    return viz.rows.map(row => Object.fromEntries(viz.columns.map((c, i) => [c, row[i]])));
  }
  if (viz.type === 'bar') {
    return viz.categories.map((cat, i) => {
      const row = { Category: cat };
      viz.series.forEach(s => { row[s.name] = s.values[i]; });
      return row;
    });
  }
  return [];
};

const DEFAULT_EXAMPLE_QUESTIONS = [
  'How many states, districts, teachers and students are currently covered?',
  'Which activities are currently behind plan?',
  'Which states have the highest teacher engagement?',
  'Which states have the lowest POE submission percentage?',
  'Which state has the highest percentage of inactive schools?',
  'Compare Q1 versus Q2 student engagement state-wise.',
];

// Seven named BI dashboards — each is answered deterministically in code (not
// by the LLM) for exactness; see server/utils/biDashboards.js. Query text here
// must match one of that file's aliases for each dashboard.
const BI_DASHBOARDS = [
  { label: '🎯 Command Centre',            query: 'Command Centre' },
  { label: '🗺️ Geographic Performance',    query: 'Geographic Performance' },
  { label: '🚀 Peak MAU War Room',          query: 'Peak MAU War Room' },
  { label: '👤 AM Command Centre',          query: 'Account Manager Command Centre' },
  { label: '🏫 School 360°',                query: 'School 360°' },
  { label: '🧑‍🤝‍🧑 Engagement Dashboard',       query: 'Teacher & Student Engagement' },
  { label: '⚠️ Risk & Action Centre',       query: 'Risk & Action Centre' },
];

const AnalyticsQueryPanel = ({ exampleQuestions = DEFAULT_EXAMPLE_QUESTIONS, showBiDashboards = true }) => {
  const [analyticsQuery,   setAnalyticsQuery]   = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsAnswer,  setAnalyticsAnswer]  = useState('');
  const [analyticsViz,     setAnalyticsViz]     = useState(null);
  const [analyticsError,   setAnalyticsError]   = useState('');
  const [analyticsMeta,    setAnalyticsMeta]    = useState(null);

  const askAnalytics = async (q) => {
    const question = (q ?? analyticsQuery).trim();
    if (!question) return;
    setAnalyticsQuery(question);
    setAnalyticsLoading(true);
    setAnalyticsError('');
    setAnalyticsAnswer('');
    setAnalyticsViz(null);
    try {
      const { data } = await API.post('/ai/analytics-query', { query: question });
      setAnalyticsAnswer(data.answer);
      setAnalyticsViz(data.visualization && data.visualization.type !== 'none' ? data.visualization : null);
      setAnalyticsMeta({ fiscalYear: data.currentFiscalYear, quarter: data.currentQuarter });
    } catch (err) {
      setAnalyticsError(err.response?.data?.message || 'Could not answer that question. Please try again.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleAnalyticsSubmit = (e) => { e.preventDefault(); askAnalytics(); };

  return (
    <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', padding: '1.1rem 1.25rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '1rem' }}>✨</span>
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>Ask about your data</h3>
        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>— read-only, cannot change any records</span>
      </div>
      <form onSubmit={handleAnalyticsSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input type="text" placeholder='e.g. "Which states have the lowest POE submission percentage?"'
          value={analyticsQuery} onChange={e => setAnalyticsQuery(e.target.value)}
          style={{ flex: 1, padding: '0.55rem 0.875rem', border: '1.5px solid #c7d2fe', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', background: '#f5f7ff' }} />
        <button type="submit" disabled={analyticsLoading || !analyticsQuery.trim()}
          style={{ background: '#4338ca', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.55rem 1.1rem', fontSize: '0.875rem', fontWeight: '600', cursor: analyticsLoading ? 'default' : 'pointer', fontFamily: 'inherit', opacity: analyticsLoading || !analyticsQuery.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}>
          {analyticsLoading ? 'Thinking...' : '✨ Ask'}
        </button>
      </form>

      {showBiDashboards && (
        <div style={{ marginBottom: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.35rem' }}>
            BI Dashboards
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {BI_DASHBOARDS.map(d => (
              <button key={d.query} type="button" onClick={() => askAnalytics(d.query)} disabled={analyticsLoading}
                style={{ padding: '0.32rem 0.7rem', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '20px', fontSize: '0.72rem', color: '#4338ca', fontWeight: '600', cursor: analyticsLoading ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: analyticsAnswer || analyticsError ? '0.9rem' : 0 }}>
        {exampleQuestions.map(q => (
          <button key={q} type="button" onClick={() => askAnalytics(q)} disabled={analyticsLoading}
            style={{ padding: '0.3rem 0.65rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '20px', fontSize: '0.72rem', color: '#475569', cursor: analyticsLoading ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {q}
          </button>
        ))}
      </div>

      {analyticsLoading && (
        <div style={{ padding: '0.9rem', color: '#94a3b8', fontSize: '0.85rem' }}>Analyzing the data...</div>
      )}
      {analyticsError && (
        <div style={{ padding: '0.75rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
          ⚠️ {analyticsError}
        </div>
      )}
      {analyticsAnswer && !analyticsLoading && (
        <div style={{ padding: '0.9rem 1rem', borderRadius: '8px', fontSize: '0.85rem', lineHeight: 1.6, background: '#eef2ff', color: '#312e81', border: '1px solid #c7d2fe', whiteSpace: 'pre-wrap' }}>
          {analyticsAnswer}
          {analyticsMeta && (
            <div style={{ marginTop: '0.6rem', fontSize: '0.68rem', color: '#6366f1', fontStyle: 'italic' }}>
              Based on data as of now · FY {analyticsMeta.fiscalYear}, {analyticsMeta.quarter?.toUpperCase()}
            </div>
          )}
        </div>
      )}
      {analyticsViz && !analyticsLoading && (
        <div style={{ marginTop: '0.9rem', padding: '1rem', borderRadius: '8px', background: '#fff', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
            {analyticsViz.title ? <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1e293b' }}>{analyticsViz.title}</div> : <div />}
            <VizDownloadMenu viz={analyticsViz} />
          </div>
          {analyticsViz.type === 'bar' && <SimpleBarChart categories={analyticsViz.categories} series={analyticsViz.series} />}
          {analyticsViz.type === 'table' && <SimpleTable columns={analyticsViz.columns} rows={analyticsViz.rows} />}
        </div>
      )}
    </div>
  );
};

// ── Analytics visualization renderers ──────────────────────────────────────
const CHART_COLORS = ['#4338ca', '#f59e0b', '#059669', '#dc2626', '#0891b2', '#7c3aed'];

// Download button for the AI-generated table/chart — same dropdown pattern used
// elsewhere in the app (PDF/Excel/Word/CSV), built from the visualization's data.
const VizDownloadMenu = ({ viz }) => {
  const [open, setOpen] = useState(false);
  const rows = buildVizExportRows(viz);

  const handleExport = (fmt) => {
    setOpen(false);
    if (rows.length === 0) return;
    const label = viz.title || 'AI Query Result';
    if (fmt === 'pdf')   exportPDF(rows, label, 'ai_query_result');
    if (fmt === 'excel') exportExcel(rows, label, 'ai_query_result');
    if (fmt === 'word')  exportWord(rows, label, 'ai_query_result');
    if (fmt === 'csv')   exportCSV(rows, label, 'ai_query_result');
  };

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" disabled={rows.length === 0} onClick={() => setOpen(o => !o)}
        style={{ padding: '0.4rem 0.8rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: rows.length === 0 ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: '600', color: '#475569', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px', opacity: rows.length === 0 ? 0.5 : 1 }}>
        ⬇ Download <span style={{ fontSize: '0.55rem' }}>▼</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: '150px', padding: '4px', overflow: 'hidden' }}>
          {EXPORT_FORMATS.map(f => (
            <button key={f.key} type="button" onClick={() => handleExport(f.key)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '0.55rem 0.75rem', border: 'none', borderRadius: '7px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', background: 'transparent', color: '#374151', fontSize: '0.8rem', fontWeight: '600' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span>{f.icon}</span> {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SimpleBarChart = ({ categories, series }) => {
  const max = Math.max(1, ...series.flatMap(s => s.values));
  return (
    <div>
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {series.map((s, i) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#475569' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: CHART_COLORS[i % CHART_COLORS.length], display: 'inline-block' }} />
              {s.name}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '18px', height: '160px', overflowX: 'auto', padding: '0 4px' }}>
        {categories.map((cat, ci) => (
          <div key={cat} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0, minWidth: `${Math.max(36, series.length * 18)}px` }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '130px' }}>
              {series.map((s, si) => {
                const v = s.values[ci] ?? 0;
                return (
                  <div key={s.name} title={`${s.name}: ${v}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <span style={{ fontSize: '0.62rem', color: '#64748b', marginBottom: '2px' }}>{v}</span>
                    <div style={{ width: '14px', background: CHART_COLORS[si % CHART_COLORS.length], borderRadius: '3px 3px 0 0', height: `${Math.max((v / max) * 110, 2)}px`, transition: 'height 0.3s' }} />
                  </div>
                );
              })}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: '600', textAlign: 'center', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cat}>{cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SimpleTable = ({ columns, rows }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: `${columns.length * 130}px` }}>
      <thead>
        <tr>
          {columns.map(c => (
            <th key={c} style={{ padding: '0.5rem 0.7rem', background: '#f8fafc', color: '#475569', fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', border: '1px solid #f1f5f9', whiteSpace: 'nowrap', textAlign: 'left' }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} style={{ padding: '0.5rem 0.7rem', border: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#374151' }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default AnalyticsQueryPanel;
