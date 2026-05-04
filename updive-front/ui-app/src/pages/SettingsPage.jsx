import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Charts';
import { getSystemInfo, getConfig, updateConfig } from '../api';
import { getTransportsV2, createTransportV2, updateTransportV2, deleteTransportV2, getTransportV2 } from '../api';

const ACCENT = '#22c55e';

// ─── Transport type definitions ───────────────────────────────────
const TRANSPORT_TYPES = {
  mail:          { label: 'Email',           fields: [{ key: 'email', label: 'To Address', type: 'text', placeholder: 'alerts@example.com' }] },
  slack:         { label: 'Slack',           fields: [{ key: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://hooks.slack.com/...' }, { key: 'channel', label: 'Channel', type: 'text', placeholder: '#alerts' }] },
  telegram:      { label: 'Telegram',        fields: [{ key: 'chat_id', label: 'Chat ID', type: 'text', placeholder: '-100...' }, { key: 'token', label: 'Bot Token', type: 'text', placeholder: '123456:ABC...' }] },
  microsoftteams:{ label: 'MS Teams',        fields: [{ key: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://outlook.office.com/webhook/...' }] },
  script:        { label: 'Script/Webhook',  fields: [{ key: 'script', label: 'Script Path / URL', type: 'text', placeholder: '/usr/local/bin/notify.sh' }] },
  pushover:      { label: 'Pushover',        fields: [{ key: 'appkey', label: 'App Key', type: 'text', placeholder: '' }, { key: 'userkey', label: 'User Key', type: 'text', placeholder: '' }] },
};

const CONFIG_DEFS = [
  { name: 'allow_unauth_graphs',    label: 'Allow unauthenticated graphs', type: 'bool',   desc: 'Graph images accessible without X-Auth-Token' },
  { name: 'device_display_default', label: 'Device display template',      type: 'text',   desc: 'Template for device name display, e.g. {{ $hostname }}' },
  { name: 'snmp.unescape',          label: 'SNMP unescape strings',        type: 'bool',   desc: 'Unescape OctetString values from SNMP' },
];

const F = {
  label:  { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' },
  input:  { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fff' },
  select: { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fff', cursor: 'pointer' },
  group:  { display: 'flex', flexDirection: 'column', gap: 4 },
  row2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  section:{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '20px 0 12px', paddingBottom: 6, borderBottom: '1px solid #f0f2f5' },
  card:   { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '16px 20px' },
};

// ─── Confirm delete ───────────────────────────────────────────────
const ConfirmModal = ({ message, onConfirm, onClose }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 360, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Confirm</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>{message}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button onClick={onConfirm} style={{ padding: '7px 14px', fontSize: 12, border: 'none', borderRadius: 7, background: '#ef4444', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Delete</button>
      </div>
    </div>
  </div>
);

// ─── Transport modal ──────────────────────────────────────────────
const TransportModal = ({ transport, onClose, onSaved }) => {
  const isEdit = !!transport;
  const [name,   setName]   = useState(transport?.transport_name ?? '');
  const [type,   setType]   = useState(transport?.transport_type ?? 'mail');
  const [def,    setDef]    = useState(false);
  const [cfg,    setCfg]    = useState({});
  const [loading,setLoading]= useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (isEdit && transport.transport_id) {
      getTransportV2(transport.transport_id).then(t => {
        if (t?.transport_config) setCfg(typeof t.transport_config === 'string' ? JSON.parse(t.transport_config) : t.transport_config);
        setDef(!!t?.is_default);
      });
    }
  }, [isEdit, transport]);

  const fields = TRANSPORT_TYPES[type]?.fields ?? [];
  const setField = (k, v) => setCfg(c => ({ ...c, [k]: v }));

  const submit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setLoading(true); setError('');
    try {
      const body = { transport_name: name.trim(), transport_type: type, is_default: def, transport_config: cfg };
      if (isEdit) {
        await updateTransportV2(transport.transport_id, body);
      } else {
        await createTransportV2(body);
      }
      onSaved(); onClose();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Request failed');
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{isEdit ? 'Edit Transport' : 'Add Transport'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><Icon name="close" size={18} /></button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={F.row2}>
            <div style={F.group}>
              <label style={F.label}>Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={F.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Slack NOC" />
            </div>
            <div style={F.group}>
              <label style={F.label}>Type</label>
              <select style={F.select} value={type} onChange={e => { setType(e.target.value); setCfg({}); }} disabled={isEdit}>
                {Object.entries(TRANSPORT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          {fields.map(f => (
            <div key={f.key} style={F.group}>
              <label style={F.label}>{f.label}</label>
              <input style={F.input} type={f.type} value={cfg[f.key] ?? ''} onChange={e => setField(f.key, e.target.value)} placeholder={f.placeholder} />
            </div>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={def} onChange={e => setDef(e.target.checked)} />
            Set as default transport
          </label>
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: '#dc2626' }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f2f5', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ padding: '7px 16px', fontSize: 12, border: 'none', borderRadius: 7, background: ACCENT, color: '#fff', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Config row ───────────────────────────────────────────────────
const ConfigRow = ({ def, value, onSave }) => {
  const [val, setVal]     = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]  = useState(false);

  useEffect(() => { setVal(value ?? ''); }, [value]);

  const save = async (newVal) => {
    setSaving(true);
    try { await onSave(def.name, String(newVal)); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch {}
    setSaving(false);
  };

  if (def.type === 'bool') {
    const checked = val === '1' || val === 'true' || val === true;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{def.label}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{def.desc}</div>
        </div>
        <button onClick={() => { const nv = checked ? '0' : '1'; setVal(nv); save(nv); }} style={{ position: 'relative', width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: checked ? ACCENT : '#d1d5db', transition: 'background 0.2s', flexShrink: 0 }}>
          <span style={{ position: 'absolute', top: 3, left: checked ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{def.label}</div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{def.desc}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <input style={{ ...F.input, width: 220 }} value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && save(val)} />
        <button onClick={() => save(val)} disabled={saving} style={{ padding: '7px 10px', fontSize: 11, border: 'none', borderRadius: 7, background: saved ? '#f0fdf4' : '#f3f4f6', color: saved ? '#15803d' : '#374151', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, minWidth: 54 }}>
          {saving ? '…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
};

// ─── System info card ─────────────────────────────────────────────
const InfoItem = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f9fafb' }}>
    <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>{value ?? '—'}</span>
  </div>
);

// ─── Main page ────────────────────────────────────────────────────
export default function SettingsPage({ accent = ACCENT }) {
  const [sysInfo,     setSysInfo]     = useState(null);
  const [config,      setConfig]      = useState([]);
  const [transports,  setTransports]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [tModal,      setTModal]      = useState(null); // null | 'add' | transport obj
  const [confirm,     setConfirm]     = useState(null);
  const [tError,      setTError]      = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [sys, cfg, tr] = await Promise.allSettled([
      getSystemInfo(),
      getConfig(),
      getTransportsV2(),
    ]);
    if (sys.status === 'fulfilled') setSysInfo(sys.value?.system?.[0] ?? sys.value);
    if (cfg.status === 'fulfilled') setConfig(cfg.value);
    if (tr.status  === 'fulfilled') setTransports(tr.value);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const configMap = config.reduce((m, r) => { m[r.config_name] = r.config_value; return m; }, {});

  const handleDeleteTransport = async () => {
    if (!confirm) return;
    try { await deleteTransportV2(confirm.transport_id); loadAll(); }
    catch (e) { setTError(e.response?.data?.message || 'Delete failed'); }
    setConfirm(null);
  };

  const TRANSPORT_TYPE_COLORS = { mail: '#6b7280', slack: '#4a154b', telegram: '#0088cc', microsoftteams: '#464EB8', script: '#374151', pushover: '#DB3939' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Settings</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>System configuration and alert transports</div>
      </div>

      {/* System Info */}
      <div style={F.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 4 }}>System Information</div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>Read-only runtime info</div>
        {loading ? <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</div> : sysInfo ? (
          <>
            <InfoItem label="UpdiveNSM Version"  value={sysInfo.local_ver} />
            <InfoItem label="PHP Version"         value={sysInfo.php_ver} />
            <InfoItem label="Database"            value={sysInfo.database_ver} />
            <InfoItem label="RRDtool"             value={`${sysInfo.rrdtool_ver}`} />
            <InfoItem label="Net-SNMP"            value={sysInfo.netsnmp_ver} />
            <InfoItem label="Python"              value={sysInfo.python_ver} />
            <InfoItem label="DB Schema"           value={sysInfo.db_schema} />
          </>
        ) : <div style={{ fontSize: 12, color: '#9ca3af' }}>Unavailable</div>}
      </div>

      {/* General Config */}
      <div style={F.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 4 }}>General Configuration</div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>Stored in the database — changes take effect immediately</div>
        {loading ? <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</div> : CONFIG_DEFS.map(def => (
          <ConfigRow key={def.name} def={def} value={configMap[def.name]} onSave={updateConfig} />
        ))}
      </div>

      {/* Alert Transports */}
      <div style={F.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Alert Transports</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Notification channels for alert rules</div>
          </div>
          <button onClick={() => setTModal('add')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 7, background: accent, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name="alerts" size={12} color="#fff" /> Add Transport
          </button>
        </div>

        {tError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: '#dc2626', marginBottom: 10 }}>{tError}</div>}

        {loading ? (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</div>
        ) : transports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: '#9ca3af' }}>
            No transports configured. Add one to receive alert notifications.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {transports.map(t => {
              const typeDef = TRANSPORT_TYPES[t.transport_type];
              const typeColor = TRANSPORT_TYPE_COLORS[t.transport_type] ?? '#6b7280';
              return (
                <div key={t.transport_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: typeColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="bell" size={15} color={typeColor} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{t.transport_name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: typeColor + '18', color: typeColor, textTransform: 'uppercase' }}>
                        {typeDef?.label ?? t.transport_type}
                      </span>
                      {t.is_default && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: '#f0fdf4', color: '#15803d' }}>Default</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setTModal(t)} title="Edit" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <Icon name="edit" size={12} color="#6b7280" />
                    </button>
                    <button onClick={() => setConfirm(t)} title="Delete" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <Icon name="close" size={12} color="#ef4444" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {tModal === 'add' && <TransportModal onClose={() => setTModal(null)} onSaved={loadAll} />}
      {tModal && tModal !== 'add' && <TransportModal transport={tModal} onClose={() => setTModal(null)} onSaved={loadAll} />}
      {confirm && <ConfirmModal message={`Delete transport "${confirm.transport_name}"?`} onConfirm={handleDeleteTransport} onClose={() => setConfirm(null)} />}
    </div>
  );
}
