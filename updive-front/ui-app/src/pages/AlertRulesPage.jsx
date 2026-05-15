import { useState, useEffect, useCallback } from 'react';
import { Icon, PageHeader } from '../components/Charts';
import {
  getAlertRulesV2, getAlertRuleV2,
  updateAlertRuleV2, deleteAlertRuleV2, toggleAlertRuleV2,
  createAlertRuleV1, testAlertRule,
} from '../api';

// ─── Tokens ────────────────────────────────────────────────────────
const SEV = {
  critical: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  warning:  { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  ok:       { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
};
const S = {
  card:   { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' },
  th:     { padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#6b7280', textAlign: 'left', background: '#f9fafb', borderBottom: '1px solid #e8ecf0', whiteSpace: 'nowrap' },
  td:     { padding: '10px 14px', fontSize: 12.5, color: '#374151', verticalAlign: 'middle' },
  btn:    (bg, color = '#fff') => ({ padding: '5px 12px', borderRadius: 7, border: 'none', background: bg, color, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }),
  ghost:  { padding: '5px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 },
  input:  { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: '#111827', boxSizing: 'border-box' },
  label:  { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' },
  select: { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: '#111827', background: '#fff', boxSizing: 'border-box' },
};

const SevBadge = ({ sev }) => {
  const t = SEV[sev] ?? SEV.ok;
  return (
    <span style={{ padding: '2px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700,
      background: t.bg, color: t.color, border: `1px solid ${t.border}` }}>
      {sev}
    </span>
  );
};

const Toggle = ({ checked, onChange }) => (
  <button onClick={onChange} style={{
    width: 34, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', padding: 0,
    background: checked ? '#22c55e' : '#d1d5db', position: 'relative', transition: 'background 0.2s',
  }}>
    <span style={{
      position: 'absolute', top: 2, left: checked ? 18 : 2, width: 14, height: 14,
      borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block',
    }} />
  </button>
);

// ─── Detail slide-over ─────────────────────────────────────────────
const DetailPanel = ({ id, onClose, accent }) => {
  const [rule, setRule] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAlertRuleV2(id)
      .then(d => setRule(d.rule))
      .catch(() => setRule(null))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,.25)' }} />
      <div style={{ width: 480, background: '#fff', display: 'flex', flexDirection: 'column',
        borderLeft: '1px solid #e8ecf0', boxShadow: '-4px 0 24px rgba(0,0,0,.1)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8ecf0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="alerts" size={16} color={accent} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{rule?.name ?? '—'}</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>Rule #{id}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <Icon name="xCircle" size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading && <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
          {!loading && !rule && <div style={{ color: '#ef4444', fontSize: 13 }}>Rule not found.</div>}
          {rule && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Meta */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <SevBadge sev={rule.severity} />
                <span style={{ padding: '2px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  background: rule.disabled ? '#f3f4f6' : '#f0fdf4',
                  color: rule.disabled ? '#6b7280' : '#16a34a',
                  border: `1px solid ${rule.disabled ? '#e5e7eb' : '#bbf7d0'}` }}>
                  {rule.disabled ? 'Disabled' : 'Enabled'}
                </span>
                <span style={{ fontSize: 11, color: '#6b7280', padding: '2px 0' }}>
                  Fires (30d): <strong style={{ color: '#111827' }}>{rule.fires_30d ?? 0}</strong>
                </span>
              </div>

              {/* Query */}
              {rule.query && (
                <div>
                  <div style={{ ...S.label, marginBottom: 6 }}>Query</div>
                  <pre style={{ margin: 0, padding: '10px 12px', background: '#f9fafb', borderRadius: 7,
                    border: '1px solid #e8ecf0', fontSize: 11, color: '#374151', overflowX: 'auto',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                    {rule.query}
                  </pre>
                </div>
              )}

              {/* Smart Alert Thresholds */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Smart Alert Thresholds
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Confirm Count</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                      {rule.confirm_count ?? 1}
                      <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>polls</span>
                    </div>
                  </div>
                  <div style={{ width: 1, background: '#e5e7eb' }} />
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Delay</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                      {rule.delay_min ?? 0}
                      <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>min</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, alignSelf: 'center' }}>
                    {(rule.confirm_count ?? 1) <= 1 && (rule.delay_min ?? 0) === 0
                      ? <span style={{ fontSize: 10, color: '#f59e0b', background: '#fffbeb', padding: '2px 7px', borderRadius: 5, border: '1px solid #fde68a' }}>Instant fire</span>
                      : <span style={{ fontSize: 10, color: '#10b981', background: '#f0fdf4', padding: '2px 7px', borderRadius: 5, border: '1px solid #bbf7d0' }}>Protected</span>
                    }
                  </div>
                </div>
              </div>

              {/* Notes */}
              {rule.notes && (
                <div>
                  <div style={S.label}>Notes</div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{rule.notes}</div>
                </div>
              )}

              {/* Active alerts */}
              {rule.alerts?.length > 0 && (
                <div>
                  <div style={{ ...S.label, marginBottom: 8 }}>
                    Active Alerts ({rule.alerts.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {rule.alerts.map(a => (
                      <div key={a.id} style={{ padding: '7px 10px', background: '#fef2f2',
                        borderRadius: 6, fontSize: 12, color: '#374151', border: '1px solid #fecaca' }}>
                        {a.device?.hostname ?? `Device #${a.device_id}`}
                        <span style={{ color: '#9ca3af', marginLeft: 6 }}>{a.timestamp}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Devices */}
              {rule.devices?.length > 0 && (
                <div>
                  <div style={{ ...S.label, marginBottom: 8 }}>Scoped Devices ({rule.devices.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {rule.devices.map(d => (
                      <span key={d.device_id} style={{ padding: '2px 9px', borderRadius: 5,
                        fontSize: 11, background: '#f0f9ff', color: '#0369a1',
                        border: '1px solid #bae6fd' }}>{d.hostname}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Groups */}
              {rule.groups?.length > 0 && (
                <div>
                  <div style={{ ...S.label, marginBottom: 8 }}>Device Groups</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {rule.groups.map(g => (
                      <span key={g.id} style={{ padding: '2px 9px', borderRadius: 5,
                        fontSize: 11, background: '#faf5ff', color: '#7c3aed',
                        border: '1px solid #e9d5ff' }}>{g.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Rule Form Modal — Template + Visual Builder + Test ───────────

const TEMPLATES = [
  { icon: '📡', label: 'Device Down',     severity: 'critical', query: 'devices.status = 0',                                              name: 'Device Down' },
  { icon: '🔥', label: 'CPU Critical',    severity: 'critical', query: 'processors.processor_usage > 95',                                 name: 'CPU Critical (>95%)' },
  { icon: '⚠️', label: 'CPU High',        severity: 'warning',  query: 'processors.processor_usage > 80',                                 name: 'CPU High (>80%)' },
  { icon: '💾', label: 'Memory Full',     severity: 'critical', query: 'mempools.mempool_perc > 95',                                      name: 'Memory Full (>95%)' },
  { icon: '💾', label: 'Memory High',     severity: 'warning',  query: 'mempools.mempool_perc > 85',                                      name: 'Memory High (>85%)' },
  { icon: '🔌', label: 'Port Down',       severity: 'warning',  query: 'ports.ifOperStatus = "down" AND ports.ifAdminStatus = "up"',      name: 'Port Down (Admin Up)' },
  { icon: '↕️', label: 'Half Duplex',     severity: 'warning',  query: 'ports.ifDuplex = "half"',                                        name: 'Port Half Duplex' },
  { icon: '🌡️', label: 'Sensor Alert',   severity: 'warning',  query: 'sensors.sensor_alert = 1',                                       name: 'Sensor Alert' },
];

const FIELDS = [
  { key: 'devices.status',               label: 'Device Status',        type: 'enum',   opts: [['0','Down'],['1','Up']] },
  { key: 'devices.uptime',               label: 'Device Uptime (sec)',   type: 'number' },
  { key: 'processors.processor_usage',   label: 'CPU Usage (%)',         type: 'number' },
  { key: 'mempools.mempool_perc',        label: 'Memory Usage (%)',      type: 'number' },
  { key: 'ports.ifOperStatus',           label: 'Port Oper Status',      type: 'enum',   opts: [['up','Up'],['down','Down']] },
  { key: 'ports.ifAdminStatus',          label: 'Port Admin Status',     type: 'enum',   opts: [['up','Up'],['down','Down']] },
  { key: 'ports.ifDuplex',               label: 'Port Duplex',           type: 'enum',   opts: [['full','Full'],['half','Half'],['unknown','Unknown']] },
  { key: 'ports.ifSpeed',                label: 'Port Speed (bps)',      type: 'number' },
  { key: 'sensors.sensor_alert',         label: 'Sensor Alert',          type: 'enum',   opts: [['0','Normal'],['1','Alert']] },
  { key: 'sensors.sensor_current',       label: 'Sensor Value',          type: 'number' },
];
const NUM_OPS  = ['>','>=','<','<=','=','!='];
const ENUM_OPS = ['=','!='];

const defaultOp   = (fk) => FIELDS.find(f => f.key === fk)?.type === 'enum' ? '=' : '>';
const defaultVal  = (fk) => FIELDS.find(f => f.key === fk)?.opts?.[0]?.[0] ?? '';
const mkCond      = (fk = FIELDS[0].key) => ({ field: fk, op: defaultOp(fk), value: defaultVal(fk), connector: 'AND' });

const buildQuery = (conds) =>
  conds.filter(c => c.field && c.op && c.value !== '').map((c, i) => {
    const f   = FIELDS.find(x => x.key === c.field);
    const val = f?.type === 'enum' ? `"${c.value}"` : c.value;
    return (i === 0 ? '' : ` ${c.connector} `) + `${c.field} ${c.op} ${val}`;
  }).join('');

const parseQuery = (q) => {
  if (!q) return [mkCond()];
  const parts = q.split(/\s+(AND|OR)\s+/i);
  const conds = [];
  let connector = 'AND';
  parts.forEach(p => {
    if (p.toUpperCase() === 'AND' || p.toUpperCase() === 'OR') { connector = p.toUpperCase(); return; }
    const m = p.trim().match(/^(\S+)\s*(=|!=|>=|<=|>|<)\s*"?([^"]*)"?$/);
    if (m && FIELDS.find(f => f.key === m[1])) {
      conds.push({ field: m[1], op: m[2], value: m[3], connector });
      connector = 'AND';
    }
  });
  return conds.length ? conds : [mkCond()];
};

const EMPTY = { name: '', severity: 'warning', query: '', notes: '', disabled: false, invert_map: false, confirm_count: 1, delay_min: 0 };

const RuleModal = ({ initial, onSave, onClose, accent }) => {
  const isEdit = !!initial;
  const [form,        setForm]        = useState(initial ?? EMPTY);
  const [mode,        setMode]        = useState('visual');
  const [conds,       setConds]       = useState(() => parseQuery(initial?.query));
  const [showTpl,     setShowTpl]     = useState(!isEdit);
  const [saving,      setSaving]      = useState(false);
  const [testing,     setTesting]     = useState(false);
  const [testResult,  setTestResult]  = useState(null);
  const [err,         setErr]         = useState('');

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setTestResult(null); };

  // Keep form.query in sync with visual builder
  useEffect(() => {
    if (mode === 'visual') set('query', buildQuery(conds));
  }, [conds, mode]);

  const applyTemplate = (tpl) => {
    setForm(f => ({ ...f, name: f.name || tpl.name, severity: tpl.severity, query: tpl.query }));
    const parsed = parseQuery(tpl.query);
    setConds(parsed);
    setMode(parsed.length > 0 ? 'visual' : 'advanced');
    setShowTpl(false);
    setTestResult(null);
  };

  const switchMode = (next) => {
    if (next === 'advanced') {
      setMode('advanced');
    } else {
      setConds(parseQuery(form.query));
      setMode('visual');
    }
    setTestResult(null);
  };

  const updateCond = (i, patch) => {
    setConds(cs => cs.map((c, idx) => {
      if (idx !== i) return c;
      const next = { ...c, ...patch };
      if (patch.field) {
        next.op    = defaultOp(patch.field);
        next.value = defaultVal(patch.field);
      }
      return next;
    }));
  };

  const handleTest = async () => {
    const q = form.query.trim();
    if (!q) { setErr('Query is required.'); return; }
    setTesting(true); setTestResult(null); setErr('');
    try { setTestResult(await testAlertRule(q)); }
    catch (e) { setTestResult({ status: 'error', message: e.response?.data?.message ?? 'Test failed.' }); }
    finally { setTesting(false); }
  };

  const submit = async () => {
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    if (!form.query.trim()) { setErr('Query is required.'); return; }
    setSaving(true); setErr('');
    try { await onSave(form); onClose(); }
    catch (e) {
      setErr(e.response?.data?.message
        ?? (e.response?.data?.errors ? Object.values(e.response.data.errors).flat().join(' ') : 'Save failed.'));
    } finally { setSaving(false); }
  };

  const selStyle = { padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb',
    fontSize: 12, outline: 'none', fontFamily: 'inherit', color: '#111827', background: '#fff' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)' }}>
      <div style={{ width: 560, background: '#fff', borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8ecf0',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Icon name="alerts" size={15} color={accent} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', flex: 1 }}>
            {isEdit ? 'Edit Rule' : 'New Alert Rule'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
            <Icon name="xCircle" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 7, fontSize: 12, color: '#dc2626' }}>{err}</div>}

          {/* ── Templates ── */}
          {!isEdit && (
            <div style={{ border: '1px solid #e8ecf0', borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => setShowTpl(v => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 14px', background: showTpl ? '#f8fafc' : '#fff', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                  📋 Quick Templates
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{showTpl ? '▲ hide' : '▼ show'}</span>
              </button>
              {showTpl && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '10px 12px',
                  borderTop: '1px solid #f0f2f5', background: '#fafafa' }}>
                  {TEMPLATES.map(tpl => (
                    <button key={tpl.label} onClick={() => applyTemplate(tpl)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                        padding: '8px 6px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff',
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: '#374151',
                        transition: 'border-color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = accent}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}>
                      <span style={{ fontSize: 18 }}>{tpl.icon}</span>
                      <span style={{ fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{tpl.label}</span>
                      <span style={{ fontSize: 10, color: tpl.severity === 'critical' ? '#ef4444' : '#f59e0b',
                        fontWeight: 700, textTransform: 'uppercase' }}>{tpl.severity}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Name + Severity ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
            <div>
              <label style={S.label}>Rule Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={S.input} value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. CPU High" />
            </div>
            <div>
              <label style={S.label}>Severity <span style={{ color: '#ef4444' }}>*</span></label>
              <select style={S.select} value={form.severity} onChange={e => set('severity', e.target.value)}>
                <option value="ok">OK</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* ── Query section ── */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            {/* Mode tabs */}
            <div style={{ display: 'flex', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {[['visual','🔧 Visual Builder'],['advanced','⚡ Advanced (SQL)']].map(([m, label]) => (
                <button key={m} onClick={() => switchMode(m)}
                  style={{ flex: 1, padding: '8px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 11, fontWeight: 700, background: mode === m ? '#fff' : 'transparent',
                    color: mode === m ? accent : '#6b7280',
                    borderBottom: mode === m ? `2px solid ${accent}` : '2px solid transparent' }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ padding: 12 }}>
              {mode === 'visual' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {conds.map((c, i) => {
                    const field = FIELDS.find(f => f.key === c.field);
                    const ops   = field?.type === 'enum' ? ENUM_OPS : NUM_OPS;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {i > 0 && (
                          <select value={c.connector} onChange={e => updateCond(i, { connector: e.target.value })}
                            style={{ ...selStyle, width: 60 }}>
                            <option value="AND">AND</option>
                            <option value="OR">OR</option>
                          </select>
                        )}
                        {i === 0 && <div style={{ width: 60, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>IF</div>}

                        <select value={c.field} onChange={e => updateCond(i, { field: e.target.value })}
                          style={{ ...selStyle, flex: 2 }}>
                          {FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>

                        <select value={c.op} onChange={e => updateCond(i, { op: e.target.value })}
                          style={{ ...selStyle, width: 56 }}>
                          {ops.map(op => <option key={op} value={op}>{op}</option>)}
                        </select>

                        {field?.type === 'enum' ? (
                          <select value={c.value} onChange={e => updateCond(i, { value: e.target.value })}
                            style={{ ...selStyle, flex: 1 }}>
                            {field.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        ) : (
                          <input type="number" value={c.value} onChange={e => updateCond(i, { value: e.target.value })}
                            style={{ ...selStyle, flex: 1 }} placeholder="value" />
                        )}

                        <button onClick={() => setConds(cs => cs.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db',
                            fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                          title="Remove">×</button>
                      </div>
                    );
                  })}
                  <button onClick={() => setConds(cs => [...cs, mkCond()])}
                    style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 6,
                      border: `1px dashed ${accent}`, background: 'transparent', color: accent,
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Add condition
                  </button>
                  {form.query && (
                    <div style={{ background: '#f9fafb', borderRadius: 6, padding: '6px 10px',
                      fontSize: 11, color: '#6b7280', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {form.query}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <textarea style={{ ...S.input, height: 80, resize: 'vertical', fontFamily: 'monospace',
                    fontSize: 12, marginBottom: 4 }}
                    value={form.query} onChange={e => set('query', e.target.value)}
                    placeholder="e.g. processors.processor_usage > 80" />
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    SQL condition — tables: devices, processors, mempools, ports, sensors
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Test Result ── */}
          {testResult && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, fontSize: 12,
              background: testResult.status === 'error' ? '#fef2f2' : testResult.count === 0 ? '#fffbeb' : '#f0fdf4',
              border: `1px solid ${testResult.status === 'error' ? '#fecaca' : testResult.count === 0 ? '#fde68a' : '#bbf7d0'}`,
              color: testResult.status === 'error' ? '#dc2626' : testResult.count === 0 ? '#92400e' : '#15803d',
            }}>
              {testResult.status === 'error' ? (
                <><strong>✗ Query error:</strong> {testResult.message}</>
              ) : testResult.count === 0 ? (
                <><strong>⚠ 0 matches</strong> — rule will never fire with current data</>
              ) : (
                <>
                  <strong>✓ {testResult.count} device{testResult.count !== 1 ? 's' : ''} match</strong>
                  {testResult.devices?.length > 0 && (
                    <span style={{ marginLeft: 8, color: '#166534' }}>
                      {testResult.devices.slice(0, 5).join(', ')}
                      {testResult.count > 5 ? ` +${testResult.count - 5} more` : ''}
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Notes ── */}
          <div>
            <label style={S.label}>Notes</label>
            <textarea style={{ ...S.input, height: 52, resize: 'vertical' }}
              value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Optional description or runbook link" />
          </div>

          {/* ── Smart Alert Thresholds ── */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 10,
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>Smart Alert Thresholds</div>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Confirm Count <span style={{ fontWeight: 400, color: '#9ca3af' }}>(1–10)</span></label>
                <input type="number" min={1} max={10} style={{ ...S.input, width: '100%' }}
                  value={form.confirm_count ?? 1}
                  onChange={e => set('confirm_count', Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} />
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>Consecutive positive polls before firing</div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Delay <span style={{ fontWeight: 400, color: '#9ca3af' }}>(minutes)</span></label>
                <input type="number" min={0} max={1440} style={{ ...S.input, width: '100%' }}
                  value={form.delay_min ?? 0}
                  onChange={e => set('delay_min', Math.max(0, parseInt(e.target.value) || 0))} />
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>Wait N min since first detection</div>
              </div>
            </div>
          </div>

          {/* ── Options ── */}
          <div style={{ display: 'flex', gap: 24 }}>
            {[['disabled','Start disabled'],['invert_map','Invert device map']].map(([k, label]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)}
                  style={{ width: 14, height: 14, cursor: 'pointer' }} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e8ecf0', flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={handleTest} disabled={testing || !form.query}
            style={{ ...S.ghost, opacity: (!form.query || testing) ? 0.5 : 1 }}>
            {testing ? '⏳ Testing…' : '🧪 Test Rule'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={S.ghost}>Cancel</button>
            <button onClick={submit} disabled={saving}
              style={{ ...S.btn(accent), opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Rule')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Delete Confirm ────────────────────────────────────────────────
const DeleteConfirm = ({ rule, onConfirm, onClose }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex',
    alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)' }}>
    <div style={{ width: 380, background: '#fff', borderRadius: 12,
      boxShadow: '0 20px 60px rgba(0,0,0,.18)', padding: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Delete Rule?</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 1.6 }}>
        <strong style={{ color: '#111827' }}>{rule.name}</strong> will be permanently deleted.
        All associated alerts and alert log entries will also be removed.
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onClose} style={S.ghost}>Cancel</button>
        <button onClick={onConfirm} style={S.btn('#ef4444')}>
          <Icon name="xCircle" size={12} color="#fff" /> Delete
        </button>
      </div>
    </div>
  </div>
);

const PAGE_SIZE = 25;

// ─── Pagination Bar ────────────────────────────────────────────────
const Pagination = ({ page, totalPages, onChange, accent }) => {
  if (totalPages <= 1) return null;

  const pages = [];
  const delta = 2;
  const left  = Math.max(1, page - delta);
  const right = Math.min(totalPages, page + delta);

  if (left > 1) { pages.push(1); if (left > 2) pages.push('…'); }
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages) { if (right < totalPages - 1) pages.push('…'); pages.push(totalPages); }

  const btn = (label, target, active = false, disabled = false) => (
    <button key={label} onClick={() => !disabled && target && onChange(target)}
      disabled={disabled}
      style={{
        minWidth: 32, height: 32, padding: '0 8px', borderRadius: 7,
        border: `1px solid ${active ? accent : '#e5e7eb'}`,
        background: active ? accent : disabled ? '#f9fafb' : '#fff',
        color: active ? '#fff' : disabled ? '#d1d5db' : '#374151',
        fontSize: 12, fontWeight: active ? 700 : 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
      }}>{label}</button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {btn('←', page - 1, false, page === 1)}
      {pages.map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} style={{ padding: '0 4px', color: '#9ca3af', fontSize: 12 }}>…</span>
          : btn(p, p, p === page)
      )}
      {btn('→', page + 1, false, page === totalPages)}
    </div>
  );
};

// ─── Main Page ─────────────────────────────────────────────────────
const AlertRulesPage = ({ accent = '#22c55e' }) => {
  const [allRules, setAllRules] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);

  const [search,     setSearch]     = useState('');
  const [sevFilter,  setSevFilter]  = useState('');
  const [showFilter, setShowFilter] = useState('all');

  const [detailId,      setDetailId]      = useState(null);
  const [editRule,      setEditRule]      = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getAlertRulesV2({ limit: 500 });
      setAllRules(d.data ?? []);
    } catch { setAllRules([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [search, sevFilter, showFilter]);

  // ── Filter ──────────────────────────────────────────────────────
  const filtered = allRules.filter(r => {
    if (sevFilter && r.severity !== sevFilter) return false;
    if (showFilter === 'enabled'  &&  r.disabled) return false;
    if (showFilter === 'disabled' && !r.disabled) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.name?.toLowerCase().includes(q) && !r.notes?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Handlers ────────────────────────────────────────────────────
  const handleToggle = async (rule) => {
    try {
      const res = await toggleAlertRuleV2(rule.id);
      setAllRules(rs => rs.map(r => r.id === rule.id ? { ...r, disabled: res.disabled } : r));
    } catch {}
  };

  const handleCreate = async (form) => {
    const res = await createAlertRuleV1(form);
    setAllRules(rs => [res.rule, ...rs]);
    setPage(1);
  };

  const handleUpdate = async (form) => {
    const res = await updateAlertRuleV2(editRule.id, form);
    setAllRules(rs => rs.map(r => r.id === editRule.id ? res.rule : r));
  };

  const handleDelete = async () => {
    await deleteAlertRuleV2(deleteTarget.id);
    setAllRules(rs => rs.filter(r => r.id !== deleteTarget.id));
    setDeleteTarget(null);
    if (paginated.length === 1 && page > 1) setPage(p => p - 1);
  };

  const total    = allRules.length;
  const enabled  = allRules.filter(r => !r.disabled).length;
  const disabled = allRules.filter(r =>  r.disabled).length;
  const critical = allRules.filter(r => r.severity === 'critical').length;

  const from = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to   = Math.min(page * PAGE_SIZE, filtered.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader title="Alert Rules" desc="Define and manage conditions that trigger alerts." />

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Rules', value: total,    color: '#6366f1' },
          { label: 'Enabled',     value: enabled,  color: '#22c55e' },
          { label: 'Disabled',    value: disabled, color: '#9ca3af' },
          { label: 'Critical',    value: critical, color: '#ef4444' },
        ].map(c => (
          <div key={c.label} style={{ ...S.card, padding: '14px 20px', minWidth: 120, flex: 1 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff',
          border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 10px', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Icon name="search" size={13} color="#9ca3af" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, notes…"
            style={{ border: 'none', outline: 'none', fontSize: 12, color: '#374151',
              fontFamily: 'inherit', background: 'transparent', width: '100%' }} />
        </div>

        <select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb',
            fontSize: 12, color: '#374151', background: '#fff', fontFamily: 'inherit', cursor: 'pointer' }}>
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="ok">OK</option>
        </select>

        {['all', 'enabled', 'disabled'].map(v => (
          <button key={v} onClick={() => setShowFilter(v)} style={{
            padding: '5px 13px', borderRadius: 7,
            border: `1px solid ${showFilter === v ? accent : '#e5e7eb'}`,
            background: showFilter === v ? accent : '#fff',
            color: showFilter === v ? '#fff' : '#374151',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            textTransform: 'capitalize',
          }}>{v}</button>
        ))}

        <div style={{ flex: 1 }} />

        <button onClick={() => setEditRule(false)} style={S.btn(accent)}>
          <Icon name="checkCircle" size={12} color="#fff" /> New Rule
        </button>
      </div>

      {/* Table */}
      <div style={S.card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'Severity', 'Query', 'Notes', 'Enabled', 'Actions'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#9ca3af', padding: 40 }}>
                Loading…
              </td></tr>
            )}
            {!loading && paginated.length === 0 && (
              <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#9ca3af', padding: 40 }}>
                No rules found.
              </td></tr>
            )}
            {!loading && paginated.map((rule, i) => (
              <tr key={rule.id} style={{ borderTop: '1px solid #f0f2f5',
                background: i % 2 === 0 ? '#fff' : '#fafafa',
                opacity: rule.disabled ? 0.6 : 1 }}>
                <td style={S.td}>
                  <button onClick={() => setDetailId(rule.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#111827',
                      textAlign: 'left', textDecoration: 'underline', textDecorationColor: '#e5e7eb' }}>
                    {rule.name}
                  </button>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>#{rule.id}</div>
                </td>
                <td style={S.td}><SevBadge sev={rule.severity} /></td>
                <td style={{ ...S.td, maxWidth: 240 }}>
                  <code style={{ fontSize: 11, color: '#374151', background: '#f9fafb',
                    padding: '2px 6px', borderRadius: 4, display: 'block',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rule.query}
                  </code>
                </td>
                <td style={{ ...S.td, maxWidth: 200, color: '#6b7280', fontSize: 12,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rule.notes || '—'}
                </td>
                <td style={S.td}>
                  <Toggle checked={!rule.disabled} onChange={() => handleToggle(rule)} />
                </td>
                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setEditRule(rule)} style={S.ghost} title="Edit">
                      <Icon name="settings" size={12} />
                    </button>
                    <button onClick={() => setDeleteTarget(rule)}
                      style={{ ...S.ghost, color: '#ef4444', borderColor: '#fecaca' }} title="Delete">
                      <Icon name="xCircle" size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination footer */}
        {!loading && filtered.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f2f5',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              {from}–{to} / {filtered.length} rule{filtered.length !== 1 ? 's' : ''}
              {filtered.length !== total && <span style={{ color: '#6366f1', marginLeft: 6 }}>(filtered from {total})</span>}
            </span>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} accent={accent} />
          </div>
        )}
      </div>

      {/* Modals */}
      {detailId && (
        <DetailPanel id={detailId} onClose={() => setDetailId(null)} accent={accent} />
      )}

      {editRule !== null && (
        <RuleModal
          initial={editRule || null}
          onSave={editRule ? handleUpdate : handleCreate}
          onClose={() => setEditRule(null)}
          accent={accent}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          rule={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default AlertRulesPage;
