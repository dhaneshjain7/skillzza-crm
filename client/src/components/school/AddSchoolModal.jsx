import { useState, useRef } from 'react';
import API from '../../api/axios';
import { downloadSchoolsBulkTemplate } from '../../utils/downloadFile';

const AddSchoolModal = ({ onClose, onCreated }) => {
  const [mode, setMode] = useState('single'); // 'single' | 'bulk'
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [form, setForm] = useState({
    schoolName: '', udiseCode: '', email: '', phone: '', altPhone: '', website: '',
    board: '', schoolType: '', studentCount: '', staffCount: '',
    'address.street': '', 'address.city': '', 'address.district': '', 'address.state': '', 'address.pincode': '',
    'principal.name': '', 'principal.email': '', 'principal.phone': '',
  });
  const [createLogin, setCreateLogin] = useState(true);
  const [loginEmail, setLoginEmail]       = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [successInfo, setSuccessInfo]     = useState(null);

  // ── Bulk import state ──────────────────────────────────────────────────────
  const [bulkFile, setBulkFile]           = useState(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkError, setBulkError]         = useState('');
  const [bulkResult, setBulkResult]       = useState(null); // { created, skipped }
  const bulkFileRef = useRef(null);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleBulkFileChange = (e) => {
    setBulkFile(e.target.files?.[0] || null);
    setBulkError('');
  };

  const handleBulkImport = async () => {
    if (!bulkFile) { setBulkError('Choose a filled-in template file first.'); return; }
    setBulkError('');
    setBulkImporting(true);
    try {
      const form = new FormData();
      form.append('file', bulkFile);
      const res = await API.post('/schools/bulk-import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBulkResult({ created: res.data.created, skipped: res.data.skipped });
      setBulkFile(null);
      if (bulkFileRef.current) bulkFileRef.current.value = '';
    } catch (err) {
      setBulkError(err.response?.data?.message || 'Bulk import failed.');
    } finally {
      setBulkImporting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.schoolName || !form.udiseCode || !form.email || !form.phone) {
      setError('School Name, UDISE Code, Email and Phone are required.');
      return;
    }

    if (createLogin) {
      if (!loginEmail || !loginPassword) {
        setError('Portal login email and password are required to create school access.');
        return;
      }
      if (loginPassword.length < 6) {
        setError('Portal password must be at least 6 characters.');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        schoolName:         form.schoolName,
        udiseCode:           form.udiseCode,
        email:               form.email,
        phone:               form.phone,
        altPhone:            form.altPhone,
        website:             form.website,
        board:               form.board,
        schoolType:          form.schoolType,
        studentCount:        form.studentCount    ? Number(form.studentCount)    : undefined,
        staffCount:          form.staffCount      ? Number(form.staffCount)      : undefined,
        address: {
          street:   form['address.street'],
          city:     form['address.city'],
          district: form['address.district'],
          state:    form['address.state'],
          pincode:  form['address.pincode'],
        },
        principal: {
          name:  form['principal.name'],
          email: form['principal.email'],
          phone: form['principal.phone'],
        },
        ...(createLogin ? { loginEmail, loginPassword } : {}),
      };

      const res = await API.post('/schools', payload);

      if (createLogin) {
        // Show success screen with credentials instead of closing immediately
        setSuccessInfo({ school: res.data.school, loginEmail });
      } else {
        onCreated?.(res.data.school);
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create school.');
    } finally {
      setSaving(false);
    }
  };

  // ── Success screen — shown after school + login created ──────────────────────
  if (successInfo) {
    return (
      <div style={overlay} onClick={() => { onCreated?.(successInfo.school); onClose(); }}>
        <div style={{ ...modal, maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: '800', color: '#1e293b' }}>School Created Successfully!</h3>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: '#64748b' }}>
              Share these portal login credentials with <strong>{successInfo.school.schoolName}</strong>
            </p>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', textAlign: 'left', marginBottom: '1.5rem' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Login Email</div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>{successInfo.loginEmail}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Password</div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>{loginPassword}</div>
              </div>
            </div>

            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              ⚠️ This password won't be shown again. Copy it now, or reset it later from the school's detail page.
            </p>

            <button onClick={() => { onCreated?.(successInfo.school); onClose(); }}
              style={{ ...saveBtn, width: '100%' }}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Bulk import results screen ────────────────────────────────────────────────
  if (bulkResult) {
    return (
      <div style={overlay} onClick={() => { onCreated?.(); onClose(); }}>
        <div style={{ ...modal, maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
          <div style={header}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#1e293b' }}>Bulk Import Results</h3>
            <button onClick={() => { onCreated?.(); onClose(); }} style={closeBtn}>✕</button>
          </div>
          <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
            <p style={{ fontSize: '0.85rem', color: '#374151', marginTop: 0 }}>
              <strong style={{ color: '#065f46' }}>{bulkResult.created.length} school{bulkResult.created.length !== 1 ? 's' : ''} created</strong>
              {bulkResult.skipped.length > 0 && <span style={{ color: '#991b1b' }}> · {bulkResult.skipped.length} row{bulkResult.skipped.length !== 1 ? 's' : ''} skipped</span>}
            </p>

            {bulkResult.created.length > 0 && (
              <>
                <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0 0 0.5rem' }}>
                  ⚠️ These passwords won't be shown again — copy them now, or reset from each school's detail page later.
                </p>
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '1.25rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['School', 'Login Email', 'Password'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: '700', color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bulkResult.created.map(c => (
                        <tr key={c.schoolId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#1e293b', fontWeight: '600' }}>{c.schoolName}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#374151' }}>{c.loginEmail}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#374151', fontFamily: 'monospace' }}>{c.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {bulkResult.skipped.length > 0 && (
              <div style={{ overflowX: 'auto', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#fef2f2' }}>
                      {['Row', 'School', 'Reason skipped'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: '700', color: '#991b1b', fontSize: '0.7rem', textTransform: 'uppercase', borderBottom: '1px solid #fecaca' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResult.skipped.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #fef2f2' }}>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#991b1b' }}>{s.row ?? '—'}</td>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#991b1b', fontWeight: '600' }}>{s.schoolName || '—'}</td>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#991b1b' }}>{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => { onCreated?.(); onClose(); }} style={saveBtn}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={header}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#1e293b' }}>➕ Add New School</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.875rem 1.5rem 0' }}>
          <button type="button" onClick={() => setMode('single')}
            style={{ ...modeTab, ...(mode === 'single' ? modeTabActive : {}) }}>
            Single School
          </button>
          <button type="button" onClick={() => setMode('bulk')}
            style={{ ...modeTab, ...(mode === 'bulk' ? modeTabActive : {}) }}>
            ⬆ Bulk Import (Excel)
          </button>
        </div>

        {mode === 'bulk' ? (
          <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 0 }}>
              Download the template, fill in one row per school, then upload it here. Each school gets a portal login
              where the <strong>login email is the school's own email</strong> and a <strong>random password</strong> is generated automatically.
            </p>

            <button type="button" onClick={() => downloadSchoolsBulkTemplate()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.55rem 1rem', background: '#e8f0f9', border: '1px solid #cfe0f3', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '600', color: '#1e3a5f', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '1.25rem' }}>
              ⬇ Download Template
            </button>

            {bulkError && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.85rem', color: '#dc2626' }}>
                ⚠ {bulkError}
              </div>
            )}

            <label
              style={{ display: 'block', border: `2px dashed ${bulkFile ? '#1e3a5f' : '#cbd5e1'}`, borderRadius: '10px', padding: '2rem', textAlign: 'center', cursor: 'pointer', background: bulkFile ? '#f0f6ff' : '#f8fafc' }}
            >
              <input ref={bulkFileRef} type="file" accept=".csv,.xls,.xlsx" onChange={handleBulkFileChange} style={{ display: 'none' }} disabled={bulkImporting} />
              <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{bulkImporting ? '⏳' : '📂'}</div>
              <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.88rem', marginBottom: '0.25rem' }}>
                {bulkFile ? bulkFile.name : 'Click to browse or drag & drop the filled template'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Supports CSV, XLS, XLSX · Max 10MB</div>
            </label>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1.25rem', marginTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
              <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
              <button type="button" onClick={handleBulkImport} disabled={bulkImporting || !bulkFile}
                style={{ ...saveBtn, opacity: (bulkImporting || !bulkFile) ? 0.6 : 1, cursor: (bulkImporting || !bulkFile) ? 'not-allowed' : 'pointer' }}>
                {bulkImporting ? 'Importing...' : '⬆ Import Schools'}
              </button>
            </div>
          </div>
        ) : (
        <>
        {error && (
          <div style={{ margin: '1rem 1.5rem 0', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.85rem', color: '#dc2626' }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>

          <Section title="Basic Details">
            <Row>
              <Field label="School Name *" name="schoolName" value={form.schoolName} onChange={handleChange} required />
              <Field label="UDISE Code *" name="udiseCode" value={form.udiseCode} onChange={handleChange} required placeholder="11-digit UDISE code" />
            </Row>
            <Row>
              <Field label="Email *" name="email" value={form.email} onChange={handleChange} required type="email" />
              <Field label="Phone *" name="phone" value={form.phone} onChange={handleChange} required />
            </Row>
            <Row>
              <Field label="Alt Phone" name="altPhone" value={form.altPhone} onChange={handleChange} />
              <Field label="Website" name="website" value={form.website} onChange={handleChange} />
            </Row>
            <Row>
              <SelectField label="Board" name="board" value={form.board} onChange={handleChange} options={['CBSE','ICSE','IB','State Board','Other']} />
              <SelectField label="School Type" name="schoolType" value={form.schoolType} onChange={handleChange} options={['Primary','Secondary','Higher Secondary','College','Other']} />
            </Row>
            <Row>
              <Field label="Student Count (6-12)" name="studentCount" value={form.studentCount} onChange={handleChange} type="number" />
              <Field label="Staff Count (6-12)" name="staffCount" value={form.staffCount} onChange={handleChange} type="number" />
            </Row>
          </Section>

          <Section title="Address">
            <Field label="Street Address" name="address.street" value={form['address.street']} onChange={handleChange} fullWidth />
            <Row>
              <Field label="City *" name="address.city" value={form['address.city']} onChange={handleChange} required />
              <Field label="District" name="address.district" value={form['address.district']} onChange={handleChange} />
            </Row>
            <Row>
              <Field label="State *" name="address.state" value={form['address.state']} onChange={handleChange} required />
              <Field label="Pincode" name="address.pincode" value={form['address.pincode']} onChange={handleChange} />
            </Row>
          </Section>

          <Section title="Principal Information (optional)">
            <Row>
              <Field label="Principal Name" name="principal.name" value={form['principal.name']} onChange={handleChange} />
              <Field label="Principal Email" name="principal.email" value={form['principal.email']} onChange={handleChange} type="email" />
            </Row>
            <Field label="Principal Phone" name="principal.phone" value={form['principal.phone']} onChange={handleChange} fullWidth />
          </Section>

          {/* Portal Access */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '2px solid #e8f0f9' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🔐 School Portal Access
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.78rem', color: '#374151', fontWeight: '600' }}>
                <input type="checkbox" checked={createLogin} onChange={e => setCreateLogin(e.target.checked)} style={{ cursor: 'pointer' }} />
                Create login now
              </label>
            </div>

            {createLogin ? (
              <>
                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 0.75rem' }}>
                  Set up the school's dashboard login. They'll be able to reset their own password later.
                </p>
                <Row>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>Login Email *</label>
                    <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                      placeholder="school@example.com"
                      style={{ padding: '0.55rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#1e293b', width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>Password *</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showPassword ? 'text' : 'password'} value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        style={{ padding: '0.55rem 2.25rem 0.55rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#1e293b', width: '100%', boxSizing: 'border-box' }} />
                      <button type="button" onClick={() => setShowPassword(p => !p)}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>
                        {showPassword ? '🙈' : '👁'}
                      </button>
                    </div>
                  </div>
                </Row>
              </>
            ) : (
              <div style={{ padding: '0.75rem 1rem', background: '#fff8f0', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '0.78rem', color: '#9a3412' }}>
                No login will be created. You can add portal access later from the school's detail page.
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...saveBtn, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating...' : '+ Create School'}
            </button>
          </div>
        </form>
        </>
        )}
      </div>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div style={{ marginBottom: '1.25rem' }}>
    <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '2px solid #e8f0f9' }}>
      {title}
    </div>
    {children}
  </div>
);

const Row = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>{children}</div>
);

const Field = ({ label, name, value, onChange, required, type = 'text', fullWidth }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: fullWidth ? '0.75rem' : 0 }}>
    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>{label}</label>
    <input type={type} name={name} value={value} onChange={onChange} required={required}
      style={{ padding: '0.55rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#1e293b', width: '100%', boxSizing: 'border-box' }} />
  </div>
);

const SelectField = ({ label, name, value, onChange, options }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>{label}</label>
    <select name={name} value={value} onChange={onChange}
      style={{ padding: '0.55rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#1e293b', background: '#fff' }}>
      <option value="">Select...</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const overlay  = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' };
const modal    = { background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' };
const header   = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', flexShrink: 0 };
const closeBtn = { background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '0.9rem', color: '#64748b' };
const cancelBtn= { padding: '0.65rem 1.25rem', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600', color: '#475569', fontSize: '0.875rem' };
const saveBtn  = { padding: '0.65rem 1.75rem', background: '#1e3a5f', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '700', color: '#fff', fontSize: '0.875rem' };
const modeTab       = { padding: '0.5rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600', fontSize: '0.82rem', color: '#64748b' };
const modeTabActive = { background: '#1e3a5f', color: '#fff' };

export default AddSchoolModal;
