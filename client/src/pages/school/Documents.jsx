import { useState, useEffect, useRef } from 'react';
import downloadFile from '../../utils/downloadFile';
import Layout from '../../components/layout/Layout';
import API from '../../api/axios';

const DOC_TYPES = [
  { key: 'school_approval',        label: 'School Approval',         icon: '🏫', desc: 'SL NO, School Name, City/District, State, UDISE Code, Board (CBSE/ICSE/IB/SB), Student Count (6-12), Teacher Count (6-12), SPOC Name, SPOC Mobile, SPOC Email' },
  { key: 'student_data',           label: 'Student Data',            icon: '🎓', desc: 'First Name, Last Name, Grade, Section, School Name, City/State, UDISE Code' },
  { key: 'teacher_data',           label: 'Teacher Data',            icon: '👩‍🏫', desc: 'First Name, Last Name, School Name, School City, UDISE Code' },
  { key: 'adobe_student_accounts', label: 'Adobe Student Accounts',  icon: '💻', desc: 'Name, ID, PW, School Name, Class Section, UDISE Code, City, State' },
  { key: 'adobe_teacher_accounts', label: 'Adobe Teacher Accounts',  icon: '💻', desc: 'Name, ID, PW, School Name, UDISE Code, City, State' },
];

const STATUS_STYLE = {
  'Pending':            { bg: '#fef9c3', color: '#854d0e' },
  'Approved':           { bg: '#d1fae5', color: '#065f46' },
  'Rejected':           { bg: '#fee2e2', color: '#991b1b' },
  'Re-upload Requested':{ bg: '#ffedd5', color: '#9a3412' },
};

