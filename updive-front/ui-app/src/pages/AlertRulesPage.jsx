import { useState, useEffect, useCallback } from 'react';
import { Icon, PageHeader } from '../components/Charts';
import {
  getAlertRulesV2, getAlertRuleV2,
  updateAlertRuleV2, deleteAlertRuleV2, toggleAlertRuleV2,
  createAlertRuleV1,
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

// ─── Rule Form Modal ───────────────────────────────────────────────
const EMPTY = { name: '', severity: 'warning', query: '', notes: '', disabled: false, invert_map: false };

const RuleModal = ({ initial, onSave, onClose, accent }) => {
  const [form, setForm] = useState(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    if (!form.query.trim()) { setErr('Query is required.'); return; }
    setSaving(true); setErr('');
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      const msg = e.response?.data?.message ?? e.response?.data?.errors
        ? Object.values(e.response.data.errors).flat().join(' ')
        : 'Save failed.';
      setErr(msg);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)' }}>
      <div style={{ width: 520, background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.18)',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8ecf0',
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="alerts" size={15} color={accent} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', flex: 1 }}>
            {initial ? 'Edit Rule' : 'New Alert Rule'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
            <Icon name="xCircle" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && (
            <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 7, fontSize: 12, color: '#dc2626' }}>{err}</div>
          )}

          <div>
            <label style={S.label}>Rule Name <span style={{ color: '#ef4444' }}>*</span></label>
            <input style={S.input} value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="e.g. CPU > 90%" />
          </div>

          <div>
            <label style={S.label}>Severity <span style={{ color: '#ef4444' }}>*</span></label>
            <select style={S.select} value={form.severity} onChange={e => set('severity', e.target.value)}>
              <option value="ok">OK</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label style={S.label}>Query <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea style={{ ...S.input, height: 90, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
              value={form.query} onChange={e => set('query', e.target.value)}
              placeholder="e.g. devices.status = 0" />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              SQL condition expression on LibreNMS tables.
            </div>
          </div>

          <div>
            <label style={S.label}>Notes</label>
            <textarea style={{ ...S.input, height: 60, resize: 'vertical' }}
              value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Optional description or runbook link" />
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              <input type="checkbox" checked={form.disabled} onChange={e => set('disabled', e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer' }} />
              Start disabled
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              <input type="checkbox" checked={form.invert_map} onChange={e => set('invert_map', e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer' }} />
              Invert device map
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e8ecf0',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={S.ghost}>Cancel</button>
          <button onClick={submit} disabled={saving}
            style={{ ...S.btn(accent), opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : (initial ? 'Save Changes' : 'Create Rule')}
          </button>
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

// ─── Main Page ─────────────────────────────────────────────────────
const AlertRulesPage = ({ accent = '#22c55e' }) => {
  const [rules, setRules]       = useState([]);
  const [cursor, setCursor]     = useState(null);
  const [hasMore, setHasMore]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch]     = useState('');
  const [sevFilter, setSevFilter] = useState('');
  const [showFilter, setShowFilter] = useState('all'); // all | enabled | disabled

  const [detailId, setDetailId] = useState(null);
  const [editRule, setEditRule] = useState(null);   // null | false | rule object
  const [deleteTarget, setDeleteTarget] = useState(null);

  const buildParams = useCallback((cur = null) => {
    const p = { limit: 25 };
    if (search)  p.search   = search;
    if (sevFilter) p.severity = sevFilter;
    if (showFilter === 'enabled')  p.disabled = 0;
    if (showFilter === 'disabled') p.disabled = 1;
    if (cur) p.cursor = cur;
    return p;
  }, [search, sevFilter, showFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getAlertRulesV2(buildParams());
      setRules(d.data ?? []);
      setCursor(d.meta?.next_cursor ?? null);
      setHasMore(!!(d.meta?.next_cursor));
    } catch { setRules([]); }
    finally  { setLoading(false); }
  }, [buildParams]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await getAlertRulesV2(buildParams(cursor));
      setRules(r => [...r, ...(d.data ?? [])]);
      setCursor(d.meta?.next_cursor ?? null);
      setHasMore(!!(d.meta?.next_cursor));
    } finally { setLoadingMore(false); }
  };

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (rule) => {
    try {
      const res = await toggleAlertRuleV2(rule.id);
      setRules(rs => rs.map(r => r.id === rule.id ? { ...r, disabled: res.disabled } : r));
    } catch {}
  };

  const handleCreate = async (form) => {
    const res = await createAlertRuleV1(form);
    setRules(rs => [res.rule, ...rs]);
  };

  const handleUpdate = async (form) => {
    const res = await updateAlertRuleV2(editRule.id, form);
    setRules(rs => rs.map(r => r.id === editRule.id ? res.rule : r));
  };

  const handleDelete = async () => {
    await deleteAlertRuleV2(deleteTarget.id);
    setRules(rs => rs.filter(r => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const total    = rules.length;
  const enabled  = rules.filter(r => !r.disabled).length;
  const disabled = rules.filter(r =>  r.disabled).length;
  const critical = rules.filter(r => r.severity === 'critical').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader title="Alert Rules" desc="Define and manage conditions that trigger alerts." />

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Rules',  value: total,    color: '#6366f1' },
          { label: 'Enabled',      value: enabled,  color: '#22c55e' },
          { label: 'Disabled',     value: disabled, color: '#9ca3af' },
          { label: 'Critical',     value: critical, color: '#ef4444' },
        ].map(c => (
          <div key={c.label} style={{ ...S.card, padding: '14px 20px', minWidth: 120, flex: 1 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff',
          border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 10px', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Icon name="search" size={13} color="#9ca3af" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, notes…"
            style={{ border: 'none', outline: 'none', fontSize: 12, color: '#374151',
              fontFamily: 'inherit', background: 'transparent', width: '100%' }} />
        </div>

        {/* Severity filter */}
        <select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb',
            fontSize: 12, color: '#374151', background: '#fff', fontFamily: 'inherit', cursor: 'pointer' }}>
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="ok">OK</option>
        </select>

        {/* Enabled/disabled tabs */}
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
            {!loading && rules.length === 0 && (
              <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#9ca3af', padding: 40 }}>
                No rules found.
              </td></tr>
            )}
            {!loading && rules.map((rule, i) => (
              <tr key={rule.id} style={{ borderTop: '1px solid #f0f2f5',
                background: i % 2 === 0 ? '#fff' : '#fafafa',
                opacity: rule.disabled ? 0.6 : 1 }}>
                {/* Name */}
                <td style={S.td}>
                  <button onClick={() => setDetailId(rule.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#111827',
                      textAlign: 'left', textDecoration: 'underline', textDecorationColor: '#e5e7eb' }}>
                    {rule.name}
                  </button>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>#{rule.id}</div>
                </td>
                {/* Severity */}
                <td style={S.td}><SevBadge sev={rule.severity} /></td>
                {/* Query preview */}
                <td style={{ ...S.td, maxWidth: 240 }}>
                  <code style={{ fontSize: 11, color: '#374151', background: '#f9fafb',
                    padding: '2px 6px', borderRadius: 4, display: 'block',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rule.query}
                  </code>
                </td>
                {/* Notes */}
                <td style={{ ...S.td, maxWidth: 200, color: '#6b7280', fontSize: 12,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rule.notes || '—'}
                </td>
                {/* Toggle */}
                <td style={S.td}>
                  <Toggle checked={!rule.disabled} onChange={() => handleToggle(rule)} />
                </td>
                {/* Actions */}
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

        {hasMore && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f2f5', textAlign: 'center' }}>
            <button onClick={loadMore} disabled={loadingMore} style={S.ghost}>
              {loadingMore ? 'Loading…' : 'Load More'}
            </button>
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
