import { useState, useEffect, useCallback } from 'react';
import { Icon, PageHeader, TableCard, TD, Badge } from '../components/Charts';
import { getServices, getDevices, createService, updateService, deleteService } from '../api';

// service_status: 0=OK, 1=Warning, 2=Critical, 3=Unknown/Pending
const STATUS_MAP = {
  0: { label: 'OK',      color: '#16a34a', bg: '#dcfce7' },
  1: { label: 'Warning', color: '#d97706', bg: '#fef3c7' },
  2: { label: 'Critical',color: '#dc2626', bg: '#fee2e2' },
  3: { label: 'Unknown', color: '#6b7280', bg: '#f3f4f6' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] ?? STATUS_MAP[3];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700,
      color:s.color, background:s.bg, borderRadius:6, padding:'2px 8px', textTransform:'uppercase' }}>
      {s.label}
    </span>
  );
};

const F = {
  label:  { fontSize:11, fontWeight:600, color:'#374151', marginBottom:4, display:'block' },
  input:  { width:'100%', padding:'7px 10px', fontSize:12, border:'1px solid #d1d5db', borderRadius:7,
            fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:'#111827', background:'#fff' },
  select: { width:'100%', padding:'7px 10px', fontSize:12, border:'1px solid #d1d5db', borderRadius:7,
            fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:'#111827', background:'#fff', cursor:'pointer' },
  group:  { display:'flex', flexDirection:'column', gap:4 },
  row2:   { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
};

const BLANK = {
  device_id:'', service_type:'', service_name:'', service_desc:'',
  service_ip:'', service_param:'', service_disabled:false, service_ignore:false,
};

const ServiceModal = ({ accent, devices, editing, onClose, onSaved }) => {
  const [form,    setForm]    = useState(editing ? {
    device_id:        editing.device_id,
    service_type:     editing.service_type     ?? '',
    service_name:     editing.service_name     ?? '',
    service_desc:     editing.service_desc     ?? '',
    service_ip:       editing.service_ip       ?? '',
    service_param:    editing.service_param    ?? '',
    service_disabled: !!editing.service_disabled,
    service_ignore:   !!editing.service_ignore,
  } : BLANK);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.service_type.trim()) { setError('Service type is required'); return; }
    if (!editing && !form.device_id) { setError('Device is required'); return; }
    setLoading(true); setError('');
    try {
      if (editing) {
        await updateService(editing.service_id, form);
      } else {
        await createService({ ...form, device_id: Number(form.device_id) });
      }
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center' }} onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:14, padding:24, width:480, maxHeight:'90vh',
        overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <span style={{ fontSize:15, fontWeight:700, color:'#111827' }}>{editing ? 'Edit Service' : 'Add Service'}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280', padding:4 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {!editing && (
            <div style={F.group}>
              <label style={F.label}>Device *</label>
              <select style={F.select} value={form.device_id} onChange={e => set('device_id', e.target.value)}>
                <option value="">-- select device --</option>
                {devices.map(d => (
                  <option key={d.device_id} value={d.device_id}>{d.hostname}</option>
                ))}
              </select>
            </div>
          )}

          <div style={F.group}>
            <label style={F.label}>Service Type *</label>
            <input style={F.input} placeholder="e.g. ping, http, https" value={form.service_type}
              onChange={e => set('service_type', e.target.value)} />
          </div>

          <div style={F.row2}>
            <div style={F.group}>
              <label style={F.label}>Service Name</label>
              <input style={F.input} placeholder="Display name" value={form.service_name}
                onChange={e => set('service_name', e.target.value)} />
            </div>
            <div style={F.group}>
              <label style={F.label}>Check IP (optional)</label>
              <input style={F.input} placeholder="Override IP" value={form.service_ip}
                onChange={e => set('service_ip', e.target.value)} />
            </div>
          </div>

          <div style={F.group}>
            <label style={F.label}>Parameters</label>
            <input style={F.input} placeholder="-H host -p 80" value={form.service_param}
              onChange={e => set('service_param', e.target.value)} />
          </div>

          <div style={F.group}>
            <label style={F.label}>Description</label>
            <input style={F.input} placeholder="Optional description" value={form.service_desc}
              onChange={e => set('service_desc', e.target.value)} />
          </div>

          <div style={{ display:'flex', gap:24 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#374151', cursor:'pointer' }}>
              <input type="checkbox" checked={form.service_disabled}
                onChange={e => set('service_disabled', e.target.checked)} />
              Disabled
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#374151', cursor:'pointer' }}>
              <input type="checkbox" checked={form.service_ignore}
                onChange={e => set('service_ignore', e.target.checked)} />
              Ignore alerts
            </label>
          </div>

          {error && <div style={{ background:'#fee2e2', color:'#dc2626', borderRadius:7, padding:'8px 12px', fontSize:12 }}>{error}</div>}

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 }}>
            <button onClick={onClose} style={{ padding:'8px 18px', fontSize:12, borderRadius:7,
              border:'1px solid #d1d5db', background:'#fff', cursor:'pointer', fontFamily:'inherit', color:'#374151' }}>
              Cancel
            </button>
            <button onClick={submit} disabled={loading} style={{ padding:'8px 18px', fontSize:12, fontWeight:600,
              borderRadius:7, border:'none', background:accent, color:'#fff', cursor:'pointer', fontFamily:'inherit', opacity:loading?0.7:1 }}>
              {loading ? 'Saving…' : editing ? 'Save Changes' : 'Add Service'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function ServicesPage({ accent }) {
  const [services, setServices] = useState([]);
  const [devices,  setDevices]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [filterDev,setFilterDev]= useState('');
  const [filterSt, setFilterSt] = useState('');
  const [modal,    setModal]    = useState(null); // null | 'add' | { editing }
  const [confirm,  setConfirm]  = useState(null); // service to delete

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [svcRes, devList] = await Promise.all([getServices(), getDevices()]);
      setServices(svcRes?.services ?? []);
      setDevices(devList);
    } catch {
      setError('Failed to load services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (svc) => {
    try {
      await deleteService(svc.service_id);
      setConfirm(null);
      load();
    } catch (e) {
      alert(e?.response?.data?.message ?? 'Delete failed');
    }
  };

  const handleToggle = async (svc) => {
    try {
      await updateService(svc.service_id, { service_disabled: svc.service_disabled ? 0 : 1 });
      load();
    } catch (e) {
      alert(e?.response?.data?.message ?? 'Update failed');
    }
  };

  const filtered = services.filter(s => {
    if (filterDev && String(s.device_id) !== filterDev) return false;
    if (filterSt  !== '' && String(s.service_status) !== filterSt) return false;
    if (search) {
      const q = search.toLowerCase();
      return (s.service_type||'').toLowerCase().includes(q) ||
             (s.service_name||'').toLowerCase().includes(q) ||
             (s.hostname||'').toLowerCase().includes(q);
    }
    return true;
  });

  const statusCounts = [0,1,2,3].map(st => ({
    st, label: STATUS_MAP[st].label, count: services.filter(s => s.service_status === st).length, ...STATUS_MAP[st]
  }));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <PageHeader
        title="Services"
        desc={`${services.length} service checks`}
        action={
          <button onClick={() => setModal('add')} style={{
            display:'flex', alignItems:'center', gap:6, padding:'8px 16px', fontSize:12, fontWeight:600,
            borderRadius:8, border:'none', background:accent, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
            <Icon name="plus" size={13} color="#fff" /> Add Service
          </button>
        }
      />

      {/* Status summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {statusCounts.map(({ st, label, count, color, bg }) => (
          <div key={st} onClick={() => setFilterSt(filterSt === String(st) ? '' : String(st))}
            style={{ background:'#fff', border:`1.5px solid ${filterSt===String(st)?color:'#e5e7eb'}`,
              borderRadius:10, padding:'12px 16px', cursor:'pointer', transition:'border 0.15s' }}>
            <div style={{ fontSize:22, fontWeight:700, color }}>{count}</div>
            <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e5e7eb', padding:'12px 16px',
        display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flex:'1 1 180px', border:'1px solid #e5e7eb',
          borderRadius:7, padding:'6px 10px', background:'#f9fafb' }}>
          <Icon name="search" size={13} color="#9ca3af" />
          <input placeholder="Search services…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ border:'none', background:'transparent', outline:'none', fontSize:12, color:'#374151', fontFamily:'inherit', width:'100%' }} />
        </div>
        <select value={filterDev} onChange={e => setFilterDev(e.target.value)}
          style={{ padding:'7px 10px', fontSize:12, border:'1px solid #e5e7eb', borderRadius:7,
            fontFamily:'inherit', outline:'none', color:'#374151', background:'#fff', cursor:'pointer', flex:'0 0 180px' }}>
          <option value="">All devices</option>
          {devices.map(d => <option key={d.device_id} value={String(d.device_id)}>{d.hostname}</option>)}
        </select>
        <select value={filterSt} onChange={e => setFilterSt(e.target.value)}
          style={{ padding:'7px 10px', fontSize:12, border:'1px solid #e5e7eb', borderRadius:7,
            fontFamily:'inherit', outline:'none', color:'#374151', background:'#fff', cursor:'pointer', flex:'0 0 140px' }}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(search || filterDev || filterSt) && (
          <button onClick={() => { setSearch(''); setFilterDev(''); setFilterSt(''); }}
            style={{ padding:'7px 12px', fontSize:11, border:'1px solid #e5e7eb', borderRadius:7,
              background:'#f9fafb', cursor:'pointer', fontFamily:'inherit', color:'#6b7280' }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e5e7eb', overflow:'hidden' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #f0f2f5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:13, fontWeight:600, color:'#111827' }}>
            Service Checks <span style={{ fontWeight:400, color:'#6b7280', fontSize:12 }}>({filtered.length})</span>
          </span>
          <button onClick={load} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280', padding:4 }}>
            <Icon name="refresh" size={14} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#9ca3af', fontSize:13 }}>Loading…</div>
        ) : error ? (
          <div style={{ padding:24, color:'#dc2626', fontSize:13 }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#9ca3af', fontSize:13 }}>No services found.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f9fafb' }}>
                {['Device','Service Type','Name','IP','Parameters','Status','Flags','Actions'].map(h => (
                  <th key={h} style={{ padding:'9px 14px', fontSize:10, fontWeight:700, color:'#6b7280',
                    textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((svc, i) => (
                <tr key={svc.service_id} style={{ borderTop:'1px solid #f0f2f5', background:i%2===0?'#fff':'#fafafa' }}>
                  <TD bold>{svc.hostname}</TD>
                  <TD><span style={{ fontFamily:'monospace', fontSize:12 }}>{svc.service_type}</span></TD>
                  <TD>{svc.service_name || <span style={{ color:'#9ca3af' }}>—</span>}</TD>
                  <TD><span style={{ fontFamily:'monospace', fontSize:11, color:'#6b7280' }}>{svc.service_ip || '—'}</span></TD>
                  <TD><span style={{ fontFamily:'monospace', fontSize:10, color:'#6b7280', maxWidth:160, display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{svc.service_param || '—'}</span></TD>
                  <td style={{ padding:'10px 14px' }}>
                    <StatusBadge status={svc.service_status} />
                    {svc.service_message && (
                      <div style={{ fontSize:10, color:'#6b7280', marginTop:2, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={svc.service_message}>
                        {svc.service_message}
                      </div>
                    )}
                  </td>
                  <td style={{ padding:'10px 14px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      {svc.service_disabled ? (
                        <span style={{ fontSize:9, fontWeight:700, color:'#dc2626', background:'#fee2e2', borderRadius:4, padding:'2px 6px' }}>DISABLED</span>
                      ) : null}
                      {svc.service_ignore ? (
                        <span style={{ fontSize:9, fontWeight:700, color:'#d97706', background:'#fef3c7', borderRadius:4, padding:'2px 6px' }}>IGNORE</span>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ padding:'10px 14px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => setModal({ editing: svc })} title="Edit"
                        style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'4px 8px',
                          cursor:'pointer', display:'flex', alignItems:'center' }}>
                        <Icon name="edit" size={12} color="#0284c7" />
                      </button>
                      <button onClick={() => handleToggle(svc)} title={svc.service_disabled ? 'Enable' : 'Disable'}
                        style={{ background: svc.service_disabled ? '#f0fdf4' : '#fff7ed',
                          border:`1px solid ${svc.service_disabled ? '#bbf7d0' : '#fed7aa'}`,
                          borderRadius:6, padding:'4px 8px', cursor:'pointer', display:'flex', alignItems:'center' }}>
                        <Icon name={svc.service_disabled ? 'eye' : 'eyeOff'} size={12}
                          color={svc.service_disabled ? '#16a34a' : '#ea580c'} />
                      </button>
                      <button onClick={() => setConfirm(svc)} title="Delete"
                        style={{ background:'#fff1f2', border:'1px solid #fecdd3', borderRadius:6, padding:'4px 8px',
                          cursor:'pointer', display:'flex', alignItems:'center' }}>
                        <Icon name="trash" size={12} color="#e11d48" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <ServiceModal
          accent={accent}
          devices={devices}
          editing={modal === 'add' ? null : modal.editing}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}

      {/* Delete confirm */}
      {confirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:14, padding:24, width:360,
            boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#111827', marginBottom:8 }}>Delete Service</div>
            <div style={{ fontSize:13, color:'#6b7280', marginBottom:20 }}>
              Remove <strong>{confirm.service_type}</strong> on <strong>{confirm.hostname}</strong>? This cannot be undone.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setConfirm(null)}
                style={{ padding:'8px 18px', fontSize:12, borderRadius:7, border:'1px solid #d1d5db',
                  background:'#fff', cursor:'pointer', fontFamily:'inherit', color:'#374151' }}>Cancel</button>
              <button onClick={() => handleDelete(confirm)}
                style={{ padding:'8px 18px', fontSize:12, fontWeight:600, borderRadius:7, border:'none',
                  background:'#dc2626', color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
