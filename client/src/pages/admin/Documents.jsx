import { useState, useEffect, useRef } from 'react';
import downloadFile from '../../utils/downloadFile';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import API from '../../api/axios';

const STATUS_STYLE = {
  'Pending':             { bg: '#fef9c3', color: '#854d0e' },
  'Approved':            { bg: '#d1fae5', color: '#065f46' },
  'Rejected':            { bg: '#fee2e2', color: '#991b1b' },
  'Re-upload Requested': { bg: '#ffedd5', color: '#9a3412' },
};

const DOC_TYPE_LABELS = {
  school_approval:        'LOI',
  student_data:           'Student Data',
  teacher_data:           'Teacher Data',
  adobe_student_accounts: 'Adobe Student IDs',
  adobe_teacher_accounts: 'Adobe Teacher IDs',
};

const SEND_TYPES = [
  { key: 'adobe_student_accounts', label: 'Adobe Student IDs', icon: '🎓', desc: 'Name, ID, PW, School Name, Class Section, UDISE Code, City, State' },
  { key: 'adobe_teacher_accounts', label: 'Adobe Teacher IDs', icon: '👩‍🏫', desc: 'Name, ID, PW, School Name, UDISE Code, City, State' },
];

const AdminDocuments = () => {
  const { schoolId } = useParams();
  const navigate     = useNavigate();
  const [school,    setSchool]    = useState(null);
  const [documents, setDocuments] = useState({});
  const [loading,   setLoading]   = useState(true);
  const [reviewing, setReviewing] = useState(null); // doc being reviewed
  const [viewing,   setViewing]   = useState(null); // doc being previewed in-platform
  const [reviewForm,setReviewForm]= useState({ status: '', rejectReason: '' });
  const [saving,    setSaving]    = useState(false);

  // Send-to-school (Adobe accounts) upload state
  const [sendType,      setSendType]      = useState('adobe_student_accounts');
  const [sendFile,      setSendFile]      = useState(null);
  const [sendValidation,setSendValidation]= useState(null);
  const [sendBusy,      setSendBusy]      = useState(false);
  const [sendError,     setSendError]     = useState('');
  const [sendDone,      setSendDone]      = useState(false);
  const sendFileRef = useRef();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [schoolRes, docsRes] = await Promise.all([
          API.get(`/schools/${schoolId}`),
          API.get(`/documents/school/${schoolId}`),
        ]);
        setSchool(schoolRes.data.school);
        setDocuments(docsRes.data.grouped || {});
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    if (schoolId) fetchData();
  }, [schoolId]);

  const handleReview = async () => {
    if (!reviewForm.status || !reviewing) return;
    setSaving(true);
    try {
      await API.put(`/documents/${reviewing._id}/review`, reviewForm);
      // Refresh
      const res = await API.get(`/documents/school/${schoolId}`);
      setDocuments(res.data.grouped || {});
      setReviewing(null);
      setReviewForm({ status: '', rejectReason: '' });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // Validate the chosen file (dry run) before sending
  const handleSendFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSendError('');
    setSendDone(false);
    setSendFile(file);
    setSendValidation(null);

    const form = new FormData();
    form.append('file', file);
    form.append('documentType', sendType);
    try {
      setSendBusy(true);
      const res = await API.post('/documents/validate', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSendValidation(res.data.validation);
    } catch (err) {
      setSendError(err.response?.data?.message || 'Validation failed');
      setSendFile(null);
      if (sendFileRef.current) sendFileRef.current.value = '';
    } finally {
      setSendBusy(false);
    }
  };

  const handleSendConfirm = async () => {
    if (!sendFile) return;
    setSendBusy(true);
    setSendError('');
    const form = new FormData();
    form.append('file', sendFile);
    form.append('documentType', sendType);
    try {
      await API.post(`/documents/upload/${schoolId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const res = await API.get(`/documents/school/${schoolId}`);
      setDocuments(res.data.grouped || {});
      setSendDone(true);
      handleSendCancel(true);
      setTimeout(() => setSendDone(false), 3000);
    } catch (err) {
      setSendError(err.response?.data?.message || 'Upload failed');
    } finally {
      setSendBusy(false);
    }
  };

  const handleSendCancel = (keepDone) => {
    setSendFile(null);
    setSendValidation(null);
    setSendError('');
    if (keepDone !== true) setSendDone(false);
    if (sendFileRef.current) sendFileRef.current.value = '';
  };

  const allDocs = Object.values(documents).flat();
  const sendTypeInfo = SEND_TYPES.find(t => t.key === sendType);

  return (
    <Layout>
      {/* Back */}
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.82rem', marginBottom: '1rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}>
        ← Back to school
      </button>

      {/* School header */}
      {school && (
        <div style={{ ...card, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#e8f0f9', color: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '1.1rem', flexShrink: 0 }}>
            {school.schoolName[0]}
          </div>
          <div>
            <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '1rem' }}>{school.schoolName}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{school.address?.city}, {school.address?.state} · {school.board}</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '0.82rem', color: '#64748b' }}>
            {allDocs.length} document{allDocs.length !== 1 ? 's' : ''} uploaded
          </div>
        </div>
      )}

      {/* Send Adobe accounts to school */}
      {school && (
        <div style={{ ...card, marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>📤 Send to School</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', marginBottom: '0.875rem' }}>
            Upload Adobe account files for this school — they'll appear on the school's Documents page instantly.
          </div>

          {/* Type selector */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
            {SEND_TYPES.map(t => (
              <button key={t.key} onClick={() => { setSendType(t.key); handleSendCancel(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 0.875rem', border: `2px solid ${sendType === t.key ? '#1e3a5f' : '#e2e8f0'}`, borderRadius: '8px', background: sendType === t.key ? '#e8f0f9' : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600', fontSize: '0.8rem', color: sendType === t.key ? '#1e3a5f' : '#475569' }}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.875rem' }}>
            Required columns: <span style={{ color: '#475569', fontWeight: '600' }}>{sendTypeInfo?.desc}</span>
          </div>

          {sendError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.625rem 0.875rem', fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.875rem' }}>
              ⚠ {sendError}
            </div>
          )}

          {sendDone ? (
            <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '8px', padding: '0.875rem', textAlign: 'center', fontWeight: '700', color: '#065f46', fontSize: '0.85rem' }}>
              ✅ File sent to {school.schoolName} — the school has been notified
            </div>
          ) : sendValidation ? (
            <div>
              {/* Validation summary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.625rem 0.875rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.1rem' }}>📄</span>
                <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#1e293b', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sendFile?.name}</span>
                <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '10px' }}>{sendValidation.totalRows} rows</span>
                <span style={{ fontSize: '0.72rem', background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>✓ {sendValidation.validRows} valid</span>
                {sendValidation.errors?.length > 0 && <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>⚠ {sendValidation.errors.length} errors</span>}
              </div>
              {sendValidation.errors?.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.625rem 0.875rem', marginBottom: '0.75rem', maxHeight: '100px', overflowY: 'auto' }}>
                  {sendValidation.errors.map((er, i) => <div key={i} style={{ fontSize: '0.72rem', color: '#dc2626', padding: '1px 0' }}>• {er}</div>)}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => handleSendCancel()} disabled={sendBusy}
                  style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600', fontSize: '0.8rem', color: '#475569' }}>
                  Cancel
                </button>
                <button onClick={handleSendConfirm} disabled={sendBusy || sendValidation.validRows === 0}
                  style={{ flex: 1, padding: '0.5rem 1rem', background: sendValidation.validRows === 0 ? '#94a3b8' : '#1e3a5f', border: 'none', borderRadius: '8px', cursor: sendValidation.validRows === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: '700', fontSize: '0.8rem', color: '#fff' }}>
                  {sendBusy ? 'Sending...' : `Send to School (${sendValidation.validRows} valid rows)`}
                </button>
              </div>
            </div>
          ) : (
            <label style={{ display: 'block', border: '2px dashed #cbd5e1', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', cursor: 'pointer', background: '#f8fafc' }}>
              <input ref={sendFileRef} type="file" accept=".csv,.xls,.xlsx" onChange={handleSendFileChange} style={{ display: 'none' }} disabled={sendBusy} />
              <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.85rem' }}>{sendBusy ? '⏳ Validating file...' : '📂 Click to choose a CSV / XLS / XLSX file'}</div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>The file is validated against the {sendTypeInfo?.label} format before sending</div>
            </label>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading documents...</div>
      ) : allDocs.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📂</div>
          <div style={{ fontWeight: '600', color: '#475569' }}>No documents uploaded yet</div>
          <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>The school user hasn't uploaded any files</div>
        </div>
      ) : (
        Object.entries(documents).map(([type, docs]) => (
          <div key={type} style={{ ...card, marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
              {DOC_TYPE_LABELS[type] || type}
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '400' }}>{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {docs.map(doc => {
                const st = STATUS_STYLE[doc.status] || { bg: '#f1f5f9', color: '#475569' };
                return (
                  <div key={doc._id} style={{ border: '1px solid #f1f5f9', borderRadius: '10px', padding: '1rem', background: '#fafcff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '1.4rem' }}>{doc.fileExtension === 'csv' ? '📋' : '📊'}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.fileName}</div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            v{doc.version} · {(doc.fileSize/1024).toFixed(1)} KB · {new Date(doc.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ ...st, fontSize: '0.72rem', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>{doc.status}</span>
                        {doc.isLatestVersion && <span style={{ fontSize: '0.65rem', color: '#1e3a5f', background: '#e8f0f9', padding: '2px 7px', borderRadius: '10px', fontWeight: '600' }}>Latest</span>}
                      </div>
                    </div>

                    {/* Parsed data summary */}
                    {doc.parsedData && (
                      <div style={{ marginTop: '0.625rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.7rem', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '10px' }}>Total: {doc.parsedData.totalRows} rows</span>
                        <span style={{ fontSize: '0.7rem', background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>✓ {doc.parsedData.validRows} valid</span>
                        {doc.parsedData.errors?.length > 0 && <span style={{ fontSize: '0.7rem', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>⚠ {doc.parsedData.errors.length} errors</span>}
                      </div>
                    )}

                    {doc.rejectReason && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#991b1b', background: '#fef2f2', padding: '0.4rem 0.75rem', borderRadius: '6px' }}>
                        Reason: {doc.rejectReason}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button onClick={() => downloadFile(doc._id, doc.fileName)}
                        style={{ fontSize: '0.75rem', color: '#1e3a5f', fontWeight: '600', border: 'none', padding: '0.35rem 0.75rem', background: '#e8f0f9', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        ⬇ Download
                      </button>
                      <button onClick={() => setViewing(doc)}
                        style={{ fontSize: '0.75rem', color: '#1e3a5f', fontWeight: '600', border: '1px solid #c7d8ec', padding: '0.35rem 0.75rem', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        👁 View
                      </button>
                      {doc.status === 'Pending' && (
                        <button onClick={() => { setReviewing(doc); setReviewForm({ status: '', rejectReason: '' }); }}
                          style={{ fontSize: '0.75rem', color: '#fff', fontWeight: '600', border: 'none', padding: '0.35rem 0.75rem', background: '#1e3a5f', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Review →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* View Modal — in-platform preview of parsed file data */}
      {viewing && (() => {
        const rows    = viewing.parsedData?.rows || [];
        const columns = rows.length ? Object.keys(rows[0]) : [];
        return (
          <div onClick={() => setViewing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '900px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{viewing.fileExtension === 'csv' ? '📋' : '📊'}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{viewing.fileName}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                    v{viewing.version} · {(viewing.fileSize/1024).toFixed(1)} KB · {DOC_TYPE_LABELS[viewing.documentType] || viewing.documentType}
                    {viewing.parsedData && <> · {viewing.parsedData.totalRows} rows ({viewing.parsedData.validRows} valid)</>}
                  </div>
                </div>
                <button onClick={() => setViewing(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', color: '#475569', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>✕</button>
              </div>

              {/* Validation errors */}
              {viewing.parsedData?.errors?.length > 0 && (
                <div style={{ padding: '0.625rem 1.5rem', background: '#fef2f2', borderBottom: '1px solid #fee2e2', fontSize: '0.72rem', color: '#991b1b', maxHeight: '90px', overflowY: 'auto', flexShrink: 0 }}>
                  {viewing.parsedData.errors.slice(0, 10).map((err, i) => <div key={i}>⚠ {err}</div>)}
                  {viewing.parsedData.errors.length > 10 && <div style={{ fontWeight: '600' }}>…and {viewing.parsedData.errors.length - 10} more</div>}
                </div>
              )}

              {/* Data table */}
              <div style={{ overflow: 'auto', flex: 1 }}>
                {rows.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
                    <div style={{ fontWeight: '600', color: '#475569' }}>No preview available for this file</div>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Use Download to open it locally</div>
                  </div>
                ) : (
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.78rem' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, width: '40px' }}>#</th>
                        {columns.map(col => <th key={col} style={th}>{col}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 ? '#fafcff' : '#fff' }}>
                          <td style={{ ...td, color: '#94a3b8' }}>{i + 1}</td>
                          {columns.map(col => <td key={col} style={td}>{String(row[col] ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '0.875rem 1.5rem', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexShrink: 0 }}>
                <button onClick={() => downloadFile(viewing._id, viewing.fileName)}
                  style={{ fontSize: '0.78rem', color: '#1e3a5f', fontWeight: '600', border: 'none', padding: '0.5rem 1rem', background: '#e8f0f9', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  ⬇ Download
                </button>
                {viewing.status === 'Pending' && (
                  <button onClick={() => { setReviewing(viewing); setReviewForm({ status: '', rejectReason: '' }); setViewing(null); }}
                    style={{ fontSize: '0.78rem', color: '#fff', fontWeight: '600', border: 'none', padding: '0.5rem 1rem', background: '#1e3a5f', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Review →
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Review Modal */}
      {reviewing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>Review Document</h3>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.8rem', color: '#64748b' }}>{reviewing.fileName}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1rem' }}>
              {['Approved', 'Rejected', 'Re-upload Requested'].map(s => {
                return (
                  <button key={s} onClick={() => setReviewForm(f => ({ ...f, status: s }))}
                    style={{ padding: '0.7rem 1rem', border: `2px solid ${reviewForm.status === s ? '#1e3a5f' : '#e2e8f0'}`, borderRadius: '8px', background: reviewForm.status === s ? '#e8f0f9' : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600', fontSize: '0.875rem', color: reviewForm.status === s ? '#1e3a5f' : '#374151', textAlign: 'left' }}>
                    {s === 'Approved' ? '✅' : s === 'Rejected' ? '❌' : '🔄'} {s}
                  </button>
                );
              })}
            </div>

            {(reviewForm.status === 'Rejected' || reviewForm.status === 'Re-upload Requested') && (
              <textarea
                placeholder="Reason (required)"
                value={reviewForm.rejectReason}
                onChange={e => setReviewForm(f => ({ ...f, rejectReason: e.target.value }))}
                rows={3}
                style={{ width: '100%', padding: '0.625rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: '1rem', outline: 'none' }}
              />
            )}

            <div style={{ display: 'flex', gap: '0.625rem' }}>
              <button onClick={() => setReviewing(null)} style={{ flex: 1, padding: '0.65rem', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600', color: '#475569' }}>Cancel</button>
              <button onClick={handleReview} disabled={saving || !reviewForm.status}
                style={{ flex: 2, padding: '0.65rem', background: !reviewForm.status ? '#94a3b8' : '#1e3a5f', border: 'none', borderRadius: '8px', cursor: !reviewForm.status ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: '700', color: '#fff' }}>
                {saving ? 'Saving...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

const card = { background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' };
const th   = { position: 'sticky', top: 0, background: '#f8fafc', color: '#475569', fontWeight: '700', textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', zIndex: 1 };
const td   = { padding: '0.45rem 0.75rem', borderBottom: '1px solid #f1f5f9', color: '#334155', whiteSpace: 'nowrap' };

export default AdminDocuments;
