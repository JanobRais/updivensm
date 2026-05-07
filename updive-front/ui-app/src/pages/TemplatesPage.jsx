import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon, PageHeader } from '../components/Charts';
import {
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  getMibFiles, uploadMib, validateMib, deleteMib,
} from '../api';

const ACCENT = '#22c55e';

const DEVICE_TYPES = ['network', 'server', 'camera', 'printer', 'ups', 'other'];

const MODULES_DEF = [
  { key: 'ports',   label: 'Interfaces / Ports' },
  { key: 'cpu',     label: 'CPU Usage' },
  { key: 'memory',  label: 'Memory Pools' },
  { key: 'health',  label: 'Health Sensors' },
  { key: 'bgp',     label: 'BGP Peers' },
  { key: 'ospf',    label: 'OSPF' },
  { key: 'uptime',  label: 'Uptime' },
  { key: 'ping',    label: 'Ping / ICMP' },
];

const S = {
  card:    { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' },
  th:      { padding: '9px 14px', fontSize: 10, fontWeight: 700, color: '#6b7280', textAlign: 'left', background: '#f9fafb', borderBottom: '1px solid #e8ecf0', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' },
  td:      { padding: '9px 14px', fontSize: 12, color: '#374151', verticalAlign: 'middle' },
  label:   { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' },
  input:   { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fff' },
  select:  { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fff', cursor: 'pointer' },
  group:   { display: 'flex', flexDirection: 'column', gap: 4 },
  row2:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  btn:     (bg, color = '#fff') => ({ padding: '6px 14px', borderRadius: 7, border: 'none', background: bg, color, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }),
  ghost:   { padding: '6px 14px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  tab:     (a, ac) => ({ padding: '6px 16px', borderRadius: 7, border: `1px solid ${a ? ac : '#e5e7eb'}`, background: a ? ac : '#fff', color: a ? '#fff' : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }),
  section: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '18px 0 10px', paddingBottom: 6, borderBottom: '1px solid #f0f2f5' },
};

const Spinner = () => (
  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #e5e7eb', borderTopColor: '#6b7280', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
);

const TypeBadge = ({ type }) => {
  const colors = { network: '#3b82f6', server: '#8b5cf6', camera: '#f59e0b', printer: '#6b7280', ups: '#ef4444', other: '#9ca3af' };
  const c = colors[type] || '#9ca3af';
  return (
    <span style={{ padding: '2px 8px', borderRadius: 10, background: c + '20', color: c, fontSize: 10, fontWeight: 700 }}>
      {type}
    </span>
  );
};

// ─── Tag chip input ───────────────────────────────────────────────
const TagInput = ({ value = [], onChange, placeholder }) => {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput('');
  };
  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: 7, padding: '6px 8px', background: '#fff', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {value.map(tag => (
        <span key={tag} style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 5, padding: '1px 6px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          {tag}
          <button onClick={() => onChange(value.filter(t => t !== tag))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, lineHeight: 1, fontSize: 13 }}>×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={placeholder}
        style={{ border: 'none', outline: 'none', fontSize: 11, color: '#374151', flexGrow: 1, minWidth: 120, fontFamily: 'inherit', background: 'transparent' }}
      />
    </div>
  );
};

// ─── Custom OID row editor ────────────────────────────────────────
const CustomOidEditor = ({ value = [], onChange }) => {
  const add = () => onChange([...value, { name: '', oid: '', type: 'gauge', unit: '' }]);
  const update = (i, field, v) => { const a = [...value]; a[i] = { ...a[i], [field]: v }; onChange(a); };
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {value.map((row, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 1fr 1fr auto', gap: 6, alignItems: 'center' }}>
          <input value={row.name} onChange={e => update(i, 'name', e.target.value)} placeholder="Name" style={{ ...S.input, padding: '5px 8px' }} />
          <input value={row.oid}  onChange={e => update(i, 'oid',  e.target.value)} placeholder=".1.3.6.1..." style={{ ...S.input, padding: '5px 8px', fontFamily: 'monospace', fontSize: 11 }} />
          <select value={row.type} onChange={e => update(i, 'type', e.target.value)} style={{ ...S.select, padding: '5px 8px' }}>
            {['gauge', 'counter', 'string'].map(t => <option key={t}>{t}</option>)}
          </select>
          <input value={row.unit} onChange={e => update(i, 'unit', e.target.value)} placeholder="Unit" style={{ ...S.input, padding: '5px 8px' }} />
          <button onClick={() => remove(i)} style={{ ...S.btn('#fee2e2', '#ef4444'), padding: '4px 8px' }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ ...S.ghost, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, width: 'fit-content' }}>
        <Icon name="plus" size={11} color="#6b7280" /> Add OID
      </button>
    </div>
  );
};

// ─── Template editor form ─────────────────────────────────────────
const EMPTY_TPL = {
  name: '', os_name: '', vendor: '', display_name: '', type: 'network', icon: '', description: '',
  sys_object_ids: [], sys_descr_patterns: [], mib_dirs: [], modules: [], custom_oids: [],
};

const parseJson = (v, fallback = []) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return fallback;
};

const TemplateEditor = ({ template, accent, onSave, onCancel, saving }) => {
  const [form, setForm] = useState(() => ({
    ...EMPTY_TPL,
    ...template,
    sys_object_ids:     parseJson(template?.sys_object_ids),
    sys_descr_patterns: parseJson(template?.sys_descr_patterns),
    mib_dirs:           parseJson(template?.mib_dirs),
    modules:            parseJson(template?.modules),
    custom_oids:        parseJson(template?.custom_oids),
  }));

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleModule = (k) => set('modules', form.modules.includes(k) ? form.modules.filter(m => m !== k) : [...form.modules, k]);

  return (
    <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
      <div style={S.section}>Basic Info</div>
      <div style={{ ...S.row2, marginBottom: 12 }}>
        <div style={S.group}>
          <label style={S.label}>Template Name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} style={S.input} placeholder="Eltex MES Series" />
        </div>
        <div style={S.group}>
          <label style={S.label}>OS Name (unique key) *</label>
          <input value={form.os_name} onChange={e => set('os_name', e.target.value)} style={{ ...S.input, fontFamily: 'monospace' }} placeholder="eltex-mes" disabled={!!template?.id} />
        </div>
      </div>
      <div style={{ ...S.row2, marginBottom: 12 }}>
        <div style={S.group}>
          <label style={S.label}>Vendor</label>
          <input value={form.vendor} onChange={e => set('vendor', e.target.value)} style={S.input} placeholder="Eltex" />
        </div>
        <div style={S.group}>
          <label style={S.label}>Display Name</label>
          <input value={form.display_name} onChange={e => set('display_name', e.target.value)} style={S.input} placeholder="Eltex MES Switch" />
        </div>
      </div>
      <div style={{ ...S.row2, marginBottom: 12 }}>
        <div style={S.group}>
          <label style={S.label}>Device Type</label>
          <select value={form.type} onChange={e => set('type', e.target.value)} style={S.select}>
            {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={S.group}>
          <label style={S.label}>Description</label>
          <input value={form.description} onChange={e => set('description', e.target.value)} style={S.input} placeholder="Short description..." />
        </div>
      </div>

      <div style={S.section}>Discovery Rules</div>
      <div style={{ ...S.group, marginBottom: 12 }}>
        <label style={S.label}>sysObjectID prefixes <span style={{ fontWeight: 400, color: '#9ca3af' }}>(press Enter to add)</span></label>
        <TagInput value={form.sys_object_ids} onChange={v => set('sys_object_ids', v)} placeholder=".1.3.6.1.4.1.35265..." />
      </div>
      <div style={{ ...S.group, marginBottom: 12 }}>
        <label style={S.label}>sysDescr patterns <span style={{ fontWeight: 400, color: '#9ca3af' }}>(regex, press Enter)</span></label>
        <TagInput value={form.sys_descr_patterns} onChange={v => set('sys_descr_patterns', v)} placeholder="MES\d+" />
      </div>

      <div style={S.section}>MIB Config</div>
      <div style={{ ...S.group, marginBottom: 12 }}>
        <label style={S.label}>MIB Directories <span style={{ fontWeight: 400, color: '#9ca3af' }}>(vendor folder names in /mibs/)</span></label>
        <TagInput value={form.mib_dirs} onChange={v => set('mib_dirs', v)} placeholder="eltex" />
      </div>

      <div style={S.section}>Polling Modules</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {MODULES_DEF.map(m => {
          const active = form.modules.includes(m.key);
          return (
            <button key={m.key} onClick={() => toggleModule(m.key)} style={{
              padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${active ? accent : '#e5e7eb'}`,
              background: active ? accent + '15' : '#fff',
              color: active ? accent : '#6b7280',
            }}>
              {m.label}
            </button>
          );
        })}
      </div>

      <div style={S.section}>Custom OIDs</div>
      <div style={{ marginBottom: 20 }}>
        {form.custom_oids.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 1fr 1fr auto', gap: 6, marginBottom: 6, padding: '0 0 4px' }}>
            {['Name', 'OID', 'Type', 'Unit', ''].map(h => <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>{h}</span>)}
          </div>
        )}
        <CustomOidEditor value={form.custom_oids} onChange={v => set('custom_oids', v)} />
      </div>

      <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid #f0f2f5' }}>
        <button onClick={() => onSave(form)} disabled={saving || !form.name || !form.os_name} style={S.btn(accent)}>
          {saving ? <Spinner /> : <Icon name="download" size={12} color="#fff" />}
          {saving ? 'Saving…' : 'Save Template'}
        </button>
        <button onClick={onCancel} style={S.ghost}>Cancel</button>
      </div>
    </div>
  );
};

// ─── Templates tab ────────────────────────────────────────────────
const TemplatesTab = ({ accent }) => {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [typeFilter,setTypeFilter]= useState('');
  const [selected,  setSelected]  = useState(null); // null=list, {}=new, {id,...}=edit
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(null);
  const [error,     setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search)     params.search = search;
      if (typeFilter) params.type   = typeFilter;
      setTemplates(await getTemplates(params));
    } catch { setTemplates([]); }
    setLoading(false);
  }, [search, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    setSaving(true); setError('');
    try {
      if (selected?.id) await updateTemplate(selected.id, form);
      else              await createTemplate(form);
      setSelected(null);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Save failed');
    }
    setSaving(false);
  };

  const handleDelete = async (tpl) => {
    if (!confirm(`Delete "${tpl.name}"?`)) return;
    setDeleting(tpl.id);
    try { await deleteTemplate(tpl.id); load(); } catch { }
    setDeleting(null);
  };

  if (selected !== null) {
    return (
      <div style={S.card}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e8ecf0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setSelected(null)} style={{ ...S.ghost, padding: '4px 10px', fontSize: 11 }}>
            ← Back
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
            {selected?.id ? `Edit: ${selected.name}` : 'New Template'}
          </span>
          {selected?.builtin && <span style={{ fontSize: 10, background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>Built-in</span>}
        </div>
        {error && <div style={{ margin: '12px 20px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, color: '#dc2626' }}>{error}</div>}
        <TemplateEditor template={selected} accent={accent} onSave={handleSave} onCancel={() => setSelected(null)} saving={saving} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Icon name="search" size={13} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..." style={{ ...S.input, paddingLeft: 32 }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...S.select, width: 140 }}>
          <option value="">All Types</option>
          {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => setSelected(EMPTY_TPL)} style={S.btn(accent)}>
          <Icon name="plus" size={12} color="#fff" /> New Template
        </button>
      </div>

      {/* Table */}
      <div style={S.card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'OS Key', 'Vendor', 'Type', 'Modules', 'Actions'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', padding: 32, color: '#9ca3af' }}><Spinner /></td></tr>
            ) : templates.length === 0 ? (
              <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', padding: 32, color: '#9ca3af' }}>No templates found</td></tr>
            ) : templates.map(tpl => (
              <tr key={tpl.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={S.td}>
                  <div style={{ fontWeight: 600, color: '#111827', fontSize: 12 }}>{tpl.name}</div>
                  {tpl.builtin && <span style={{ fontSize: 9, background: '#fef3c7', color: '#d97706', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>built-in</span>}
                </td>
                <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>{tpl.os_name}</td>
                <td style={{ ...S.td, color: '#6b7280' }}>{tpl.vendor || '—'}</td>
                <td style={S.td}><TypeBadge type={tpl.type} /></td>
                <td style={S.td}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {parseJson(tpl.modules).slice(0, 4).map(m => (
                      <span key={m} style={{ fontSize: 9, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 4, padding: '1px 5px' }}>{m}</span>
                    ))}
                    {parseJson(tpl.modules).length > 4 && <span style={{ fontSize: 9, color: '#9ca3af' }}>+{parseJson(tpl.modules).length - 4}</span>}
                  </div>
                </td>
                <td style={S.td}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setSelected(tpl)} style={S.btn('#f0fdf4', accent)} title="Edit">
                      <Icon name="edit" size={11} color={accent} />
                    </button>
                    {!tpl.builtin && (
                      <button onClick={() => handleDelete(tpl)} disabled={deleting === tpl.id} style={S.btn('#fef2f2', '#ef4444')} title="Delete">
                        {deleting === tpl.id ? <Spinner /> : <Icon name="trash" size={11} color="#ef4444" />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── MIBs tab ─────────────────────────────────────────────────────
const MibsTab = ({ accent }) => {
  const [mibs,       setMibs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [validating, setValidating] = useState(null);
  const [deleting,   setDeleting]   = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [upForm,     setUpForm]     = useState({ vendor: '', filename: '', content: '' });
  const [upError,    setUpError]    = useState('');
  const [upResult,   setUpResult]   = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setMibs(await getMibFiles()); } catch { setMibs([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const onFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUpForm(f => ({ ...f, filename: file.name }));
    const reader = new FileReader();
    reader.onload = ev => setUpForm(f => ({ ...f, content: ev.target.result }));
    reader.readAsText(file);
  };

  const upload = async () => {
    if (!upForm.filename || !upForm.content) { setUpError('Filename and content required'); return; }
    setUploading(true); setUpError(''); setUpResult(null);
    try {
      const r = await uploadMib(upForm);
      setUpResult(r);
      load();
    } catch (e) {
      setUpError(e.response?.data?.message || 'Upload failed');
    }
    setUploading(false);
  };

  const validate = async (id) => {
    setValidating(id);
    try { await validateMib(id); load(); } catch { }
    setValidating(null);
  };

  const del = async (m) => {
    if (!confirm(`Delete MIB "${m.filename}"?`)) return;
    setDeleting(m.id);
    try { await deleteMib(m.id); load(); } catch { }
    setDeleting(null);
  };

  // Group by vendor
  const grouped = mibs.reduce((acc, m) => {
    const v = m.vendor || 'generic';
    if (!acc[v]) acc[v] = [];
    acc[v].push(m);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { setShowUpload(!showUpload); setUpResult(null); setUpError(''); }} style={S.btn(accent)}>
          <Icon name="download" size={12} color="#fff" /> Upload MIB
        </button>
        <button onClick={load} style={S.ghost}><Icon name="refresh" size={12} color="#6b7280" /></button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div style={{ ...S.card, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Upload MIB File</div>

          {upResult && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: upResult.valid ? '#f0fdf4' : '#fef2f2', border: `1px solid ${upResult.valid ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, fontSize: 12 }}>
              <strong style={{ color: upResult.valid ? '#16a34a' : '#dc2626' }}>
                {upResult.valid ? '✓ MIB is valid' : '✗ Parse error'}
              </strong>
              {upResult.parse_error && <div style={{ color: '#dc2626', marginTop: 4, fontFamily: 'monospace', fontSize: 11 }}>{upResult.parse_error}</div>}
            </div>
          )}
          {upError && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, color: '#dc2626' }}>{upError}</div>}

          <div style={{ ...S.row2, marginBottom: 12 }}>
            <div style={S.group}>
              <label style={S.label}>Vendor</label>
              <input value={upForm.vendor} onChange={e => setUpForm(f => ({ ...f, vendor: e.target.value }))} style={S.input} placeholder="eltex" />
            </div>
            <div style={S.group}>
              <label style={S.label}>Filename</label>
              <input value={upForm.filename} onChange={e => setUpForm(f => ({ ...f, filename: e.target.value }))} style={S.input} placeholder="ELTEX-MES.mib" />
            </div>
          </div>

          <div style={{ ...S.group, marginBottom: 12 }}>
            <label style={S.label}>File</label>
            <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #d1d5db', borderRadius: 8, padding: '16px 20px', textAlign: 'center', cursor: 'pointer', background: '#fafafa' }}>
              <Icon name="download" size={18} color="#9ca3af" />
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                {upForm.filename ? `${upForm.filename} (${Math.round(upForm.content.length / 1024)} KB)` : 'Click to select .mib file'}
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".mib,.txt,.my" onChange={onFileSelect} style={{ display: 'none' }} />
          </div>

          <div style={{ ...S.group, marginBottom: 14 }}>
            <label style={S.label}>MIB Content <span style={{ fontSize: 10, color: '#9ca3af' }}>(or paste here)</span></label>
            <textarea
              value={upForm.content}
              onChange={e => setUpForm(f => ({ ...f, content: e.target.value }))}
              placeholder="ELTEX-MES DEFINITIONS ::= BEGIN&#10;..."
              style={{ ...S.input, height: 140, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={upload} disabled={uploading} style={S.btn(accent)}>
              {uploading ? <Spinner /> : <Icon name="download" size={12} color="#fff" />}
              {uploading ? 'Uploading…' : 'Upload & Validate'}
            </button>
            <button onClick={() => { setShowUpload(false); setUpResult(null); }} style={S.ghost}>Close</button>
          </div>
        </div>
      )}

      {/* MIB list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}><Spinner /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div style={{ ...S.card, padding: 40, textAlign: 'center', color: '#9ca3af' }}>
          <Icon name="database" size={32} color="#e5e7eb" />
          <div style={{ marginTop: 12, fontSize: 13 }}>No MIB files uploaded yet</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Upload vendor MIB files to enable custom device monitoring</div>
        </div>
      ) : Object.entries(grouped).map(([vendor, list]) => (
        <div key={vendor} style={S.card}>
          <div style={{ padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #e8ecf0', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {vendor} <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>{list.length} file{list.length !== 1 ? 's' : ''}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Filename', 'MIB Name', 'Size', 'Status', 'Uploaded', 'Actions'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(m => (
                <tr key={m.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11 }}>{m.filename}</td>
                  <td style={{ ...S.td, color: '#6b7280' }}>{m.mib_name || '—'}</td>
                  <td style={{ ...S.td, color: '#9ca3af' }}>{m.size ? `${Math.round(m.size / 1024)} KB` : '—'}</td>
                  <td style={S.td}>
                    {m.valid
                      ? <span style={{ fontSize: 10, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 5, padding: '2px 8px', fontWeight: 700 }}>Valid</span>
                      : <span style={{ fontSize: 10, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 5, padding: '2px 8px', fontWeight: 700 }} title={m.parse_error}>Invalid</span>
                    }
                  </td>
                  <td style={{ ...S.td, fontSize: 10, color: '#9ca3af' }}>{m.created_at?.slice(0, 16) || '—'}</td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => validate(m.id)} disabled={validating === m.id} style={S.btn('#fef3c7', '#d97706')} title="Re-validate">
                        {validating === m.id ? <Spinner /> : <Icon name="refreshCw" size={11} color="#d97706" />}
                      </button>
                      <button onClick={() => del(m)} disabled={deleting === m.id} style={S.btn('#fef2f2', '#ef4444')} title="Delete">
                        {deleting === m.id ? <Spinner /> : <Icon name="trash" size={11} color="#ef4444" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
const TemplatesPage = ({ accent = ACCENT }) => {
  const [tab, setTab] = useState('templates');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <PageHeader
        title="Device Templates & MIBs"
        desc="Manage device monitoring templates and SNMP MIB files"
      />

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setTab('templates')} style={S.tab(tab === 'templates', accent)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="inventory" size={13} color={tab === 'templates' ? '#fff' : '#374151'} />
            Templates
          </span>
        </button>
        <button onClick={() => setTab('mibs')} style={S.tab(tab === 'mibs', accent)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="database" size={13} color={tab === 'mibs' ? '#fff' : '#374151'} />
            MIB Files
          </span>
        </button>
      </div>

      {tab === 'templates' && <TemplatesTab accent={accent} />}
      {tab === 'mibs'      && <MibsTab accent={accent} />}
    </div>
  );
};

export default TemplatesPage;
