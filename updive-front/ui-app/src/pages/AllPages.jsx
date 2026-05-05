import { useState, useEffect } from 'react';
import { StatCard, Badge, Icon, TableCard, PageHeader, TD, BarChartSVG, MiniAreaSVG } from '../components/Charts';
import { getDevices, getAlerts, getPorts, getLogs, getServices, getPollers, getBgp, getSystemInfo, addDevice, deleteDevice, updateDevice, invalidateCache } from '../api';

// ─── FORM HELPERS ─────────────────────────────────────────────────
const F = {
  label: { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fff' },
  select: { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fff', cursor: 'pointer' },
  group: { display: 'flex', flexDirection: 'column', gap: 4 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  section: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 10px', paddingBottom: 6, borderBottom: '1px solid #f0f2f5' },
};

const BLANK = { hostname: '', snmpver: 'v2c', community: 'public', port: '161', transport: 'udp', force_add: false, ping_fallback: false, snmp_disable: false, os: '', authlevel: 'noAuthNoPriv', authname: '', authpass: '', authalgo: 'MD5', cryptopass: '', cryptoalgo: 'AES' };

// ─── ADD DEVICE MODAL ─────────────────────────────────────────────
const AddDeviceModal = ({ accent, onClose, onAdded }) => {
  const [form,    setForm]    = useState(BLANK);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.hostname.trim()) { setError('Hostname or IP is required'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const body = { hostname: form.hostname.trim(), port: Number(form.port) || 161, transport: form.transport, force_add: form.force_add, ping_fallback: form.ping_fallback };
      if (form.snmp_disable) {
        body.snmp_disable = true;
        body.os = form.os || 'ping';
      } else {
        body.snmpver = form.snmpver;
        if (form.snmpver === 'v1' || form.snmpver === 'v2c') {
          body.community = form.community;
        } else {
          body.authlevel  = form.authlevel;
          body.authname   = form.authname;
          body.authpass   = form.authpass;
          body.authalgo   = form.authalgo;
          if (form.authlevel === 'authPriv') { body.cryptopass = form.cryptopass; body.cryptoalgo = form.cryptoalgo; }
        }
      }
      const res = await addDevice(body);
      if (res.status === 'ok') {
        setSuccess(res.message || 'Device added successfully');
        invalidateCache('devices');
        setTimeout(() => { onAdded(); onClose(); }, 1200);
      } else {
        setError(res.message || 'Failed to add device');
      }
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Request failed');
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Add Device</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Add a new device to SNMP monitoring</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '0 20px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={F.section}>Connection</div>

          <div style={{ ...F.row2, marginBottom: 12 }}>
            <div style={F.group}>
              <label style={F.label}>Hostname / IP <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={F.input} value={form.hostname} onChange={e => set('hostname', e.target.value)} placeholder="192.168.1.1" autoFocus />
            </div>
            <div style={F.group}>
              <label style={F.label}>SNMP Port</label>
              <input style={F.input} value={form.port} onChange={e => set('port', e.target.value)} placeholder="161" />
            </div>
          </div>

          <div style={{ ...F.row2, marginBottom: 12 }}>
            <div style={F.group}>
              <label style={F.label}>Transport</label>
              <select style={F.select} value={form.transport} onChange={e => set('transport', e.target.value)}>
                {['udp','tcp','udp6','tcp6'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-end', paddingBottom: 2 }}>
              {[['force_add','Force add'],['ping_fallback','Ping fallback'],['snmp_disable','Ping only (no SNMP)']].map(([k,l]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: accent, cursor: 'pointer' }} />
                  {l}
                </label>
              ))}
            </div>
          </div>

          {form.snmp_disable ? (
            <>
              <div style={F.section}>Ping-only Device</div>
              <div style={F.group}>
                <label style={F.label}>OS Type <span style={{ color: '#9ca3af' }}>(required for ping-only)</span></label>
                <input style={F.input} value={form.os} onChange={e => set('os', e.target.value)} placeholder="ping" />
              </div>
            </>
          ) : (
            <>
              <div style={F.section}>SNMP Configuration</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['v1','v2c','v3'].map(v => (
                    <button key={v} onClick={() => set('snmpver', v)} style={{
                      padding: '5px 16px', borderRadius: 20, border: '1px solid',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      background: form.snmpver === v ? accent : '#fff',
                      color: form.snmpver === v ? '#fff' : '#6b7280',
                      borderColor: form.snmpver === v ? accent : '#e5e7eb',
                    }}>SNMP {v}</button>
                  ))}
                </div>
              </div>

              {(form.snmpver === 'v1' || form.snmpver === 'v2c') && (
                <div style={{ ...F.group, marginBottom: 12 }}>
                  <label style={F.label}>Community String</label>
                  <input style={F.input} value={form.community} onChange={e => set('community', e.target.value)} placeholder="public" />
                </div>
              )}

              {form.snmpver === 'v3' && (
                <>
                  <div style={{ ...F.group, marginBottom: 12 }}>
                    <label style={F.label}>Auth Level</label>
                    <select style={F.select} value={form.authlevel} onChange={e => set('authlevel', e.target.value)}>
                      <option value="noAuthNoPriv">noAuthNoPriv</option>
                      <option value="authNoPriv">authNoPriv</option>
                      <option value="authPriv">authPriv</option>
                    </select>
                  </div>
                  {form.authlevel !== 'noAuthNoPriv' && (
                    <>
                      <div style={{ ...F.row2, marginBottom: 12 }}>
                        <div style={F.group}>
                          <label style={F.label}>Auth Username</label>
                          <input style={F.input} value={form.authname} onChange={e => set('authname', e.target.value)} placeholder="snmpuser" />
                        </div>
                        <div style={F.group}>
                          <label style={F.label}>Auth Algorithm</label>
                          <select style={F.select} value={form.authalgo} onChange={e => set('authalgo', e.target.value)}>
                            <option value="MD5">MD5</option>
                            <option value="SHA">SHA</option>
                            <option value="SHA-224">SHA-224</option>
                            <option value="SHA-256">SHA-256</option>
                            <option value="SHA-384">SHA-384</option>
                            <option value="SHA-512">SHA-512</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ ...F.group, marginBottom: 12 }}>
                        <label style={F.label}>Auth Password</label>
                        <input style={F.input} type="password" value={form.authpass} onChange={e => set('authpass', e.target.value)} />
                      </div>
                    </>
                  )}
                  {form.authlevel === 'authPriv' && (
                    <div style={{ ...F.row2, marginBottom: 12 }}>
                      <div style={F.group}>
                        <label style={F.label}>Crypto Password</label>
                        <input style={F.input} type="password" value={form.cryptopass} onChange={e => set('cryptopass', e.target.value)} />
                      </div>
                      <div style={F.group}>
                        <label style={F.label}>Crypto Algorithm</label>
                        <select style={F.select} value={form.cryptoalgo} onChange={e => set('cryptoalgo', e.target.value)}>
                          <option value="AES">AES</option>
                          <option value="DES">DES</option>
                          <option value="AES-192">AES-192</option>
                          <option value="AES-256">AES-256</option>
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {error   && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div>}
          {success && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: '#16a34a', marginTop: 4 }}>{success}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #f0f2f5', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={loading} style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: loading ? '#9ca3af' : accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', minWidth: 100 }}>
            {loading ? 'Adding...' : 'Add Device'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── EDIT DEVICE MODAL ────────────────────────────────────────────
const EditDeviceModal = ({ device, accent, onClose, onSaved }) => {
  const [form,    setForm]    = useState({
    display:      device.display      ?? '',
    overwrite_ip: device.overwrite_ip ?? device.ip ?? '',
    community:    device.community    ?? 'public',
    snmpver:      device.snmpver      ?? 'v2c',
    port:         String(device.port  ?? 161),
    notes:        device.notes        ?? '',
    purpose:      device.purpose      ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true); setError('');
    try {
      const fields = [
        ['display',      form.display],
        ['overwrite_ip', form.overwrite_ip.trim() || null],
        ['community',    form.community],
        ['snmpver',      form.snmpver],
        ['port',         Number(form.port) || 161],
        ['notes',        form.notes],
        ['purpose',      form.purpose],
      ];
      await Promise.all(fields.map(([field, data]) => updateDevice(device.hostname, field, data)));
      invalidateCache('devices');
      onSaved();
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Update failed');
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Edit Device</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{device.display || device.sysName || device.hostname}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Read-only info */}
        <div style={{ padding: '12px 20px', background: '#f9fafb', borderBottom: '1px solid #f0f2f5', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flexShrink: 0 }}>
          {[
            ['Hostname',    device.hostname],
            ['Current IP',  device.ip],
            ['sysObjectID', device.sysObjectID || '—'],
            ['Hardware',    device.hardware    || '—'],
            ['OS',          device.os          || '—'],
            ['Version',     device.version     || '—'],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 1 }}>{l}</div>
              <div style={{ fontSize: 11, color: '#374151', fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Editable fields */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#b91c1c' }}>{error}</div>}

          <div style={{ ...F.row2 }}>
            <div style={F.group}>
              <label style={F.label}>Display Name <span style={{ color: '#9ca3af', fontWeight: 400 }}>(UI override)</span></label>
              <input style={F.input} value={form.display} onChange={e => set('display', e.target.value)} placeholder={device.display || device.sysName || device.hostname} />
            </div>
            <div style={F.group}>
              <label style={F.label}>Override IP <span style={{ color: '#9ca3af', fontWeight: 400 }}>(current: {device.ip})</span></label>
              <input style={F.input} value={form.overwrite_ip} onChange={e => set('overwrite_ip', e.target.value)} placeholder={device.ip} />
            </div>
          </div>

          <div style={{ ...F.row2 }}>
            <div style={F.group}>
              <label style={F.label}>SNMP Community</label>
              <input style={F.input} value={form.community} onChange={e => set('community', e.target.value)} placeholder="public" />
            </div>
            <div style={F.group}>
              <label style={F.label}>SNMP Version</label>
              <select style={F.select} value={form.snmpver} onChange={e => set('snmpver', e.target.value)}>
                {['v1','v2c','v3'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div style={{ ...F.row2 }}>
            <div style={F.group}>
              <label style={F.label}>SNMP Port</label>
              <input style={F.input} value={form.port} onChange={e => set('port', e.target.value)} placeholder="161" />
            </div>
            <div style={F.group}>
              <label style={F.label}>Purpose</label>
              <input style={F.input} value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder="Core switch..." />
            </div>
          </div>

          <div style={F.group}>
            <label style={F.label}>Notes</label>
            <textarea style={{ ...F.input, resize: 'vertical', minHeight: 64 }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #f0f2f5', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={loading} style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: loading ? '#9ca3af' : accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', minWidth: 80 }}>
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── DEVICES ──────────────────────────────────────────────────────
export const DevicesPage = ({ accent, onSelectDevice }) => {
  const [devices,    setDevices]    = useState([]);
  const [filter,     setFilter]     = useState('all');
  const [showModal,  setShowModal]  = useState(false);
  const [editDevice, setEditDevice] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [deleting,   setDeleting]   = useState(null);

  const load = () => {
    invalidateCache('devices');
    getDevices().then(setDevices).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (hostname) => {
    setDeleting(hostname);
    try {
      await deleteDevice(hostname);
      invalidateCache('devices');
      setDevices(d => d.filter(x => x.hostname !== hostname));
    } catch {/* silent */}
    setDeleting(null);
    setDelConfirm(null);
  };

  const getStatus = d => d.status === 1 ? 'up' : d.status === 0 ? 'down' : 'warning';
  const filtered  = filter === 'all' ? devices : devices.filter(d => getStatus(d) === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showModal   && <AddDeviceModal  accent={accent} onClose={() => setShowModal(false)}   onAdded={load} />}
      {editDevice  && <EditDeviceModal accent={accent} onClose={() => setEditDevice(null)} onSaved={load} device={editDevice} />}

      <PageHeader title="Devices" desc="All managed devices and their current status."
        action={
          <button onClick={() => setShowModal(true)} style={{ background: accent, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="server" size={13} color="#fff" /> + Add Device
          </button>
        }
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard label="Total" value={devices.length} icon="server" color={accent} />
        <StatCard label="Up"    value={devices.filter(d => d.status === 1).length} icon="checkCircle" color="#22c55e" />
        <StatCard label="Down"  value={devices.filter(d => d.status === 0).length} icon="xCircle"     color="#ef4444" />
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0f2f5', display: 'flex', gap: 6 }}>
          {['all', 'up', 'down'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '4px 12px', borderRadius: 20, border: '1px solid', fontSize: 11, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
              background: filter === f ? accent : '#fff',
              color: filter === f ? '#fff' : '#6b7280',
              borderColor: filter === f ? accent : '#e5e7eb',
            }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Hostname', 'IP Address', 'sysObjectID', 'OS', 'Status', 'Uptime', ''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 600, color: '#6b7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={d.device_id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: accent, cursor: 'pointer' }} onClick={() => onSelectDevice(d.hostname)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: d.status === 1 ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
                      {d.icon && (
                        <img src={d.icon.includes('/') ? `/${d.icon}` : `/images/os/${d.icon}`} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                      )}
                      <div>
                        <div>{d.display || d.sysName || d.hostname}</div>
                        {((d.display || d.sysName) && (d.display || d.sysName) !== d.hostname) && (
                          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>{d.hostname}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{d.ip}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {d.sysObjectID ? (
                      <span title={d.sysObjectID} style={{
                        fontSize: 10, fontFamily: 'monospace', color: '#6366f1',
                        background: '#eef2ff', padding: '2px 7px', borderRadius: 4,
                        display: 'inline-block', maxWidth: 160, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle',
                      }}>
                        {d.sysObjectID}
                      </span>
                    ) : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#374151' }}>{d.os || ''}</td>
                  <td style={{ padding: '10px 14px' }}><Badge status={getStatus(d)} /></td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#6b7280' }}>{d.uptime || ''}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    {delConfirm === d.hostname ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: '#6b7280' }}>Delete?</span>
                        <button onClick={() => handleDelete(d.hostname)} disabled={deleting === d.hostname} style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {deleting === d.hostname ? '...' : 'Yes'}
                        </button>
                        <button onClick={() => setDelConfirm(null)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>No</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditDevice(d)} style={{ background: 'none', border: `1px solid ${accent}40`, borderRadius: 6, padding: '3px 10px', fontSize: 10, color: accent, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                          Edit
                        </button>
                        <button onClick={() => setDelConfirm(d.hostname)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 10px', fontSize: 10, color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── PORTS ────────────────────────────────────────────────────────
export const PortsPage = ({ accent }) => {
  const [ports, setPorts] = useState([]);
  useEffect(() => { getPorts().then(setPorts).catch(() => {}); }, []);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <PageHeader title="Ports" desc="Interface utilization and traffic statistics." />
      <div style={{ display:"flex", gap:10 }}>
        <StatCard label="Total Ports" value={ports.length} icon="wifi" color={accent} />
        <StatCard label="Up" value={ports.filter(p=>p.ifOperStatus==="up").length} icon="checkCircle" color="#22c55e" />
      </div>
      <TableCard headers={["Device","Port","Description","Speed","Status"]} rows={ports.slice(0,20)}
        renderRow={(p,i) => (
          <tr key={p.port_id||i} style={{ borderTop:"1px solid #f0f2f5", background:i%2===0?"#fff":"#fafafa" }}>
            <TD>{p.hostname||""}</TD>
            <TD mono bold>{p.ifName||""}</TD>
            <TD>{p.ifAlias||""}</TD>
            <TD>{p.ifSpeed ? `${Math.round(p.ifSpeed/1e6)} Mbps` : ""}</TD>
            <td style={{ padding:"10px 14px" }}><Badge status={p.ifOperStatus==="up"?"up":"down"} /></td>
          </tr>
        )} />
    </div>
  );
};

// ─── LOGS ─────────────────────────────────────────────────────────
// LogsPage moved to ./LogsPage.jsx
export { default as LogsPage } from './LogsPage';

// ─── SERVICES ─────────────────────────────────────────────────────
export const ServicesPage = ({ accent }) => {
  const [services, setServices] = useState([]);
  useEffect(() => { getServices().then(setServices).catch(() => {}); }, []);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <PageHeader title="Services" desc="Nagios-compatible service checks." />
      <TableCard headers={["Device","Service","Status"]} rows={services.slice(0,20)}
        renderRow={(r,i) => (
          <tr key={r.service_id||i} style={{ borderTop:"1px solid #f0f2f5", background:i%2===0?"#fff":"#fafafa" }}>
            <TD bold>{r.hostname||""}</TD><TD>{r.service_type||""}</TD>
            <td style={{ padding:"10px 14px" }}><Badge status={r.service_status===0?"ok":"warning"} /></td>
          </tr>
        )} />
    </div>
  );
};

// ─── POLLERS ──────────────────────────────────────────────────────
export const PollersPage = ({ accent }) => {
  const [pollers, setPollers] = useState([]);
  useEffect(() => { getPollers().then(setPollers).catch(() => {}); }, []);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <PageHeader title="Pollers" desc="SNMP polling nodes." />
      {pollers.map(p => (
        <div key={p.id} style={{ background:"#fff", borderRadius:10, border:"1px solid #e8ecf0", padding:20 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>{p.poller_name||"poller"}</div>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Last polled: {p.last_polled||""}</div>
        </div>
      ))}
    </div>
  );
};

// ─── BGP ──────────────────────────────────────────────────────────
export const BgpPage = ({ accent }) => {
  const [bgp, setBgp] = useState([]);
  useEffect(() => { getBgp().then(setBgp).catch(() => {}); }, []);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <PageHeader title="BGP Sessions" desc="Border Gateway Protocol sessions." />
      <TableCard headers={["Peer IP","Remote ASN","State"]} rows={bgp}
        renderRow={(r,i) => (
          <tr key={r.bgpPeer_id||i} style={{ borderTop:"1px solid #f0f2f5", background:i%2===0?"#fff":"#fafafa" }}>
            <TD mono bold>{r.bgpPeerIdentifier||""}</TD>
            <TD>{r.bgpPeerRemoteAs||""}</TD>
            <td style={{ padding:"10px 14px" }}><Badge status={r.bgpPeerState==="established"?"up":"down"} /></td>
          </tr>
        )} />
    </div>
  );
};

// SystemPage moved to ./SystemPage.jsx
export { default as SystemPage } from './SystemPage';

export const PlaceholderPage = ({ title, desc, accent }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
    <PageHeader title={title} desc={desc} />
    <div style={{ background:"#fff", borderRadius:10, border:"1px solid #e8ecf0", padding:40, textAlign:"center" }}>
      <Icon name="server" size={40} color="#d1d5db" />
      <p style={{ fontSize:14, color:"#9ca3af", marginTop:12 }}>This module is coming soon...</p>
    </div>
  </div>
);
