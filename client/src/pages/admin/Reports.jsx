import { useState, useEffect, useRef } from 'react';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/common/StatusBadge';
import API from '../../api/axios';
import { exportPDF, exportExcel, exportWord } from '../../utils/exportReport';

const REPORTS = [
  { key: 'schools',       label: 'My Schools Report',    icon: '🏫', desc: 'All assigned schools with status and details' },
  { key: 'status',        label: 'Status Report',        icon: '📊', desc: 'Status breakdown of your assigned schools' },
  { key: 'communication', label: 'Communication Report', icon: '💬', desc: 'Message activity across your schools' },
  { key: 'growth',        label: 'Monthly Report',       icon: '📈', desc: 'Monthly progress of your assigned schools' },
  { key: 'activity-logs', label: 'Activity Logs',        icon: '⏱',  desc: 'Your activity history' },
];

const EXPORT_FORMATS = [
  { key: 'pdf',   label: 'PDF',   icon: '📄' },
  { key: 'excel', label: 'Excel', icon: '📊' },
  { key: 'word',  label: 'Word',  icon: '📝' },
  { key: 'csv',   label: 'CSV',   icon: '📃' },
];

const AdminReports = () => {
  const [active,     setActive]     = useState('schools');
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [filters,    setFilters]    = useState({ status: '', fromDate: '', toDate: '', months: 6 });
  const exportRef = useRef(null);

  // Close export dropdown on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const fetchReport = async (type = active, fmt = 'json') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ format: fmt, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) });

      if (fmt === 'csv') {
        const token = localStorage.getItem('accessToken');
        const res   = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/reports/${type}?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${type}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setLoading(false);
        return;
      }

      const res = await API.get(`/reports/${type}?${params}`);
      setData(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleExport = async (fmt) => {
    setExportOpen(false);
    if (fmt === 'csv') { fetchReport(active, 'csv'); return; }

    setExporting(true);
    try {
      // Fetch full dataset (limit overrides pagination on activity-logs)
      const params = new URLSearchParams({ limit: 10000, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) });
      const res    = await API.get(`/reports/${active}?${params}`);
      const rows   = res.data?.rows || [];
      if (rows.length === 0) { alert('No data available to export for this report.'); return; }

      const label = REPORTS.find(r => r.key === active)?.label || active;
      if (fmt === 'pdf')   exportPDF(rows, label, active);
      if (fmt === 'excel') exportExcel(rows, label, active);
      if (fmt === 'word')  exportWord(rows, label, active);
    } catch (e) {
      console.error(e);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => { setData(null); fetchReport(active); }, [active]);

  const currentReport = REPORTS.find(r => r.key === active);

  return (
    <Layout>
      <div style={{ display: 'flex', gap: '1.25rem' }}>

        {/* Sidebar */}
        <div style={{ width: '200px', flexShrink: 0 }}>
          <div style={card}>
            <div style={sTitle}>Reports</div>
            {REPORTS.map(r => (
              <button key={r.key} onClick={() => setActive(r.key)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', marginBottom: '3px', background: active === r.key ? '#eef4fb' : 'transparent', color: active === r.key ? '#1a3a5c' : '#475569', fontWeight: active === r.key ? '700' : '400', fontSize: '0.82rem' }}>
                <span>{r.icon}</span><span>{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...card, marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.2rem' }}>{currentReport?.icon} {currentReport?.label}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{currentReport?.desc}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div ref={exportRef} style={{ position: 'relative' }}>
                  <button onClick={() => setExportOpen(o => !o)} disabled={loading || exporting}
                    style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', color: '#475569', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⬇ {exporting ? 'Exporting...' : 'Export Report'} <span style={{ fontSize: '0.6rem' }}>▼</span>
                  </button>
                  {exportOpen && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: '150px', padding: '4px', overflow: 'hidden' }}>
                      {EXPORT_FORMATS.map(f => (
                        <button key={f.key} onClick={() => handleExport(f.key)}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '0.55rem 0.75rem', border: 'none', borderRadius: '7px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', background: 'transparent', color: '#374151', fontSize: '0.8rem', fontWeight: '600' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span>{f.icon}</span> {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => fetchReport(active)} disabled={loading} style={{ padding: '0.5rem 1rem', background: '#1a3a5c', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', color: '#fff', fontFamily: 'inherit' }}>{loading ? '...' : '↻ Refresh'}</button>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
              {active === 'schools' && (
                <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} style={fSelect}>
                  <option value="">All Statuses</option>
                  {['New','Contacted','LOI Pending','LOI Received','Verification','Rejected','Completed'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {active === 'growth' && (
                <select value={filters.months} onChange={e => setFilters(f => ({ ...f, months: e.target.value }))} style={fSelect}>
                  {[3,6,12].map(m => <option key={m} value={m}>Last {m} months</option>)}
                </select>
              )}
              {['activity-logs','communication'].includes(active) && (
                <>
                  <input type="date" value={filters.fromDate} onChange={e => setFilters(f => ({ ...f, fromDate: e.target.value }))} style={fInput} />
                  <input type="date" value={filters.toDate} onChange={e => setFilters(f => ({ ...f, toDate: e.target.value }))} style={fInput} />
                </>
              )}
              <button onClick={() => fetchReport(active)} style={{ padding: '0.4rem 0.875rem', background: '#1a3a5c', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', color: '#fff', fontFamily: 'inherit' }}>Apply</button>
            </div>
          </div>

          {/* Table */}
          <div style={card}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>Generating report...</div>
            ) : !data?.rows?.length ? (
              <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</div>
                No data found
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {Object.keys(data.rows[0]).map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '0.6rem 0.875rem', fontSize: '0.68rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: i < data.rows.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                          {Object.entries(row).map(([k, v]) => (
                            <td key={k} style={{ padding: '0.6rem 0.875rem', color: '#374151', verticalAlign: 'middle', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {k === 'Status' ? <StatusBadge status={v} size="sm" /> : v || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #f1f5f9', fontSize: '0.72rem', color: '#94a3b8' }}>
                  {data.rows.length} records
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

const card   = { background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' };
const sTitle = { fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.75rem' };
const fSelect= { padding: '0.4rem 0.625rem', border: '1.5px solid #e2e8f0', borderRadius: '7px', fontSize: '0.8rem', outline: 'none', background: '#fff', fontFamily: 'inherit' };
const fInput = { padding: '0.4rem 0.625rem', border: '1.5px solid #e2e8f0', borderRadius: '7px', fontSize: '0.8rem', outline: 'none', fontFamily: 'inherit', width: '130px' };

export default AdminReports;