const SchoolDocuments = () => {
  const [school,    setSchool]    = useState(null);
  const [documents, setDocuments] = useState({});
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected,  setSelected]  = useState('school_approval');
  const [validation,setValidation]= useState(null);
  const [stage,     setStage]     = useState('list'); // list | preview | uploading | done
  const [pendingFile,setPendingFile]=useState(null);
  const [error,     setError]     = useState('');
  const fileRef = useRef();

  useEffect(() => {
    const init = async () => {
      try {
        const res = await API.get('/schools?limit=1');
        const s   = res.data.schools?.[0];
        if (s) {
          setSchool(s);
          await fetchDocs(s._id);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    init();
  }, []);

  const fetchDocs = async (schoolId) => {
    const res = await API.get(`/documents/school/${schoolId}`);
    setDocuments(res.data.grouped || {});
  };

  // Step 1: validate file before upload
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setValidation(null);
    setPendingFile(file);
    setStage('preview');

    const form = new FormData();
    form.append('file', file);
    form.append('documentType', selected);

    try {
      setUploading(true);
      const res = await API.post('/documents/validate', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setValidation(res.data.validation);
    } catch (e) {
      setError(e.response?.data?.message || 'Validation failed');
      setStage('list');
    } finally {
      setUploading(false);
    }
  };

  // Step 2: confirm upload
  const handleConfirmUpload = async () => {
    if (!pendingFile || !school) return;
    setUploading(true);
    setError('');

    const form = new FormData();
    form.append('file', pendingFile);
    form.append('documentType', selected);

    try {
      await API.post(`/documents/upload/${school._id}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await fetchDocs(school._id);
      setStage('done');
      setValidation(null);
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setTimeout(() => setStage('list'), 2500);
    } catch (e) {
      setError(e.response?.data?.message || 'Upload failed');
      setStage('preview');
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setStage('list');
    setValidation(null);
    setPendingFile(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const currentType = DOC_TYPES.find(d => d.key === selected);
  const currentDocs = documents[selected] || [];

  return (
    <Layout>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>

        {/* Left — Type selector */}
        <div style={{ width: '220px', flexShrink: 0 }}>
          <div style={card}>
            <div style={sectionTitle}>Document Types</div>
            {DOC_TYPES.map(dt => (
              <button key={dt.key} onClick={() => { setSelected(dt.key); setStage('list'); setValidation(null); setError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', marginBottom: '4px', background: selected === dt.key ? '#e8f0f9' : 'transparent', color: selected === dt.key ? '#1e3a5f' : '#475569', fontWeight: selected === dt.key ? '700' : '400', fontSize: '0.82rem' }}>
                <span>{dt.icon}</span>
                <span>{dt.label}</span>
                {(documents[dt.key]?.length || 0) > 0 && (
                  <span style={{ marginLeft: 'auto', background: '#1e3a5f', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '0.65rem', fontWeight: '700' }}>
                    {documents[dt.key].length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right — Upload + History */}
        <div style={{ flex: 1, minWidth: '300px' }}>

          {/* Upload Card */}
          <div style={{ ...card, marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <div style={sectionTitle}>{currentType?.icon} Upload {currentType?.label}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                  Required columns: <span style={{ fontWeight: '600', color: '#1e293b' }}>{currentType?.desc}</span>
                </div>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>CSV · XLS · XLSX</span>
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem', fontSize: '0.82rem', color: '#dc2626', marginBottom: '1rem' }}>
                ⚠ {error}
              </div>
            )}

            {stage === 'done' ? (
              <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '10px', padding: '1.25rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                <div style={{ fontWeight: '700', color: '#065f46', fontSize: '0.9rem' }}>File uploaded successfully!</div>
              </div>
            ) : stage === 'preview' && validation ? (
              <ValidationPreview
                validation={validation}
                fileName={pendingFile?.name}
                onConfirm={handleConfirmUpload}
                onCancel={handleCancel}
                uploading={uploading}
              />
            ) : (
              <DropZone fileRef={fileRef} onChange={handleFileChange} uploading={uploading} />
            )}
          </div>

          {/* Upload History */}
          <div style={card}>
            <div style={sectionTitle}>Upload History — {currentType?.label}</div>
            {loading ? (
              <div style={emptyStyle}>Loading...</div>
            ) : currentDocs.length === 0 ? (
              <div style={emptyStyle}>No files uploaded yet for this document type</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {currentDocs.map(doc => (
                  <DocumentRow key={doc._id} doc={doc} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

// ── Drop zone ─────────────────────────────────────────────────────────────────
const DropZone = ({ fileRef, onChange, uploading }) => {
  const [drag, setDrag] = useState(false);

  return (
    <label
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && fileRef.current) { const dt = new DataTransfer(); dt.items.add(f); fileRef.current.files = dt.files; onChange({ target: fileRef.current }); } }}
      style={{ display: 'block', border: `2px dashed ${drag ? '#1e3a5f' : '#cbd5e1'}`, borderRadius: '10px', padding: '2rem', textAlign: 'center', cursor: 'pointer', background: drag ? '#f0f6ff' : '#f8fafc', transition: 'all 0.2s' }}
    >
      <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" onChange={onChange} style={{ display: 'none' }} disabled={uploading} />
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{uploading ? '⏳' : '📂'}</div>
      <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
        {uploading ? 'Validating file...' : 'Click to browse or drag & drop'}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Supports CSV, XLS, XLSX · Max 10MB</div>
    </label>
  );
};

// ── Validation preview ────────────────────────────────────────────────────────
const ValidationPreview = ({ validation, fileName, onConfirm, onCancel, uploading }) => (
  <div>
    {/* File info */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.625rem 0.875rem', background: '#f8fafc', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: '1.2rem' }}>📄</span>
      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#1e293b', flex: 1 }}>{fileName}</span>
      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{validation.totalRows} rows</span>
    </div>

    {/* Summary */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.625rem', marginBottom: '1rem' }}>
      <div style={{ textAlign: 'center', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
        <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#1e293b' }}>{validation.totalRows}</div>
        <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase' }}>Total Rows</div>
      </div>
      <div style={{ textAlign: 'center', padding: '0.75rem', background: '#d1fae5', borderRadius: '8px' }}>
        <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#065f46' }}>{validation.validRows}</div>
        <div style={{ fontSize: '0.68rem', color: '#065f46', textTransform: 'uppercase' }}>Valid</div>
      </div>
      <div style={{ textAlign: 'center', padding: '0.75rem', background: validation.errors?.length ? '#fee2e2' : '#d1fae5', borderRadius: '8px' }}>
        <div style={{ fontSize: '1.3rem', fontWeight: '800', color: validation.errors?.length ? '#991b1b' : '#065f46' }}>{validation.errors?.length || 0}</div>
        <div style={{ fontSize: '0.68rem', color: validation.errors?.length ? '#991b1b' : '#065f46', textTransform: 'uppercase' }}>Errors</div>
      </div>
    </div>

    {/* Errors */}
    {validation.errors?.length > 0 && (
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', maxHeight: '120px', overflowY: 'auto' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#991b1b', marginBottom: '0.4rem' }}>Validation Errors:</div>
        {validation.errors.map((e, i) => (
          <div key={i} style={{ fontSize: '0.72rem', color: '#dc2626', padding: '2px 0' }}>• {e}</div>
        ))}
      </div>
    )}

    {/* Data Preview */}
    {validation.preview?.length > 0 && (
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Data Preview (first {validation.preview.length} rows)</div>
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {validation.headers?.map(h => (
                  <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#64748b', fontWeight: '700', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {validation.preview.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {validation.headers?.map(h => (
                    <td key={h} style={{ padding: '0.4rem 0.6rem', color: '#374151', whiteSpace: 'nowrap', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row[h] || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {/* Actions */}
    <div style={{ display: 'flex', gap: '0.625rem' }}>
      <button onClick={onCancel} disabled={uploading}
        style={{ flex: 1, padding: '0.65rem', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>
        Cancel
      </button>
      <button onClick={onConfirm} disabled={uploading || validation.validRows === 0}
        style={{ flex: 2, padding: '0.65rem', background: validation.validRows === 0 ? '#94a3b8' : '#1e3a5f', border: 'none', borderRadius: '8px', cursor: validation.validRows === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: '700', color: '#fff' }}>
        {uploading ? 'Uploading...' : `Confirm Upload (${validation.validRows} valid rows)`}
      </button>
    </div>
  </div>
);

// ── Document row in history ───────────────────────────────────────────────────
const DocumentRow = ({ doc }) => {
  const st = STATUS_STYLE[doc.status] || { bg: '#f1f5f9', color: '#475569' };
  const isData = doc.parsedData;

  return (
    <div style={{ border: '1px solid #f1f5f9', borderRadius: '10px', padding: '0.875rem', background: '#fafcff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '1.3rem' }}>{doc.fileExtension === 'csv' ? '📋' : '📊'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.fileName}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              v{doc.version} · {(doc.fileSize / 1024).toFixed(1)} KB · {new Date(doc.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            {doc.uploadedBy && (
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Uploaded by: {doc.uploadedBy.name}</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
          <span style={{ ...st, fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' }}>{doc.status}</span>
          {doc.isLatestVersion && (
            <span style={{ fontSize: '0.65rem', color: '#1e3a5f', background: '#e8f0f9', padding: '1px 6px', borderRadius: '10px', fontWeight: '600' }}>Latest</span>
          )}
        </div>
      </div>

      {/* Parsed data summary */}
      {isData && (
        <div style={{ marginTop: '0.625rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>✓ {doc.parsedData.validRows} valid rows</span>
          {doc.parsedData.errors?.length > 0 && (
            <span style={{ fontSize: '0.7rem', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>⚠ {doc.parsedData.errors.length} errors</span>
          )}
        </div>
      )}

      {/* Reject reason */}
      {doc.rejectReason && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#991b1b', background: '#fef2f2', padding: '0.4rem 0.625rem', borderRadius: '6px' }}>
          Reason: {doc.rejectReason}
        </div>
      )}

      {/* Download */}
      <div style={{ marginTop: '0.625rem' }}>
        <button onClick={() => downloadFile(doc._id, doc.fileName)}
          style={{ fontSize: '0.75rem', color: '#1e3a5f', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
          ⬇ Download original file
        </button>
      </div>
    </div>
  );
};

const card        = { background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' };
const sectionTitle = { fontSize: '0.9rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.875rem' };
const emptyStyle  = { textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' };

export default SchoolDocuments;

