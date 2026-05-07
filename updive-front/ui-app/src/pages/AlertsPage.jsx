import { useState, useEffect, useRef, useCallback } from 'react';
import { StatCard, Badge, Icon, PageHeader } from '../components/Charts';
import {
  getAlertsV2, getAlertStatsV2, getAlertDetailV2, getAlertsGrouped,
  ackAlertV2, unackAlertV2, muteAlertV2, unmuteAlertV2,
  bulkAckV2, bulkUnackV2, bulkMuteV2, getAlertLogV2,
} from '../api';

// ─── Design tokens (local) ──────────────────────────────────────────
const SEV_COLOR  = { critical: '#ef4444', warning: '#f59e0b', ok: '#22c55e', unknown: '#9ca3af' };
const STATE_COLOR = { active: '#ef4444', worse: '#dc2626', changed: '#f97316', acknowledged: '#3b82f6', better: '#22c55e', clear: '#9ca3af' };
const S = {
  card:  { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' },
  th:    { padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#6b7280', textAlign: 'left', background: '#f9fafb', borderBottom: '1px solid #e8ecf0', whiteSpace: 'nowrap' },
  td:    { padding: '9px 14px', fontSize: 12, color: '#374151', verticalAlign: 'middle' },
  btn:   (bg, color = '#fff') => ({ padding: '3px 10px', borderRadius: 6, border: 'none', background: bg, color, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }),
  ghost: { padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  tab:   (active, accent) => ({ padding: '5px 13px', borderRadius: 6, border: `1px solid ${active ? accent : '#e5e7eb'}`, background: active ? accent : '#fff', color: active ? '#fff' : '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }),
  input: { padding: '5px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, outline: 'none', fontFamily: 'inherit', width: 200, color: '#111827' },
  panel: { position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, background: '#fff', borderLeft: '1px solid #e8ecf0', zIndex: 200, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,.08)' },
};

const STATES = ['all', 'active', 'worse', 'acknowledged'];

// ─── Tiny helpers ──────────────────────────────────────────────────
const StatePill = ({ state }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, background: (STATE_COLOR[state] || '#9ca3af') + '20', color: STATE_COLOR[state] || '#9ca3af', fontSize: 10, fontWeight: 700 }}>
    {state}
  </span>
);

const SevDot = ({ sev }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: SEV_COLOR[sev] || '#9ca3af' }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[sev] || '#9ca3af', display: 'inline-block' }} />
    {sev}
  </span>
);

const Spinner = () => (
  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #e5e7eb', borderTopColor: '#6b7280', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
);

// ─── Component renderer (detail panel) ────────────────────────────
const ComponentBlock = ({ component }) => {
  if (!component || component.type === 'device') return null;
  const { type, data, context } = component;

  const Row = ({ label, val }) => val != null ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f3f4f6', fontSize: 11 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 600 }}>{String(val)}</span>
    </div>
  ) : null;

  const rows = {
    port:      [['Interface', data?.ifName],    ['Alias', data?.ifAlias],       ['Status', data?.ifOperStatus], ['Speed', data?.ifSpeed ? `${Math.round(data.ifSpeed / 1e6)} Mbps` : null], ['In rate', data?.ifInOctets_rate != null ? `${(data.ifInOctets_rate / 1e6).toFixed(2)} Mbps` : null], ['Out rate', data?.ifOutOctets_rate != null ? `${(data.ifOutOctets_rate / 1e6).toFixed(2)} Mbps` : null]],
    sensor:    [['Class', data?.sensor_class],  ['Description', data?.sensor_descr], ['Current', data?.sensor_current], ['Limit', data?.sensor_limit], ['Warn limit', data?.sensor_limit_warn]],
    bgp:       [['Peer IP', data?.bgpPeerIdentifier], ['State', data?.bgpPeerState], ['Remote AS', data?.bgpPeerRemoteAs], ['ASN', data?.astext], ['Description', data?.bgpPeerDescr]],
    processor: [['Usage', context?.processor_usage != null ? `${context.processor_usage}%` : null]],
    mempool:   [['Used', context?.mempool_perc != null ? `${context.mempool_perc}%` : null], ['Description', context?.mempool_descr]],
    storage:   [['Used', context?.storage_perc != null ? `${context.storage_perc}%` : null], ['Description', context?.storage_descr]],
    service:   [['Name', context?.service_name], ['Status', context?.service_status]],
    process:   [['Process', data?.proc]],
  }[type] || [];

  return (
    <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px', marginTop: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
        {type} component
      </div>
      {rows.map(([label, val]) => <Row key={label} label={label} val={val} />)}
    </div>
  );
};

// ─── Graph image strip ─────────────────────────────────────────────
const GraphStrip = ({ graphs }) => {
  if (!graphs?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {graphs.slice(0, 4).map((g, i) => (
        <div key={i} style={{ background: '#f9fafb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, color: '#6b7280' }}>{g.label}</div>
          <img
            src={g.url}
            alt={g.label}
            style={{ width: '100%', display: 'block', maxHeight: 110, objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
          />
          <div style={{ display: 'none', alignItems: 'center', justifyContent: 'center', padding: 12, fontSize: 10, color: '#9ca3af' }}>No graph data</div>
        </div>
      ))}
    </div>
  );
};

// ─── Detail slide-over panel ───────────────────────────────────────
const DetailPanel = ({ id, accent, onClose, onAction }) => {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');

  useEffect(() => {
    setLoading(true);
    setData(null);
    getAlertDetailV2(id)
      .then(d => setData(d.alert))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const act = async (fn, label) => {
    setActing(label);
    try { await fn(); onAction(); const d = await getAlertDetailV2(id); setData(d.alert); }
    catch (e) { console.error(e); }
    finally { setActing(''); }
  };

  const a = data;

  return (
    <div style={S.panel}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Alert Detail</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>ID #{id}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
          <Icon name="x" size={18} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}><Spinner /></div>}

        {a && (
          <>
            {/* Identity */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{a.hostname}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{a.rule_name}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StatePill state={a.state} />
                <SevDot sev={a.severity} />
                {a.muted && <span style={{ padding: '2px 8px', borderRadius: 10, background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700 }}>MUTED</span>}
                {a.until_clear && <span style={{ padding: '2px 8px', borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', fontSize: 10, fontWeight: 700 }}>UNTIL CLEAR</span>}
              </div>
            </div>

            {/* Meta */}
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              <div>Device ID: {a.device_id} · Rule ID: {a.rule_id}</div>
              <div style={{ marginTop: 2 }}>Triggered: {a.timestamp}</div>
              {a.muted_until && <div style={{ marginTop: 2 }}>Muted until: {a.muted_until}</div>}
            </div>

            {/* Note */}
            {a.note && (
              <div style={{ background: '#fefce8', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#713f12', borderLeft: '3px solid #fbbf24' }}>
                {a.note}
              </div>
            )}

            {/* Component */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Component</div>
              <ComponentBlock component={a.component} />
              {(!a.component || a.component.type === 'device') && (
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Device-level alert</div>
              )}
            </div>

            {/* Graphs */}
            {a.graphs?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Graphs</div>
                <GraphStrip graphs={a.graphs} />
              </div>
            )}

            {/* Severity trend */}
            {a.trend?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Severity Trend</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {a.trend.slice(0, 6).map((t, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '3px 0' }}>
                      <StatePill state={t.state} />
                      <span style={{ color: '#9ca3af' }}>{t.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related alerts */}
            {a.related?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Related ({a.related.length})</div>
                {a.related.slice(0, 5).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#f9fafb', borderRadius: 6, marginBottom: 4, fontSize: 11 }}>
                    <span style={{ color: '#374151' }}>{r.hostname} — {r.rule_name}</span>
                    <span style={{ fontSize: 9, color: '#9ca3af', background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>{r.relation?.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            )}

            {/* History */}
            {a.history?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>History (last {a.history.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {a.history.slice(0, 8).map((h, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <StatePill state={typeof h.state === 'object' ? h.state.name : h.state} />
                      <span style={{ color: '#9ca3af' }}>{h.time_logged}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      {a && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid #f0f2f5', display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {a.state !== 'acknowledged' && (
            <button disabled={!!acting} onClick={() => act(() => ackAlertV2(id), 'ack')} style={S.btn(accent)}>
              {acting === 'ack' ? <Spinner /> : '✓ Ack'}
            </button>
          )}
          {a.state === 'acknowledged' && (
            <button disabled={!!acting} onClick={() => act(() => unackAlertV2(id), 'unack')} style={S.btn('#6b7280')}>
              {acting === 'unack' ? <Spinner /> : '↩ Unack'}
            </button>
          )}
          {!a.muted ? (
            <button disabled={!!acting} onClick={() => act(() => muteAlertV2(id), 'mute')} style={S.btn('#f59e0b')}>
              {acting === 'mute' ? <Spinner /> : '🔇 Mute'}
            </button>
          ) : (
            <button disabled={!!acting} onClick={() => act(() => unmuteAlertV2(id), 'unmute')} style={S.btn('#22c55e')}>
              {acting === 'unmute' ? <Spinner /> : '🔔 Unmute'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Bulk action bar ───────────────────────────────────────────────
const BulkBar = ({ selected, onAck, onUnack, onMute, onClear, loading }) => (
  <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1f2937', borderRadius: 12, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}>
    <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{selected} selected</span>
    <div style={{ width: 1, height: 20, background: '#374151' }} />
    <button disabled={loading} onClick={onAck}   style={S.btn('#22c55e')}>✓ Ack all</button>
    <button disabled={loading} onClick={onUnack} style={S.btn('#6b7280')}>↩ Unack all</button>
    <button disabled={loading} onClick={onMute}  style={S.btn('#f59e0b')}>🔇 Mute all</button>
    <button disabled={loading} onClick={onClear} style={{ ...S.ghost, color: '#9ca3af', borderColor: '#374151' }}>✕</button>
  </div>
);

// ─── Grouped view ──────────────────────────────────────────────────
const GroupedView = ({ accent, stateFilter }) => {
  const [by, setBy]       = useState('device');
  const [data, setData]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAlertsGrouped(by, stateFilter === 'all' ? 'all' : 'active')
      .then(d => setData(d.groups || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [by, stateFilter]);

  const byOptions = ['device', 'rule', 'severity'];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {byOptions.map(o => (
          <button key={o} onClick={() => setBy(o)} style={S.tab(by === o, accent)}>by {o}</button>
        ))}
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}><Spinner /></div>
        ) : data.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No active alerts</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {by === 'device'   && ['Device', 'Total', 'Critical', 'Warning', 'Acked', 'Worse'].map(h => <th key={h} style={S.th}>{h}</th>)}
                {by === 'rule'     && ['Rule', 'Severity', 'Total', 'Active', 'Acked', 'Worse'].map(h => <th key={h} style={S.th}>{h}</th>)}
                {by === 'severity' && ['Severity', 'Total', 'Active', 'Acked'].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  {by === 'device' && <>
                    <td style={S.td}><span style={{ fontWeight: 700, color: '#111827' }}>{row.hostname}</span><br/><span style={{ color: '#9ca3af', fontSize: 10 }}>{row.sysName}</span></td>
                    <td style={S.td}><strong>{row.total}</strong></td>
                    <td style={S.td}><span style={{ color: '#ef4444', fontWeight: 700 }}>{row.critical || 0}</span></td>
                    <td style={S.td}><span style={{ color: '#f59e0b', fontWeight: 700 }}>{row.warning || 0}</span></td>
                    <td style={S.td}><span style={{ color: '#3b82f6' }}>{row.acknowledged || 0}</span></td>
                    <td style={S.td}>{row.worse || 0}</td>
                  </>}
                  {by === 'rule' && <>
                    <td style={S.td}><strong>{row.rule_name}</strong></td>
                    <td style={S.td}><SevDot sev={row.severity} /></td>
                    <td style={S.td}><strong>{row.total}</strong></td>
                    <td style={S.td}>{row.active || 0}</td>
                    <td style={S.td}><span style={{ color: '#3b82f6' }}>{row.acknowledged || 0}</span></td>
                    <td style={S.td}>{row.worse || 0}</td>
                  </>}
                  {by === 'severity' && <>
                    <td style={S.td}><SevDot sev={row.severity} /></td>
                    <td style={S.td}><strong>{row.total}</strong></td>
                    <td style={S.td}>{row.active || 0}</td>
                    <td style={S.td}><span style={{ color: '#3b82f6' }}>{row.acknowledged || 0}</span></td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── Alert Log view ────────────────────────────────────────────────
const LOG_STATE = { 0: { label: 'Clear', color: '#22c55e' }, 1: { label: 'Active', color: '#ef4444' }, 2: { label: 'Acknowledged', color: '#3b82f6' } };

const AlertLogView = ({ accent }) => {
  const [logs,      setLogs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [cursor,    setCursor]    = useState(null);
  const [hasMore,   setHasMore]   = useState(false);
  const [loadMore_,  setLoadMore_] = useState(false);
  const [hostname,  setHostname]  = useState('');
  const [stateFlt,  setStateFlt]  = useState('');
  const debRef = useRef(null);

  const load = useCallback(async (cur = null) => {
    if (!cur) setLoading(true); else setLoadMore_(true);
    try {
      const params = { limit: 50 };
      if (hostname)  params.hostname = hostname;
      if (stateFlt)  params.state    = stateFlt;
      if (cur)       params.cursor   = cur;
      const res = await getAlertLogV2(params);
      const rows = res.data || [];
      if (cur) setLogs(p => [...p, ...rows]); else setLogs(rows);
      setCursor(res.meta?.next_cursor || null);
      setHasMore(res.meta?.has_more || false);
    } catch { setLogs([]); }
    finally { setLoading(false); setLoadMore_(false); }
  }, [hostname, stateFlt]);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => load(), 400);
    return () => clearTimeout(debRef.current);
  }, [hostname, stateFlt]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Filter by hostname..."
          value={hostname}
          onChange={e => setHostname(e.target.value)}
          style={S.input}
        />
        <select value={stateFlt} onChange={e => setStateFlt(e.target.value)} style={{ ...S.input, width: 140 }}>
          <option value="">All states</option>
          <option value="1">Active</option>
          <option value="2">Acknowledged</option>
          <option value="0">Clear</option>
        </select>
        <button onClick={() => load()} style={S.btn(accent)}>Refresh</button>
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
            No alert log entries found
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Time', 'Device', 'Rule', 'Severity', 'State', 'Details'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const st = LOG_STATE[log.state] || { label: String(log.state), color: '#9ca3af' };
                return (
                  <tr key={log.id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ ...S.td, fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}>{log.time_logged}</td>
                    <td style={S.td}>
                      <div style={{ fontWeight: 700, color: '#111827', fontSize: 12 }}>{log.device?.hostname || '—'}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>{log.device?.sysName}</div>
                    </td>
                    <td style={{ ...S.td, maxWidth: 200 }}>
                      <span style={{ fontSize: 12, color: '#374151' }}>{log.rule?.name || '—'}</span>
                    </td>
                    <td style={S.td}><SevDot sev={log.rule?.severity} /></td>
                    <td style={S.td}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, background: st.color + '20', color: st.color, fontSize: 10, fontWeight: 700 }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ ...S.td, fontSize: 10, color: '#6b7280', maxWidth: 200, wordBreak: 'break-word' }}>
                      {log.details || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {hasMore && !loading && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => load(cursor)} disabled={loadMore_} style={{ ...S.btn(accent), padding: '8px 24px', fontSize: 12 }}>
            {loadMore_ ? <Spinner /> : 'Load More'}
          </button>
        </div>
      )}
      {!hasMore && logs.length > 0 && !loading && (
        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>{logs.length} entries shown</div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// Main AlertsPage
// ═══════════════════════════════════════════════════════════════════
export const AlertsPage = ({ accent }) => {
  const [alerts,      setAlerts]      = useState([]);
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor,      setCursor]      = useState(null);
  const [hasMore,     setHasMore]     = useState(false);

  // Filters
  const [stateFilter, setStateFilter]   = useState('active');
  const [sevFilter,   setSevFilter]     = useState('');
  const [search,      setSearch]        = useState('');
  const [view,        setView]          = useState('table'); // 'table' | 'grouped'

  // Selection
  const [selected,     setSelected]     = useState(new Set());
  const [bulkLoading,  setBulkLoading]  = useState(false);

  // Per-row action loading
  const [rowActing, setRowActing] = useState({}); // { [id]: 'ack'|'mute'|... }

  // Detail panel
  const [detailId, setDetailId] = useState(null);

  const searchDebounce = useRef(null);

  // ── Loaders ────────────────────────────────────────────────────
  const buildParams = useCallback((cursor = null) => {
    const p = { state: stateFilter, limit: 50 };
    if (sevFilter) p.severity = sevFilter;
    if (search)    p.search   = search;
    if (cursor)    p.cursor   = cursor;
    return p;
  }, [stateFilter, sevFilter, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const [alertData, statsData] = await Promise.all([
        getAlertsV2(buildParams()),
        getAlertStatsV2(7),
      ]);
      setAlerts(alertData.data || []);
      setCursor(alertData.meta?.next_cursor || null);
      setHasMore(alertData.meta?.has_more || false);
      setStats(statsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getAlertsV2(buildParams(cursor));
      setAlerts(prev => [...prev, ...(data.data || [])]);
      setCursor(data.meta?.next_cursor || null);
      setHasMore(data.meta?.has_more || false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Reload on filter change
  useEffect(() => { load(); }, [stateFilter, sevFilter]);

  // Debounce search
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(load, 400);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  // ── Per-row actions ────────────────────────────────────────────
  const rowAction = async (id, label, fn) => {
    setRowActing(p => ({ ...p, [id]: label }));
    try {
      await fn();
      // Refresh row in place
      const detail = await getAlertsV2({ state: 'all', limit: 1 });
      // Reload full list to reflect state change
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setRowActing(p => { const n = { ...p }; delete n[id]; return n; });
    }
  };

  // ── Bulk actions ───────────────────────────────────────────────
  const doBulk = async (fn) => {
    if (!selected.size) return;
    setBulkLoading(true);
    try {
      await fn([...selected]);
      setSelected(new Set());
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleSelect = (id) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(prev => prev.size === alerts.length ? new Set() : new Set(alerts.map(a => a.id)));

  // ── Stats derived ──────────────────────────────────────────────
  const s = stats;
  const activeCnt  = (s?.by_state?.active  || 0) + (s?.by_state?.worse || 0) + (s?.by_state?.changed || 0);
  const ackCnt     = s?.by_state?.acknowledged || 0;
  const critCnt    = s?.by_severity?.critical  || 0;
  const warnCnt    = s?.by_severity?.warning   || 0;

  // ══════════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: selected.size ? 80 : 0 }}>
      {/* CSS spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <PageHeader
        title="Alerts"
        desc="Real-time alert monitoring via API v2"
        action={
          <button onClick={load} style={S.btn(accent)}>
            <Icon name="refreshCw" size={12} color="#fff" /> Refresh
          </button>
        }
      />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard label="Active"       value={activeCnt} icon="alertTriangle" color="#ef4444" />
        <StatCard label="Critical"     value={critCnt}   icon="xCircle"       color="#dc2626" />
        <StatCard label="Warning"      value={warnCnt}   icon="alertCircle"   color="#f59e0b" />
        <StatCard label="Acknowledged" value={ackCnt}    icon="checkCircle"   color="#3b82f6" />
        <StatCard label="Total DB"     value={(s?.by_state ? Object.values(s.by_state).reduce((a, b) => a + b, 0) : 0)} icon="database" color="#6b7280" />
      </div>

      {/* Filter + view bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* State tabs */}
        {STATES.map(t => (
          <button key={t} onClick={() => { setStateFilter(t); setView('table'); }} style={S.tab(stateFilter === t && view === 'table', accent)}>
            {t}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />

        {/* Severity */}
        <select
          value={sevFilter}
          onChange={e => setSevFilter(e.target.value)}
          style={{ ...S.input, width: 120 }}
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="ok">OK</option>
        </select>

        {/* Search */}
        <input
          placeholder="Search device, rule, note..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={S.input}
        />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setView('table')}   style={S.tab(view === 'table',   accent)}>Table</button>
          <button onClick={() => setView('grouped')} style={S.tab(view === 'grouped', accent)}>Grouped</button>
          <button onClick={() => setView('log')}     style={S.tab(view === 'log',     accent)}>Log</button>
        </div>
      </div>

      {/* Grouped view */}
      {view === 'grouped' && <GroupedView accent={accent} stateFilter={stateFilter} />}

      {/* Alert Log view */}
      {view === 'log' && <AlertLogView accent={accent} />}

      {/* Table view */}
      {view === 'table' && (
        <>
          <div style={S.card}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}><Spinner /></div>
            ) : alerts.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                No alerts found for the selected filters.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 32 }}>
                      <input
                        type="checkbox"
                        checked={selected.size === alerts.length && alerts.length > 0}
                        onChange={toggleAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    {['Device', 'Rule', 'Severity', 'State', 'Muted', 'Timestamp', 'Actions'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a, i) => {
                    const acting = rowActing[a.id];
                    const isSelected = selected.has(a.id);
                    return (
                      <tr
                        key={a.id}
                        onClick={(e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') setDetailId(a.id); }}
                        style={{ borderTop: '1px solid #f0f2f5', background: isSelected ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                      >
                        {/* Checkbox */}
                        <td style={{ ...S.td, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(a.id)} style={{ cursor: 'pointer' }} />
                        </td>

                        {/* Device */}
                        <td style={S.td}>
                          <div style={{ fontWeight: 700, color: '#111827', fontSize: 12 }}>{a.hostname}</div>
                          <div style={{ color: '#9ca3af', fontSize: 10 }}>{a.sysName}</div>
                        </td>

                        {/* Rule */}
                        <td style={{ ...S.td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.rule_name}
                        </td>

                        {/* Severity */}
                        <td style={S.td}><SevDot sev={a.severity} /></td>

                        {/* State */}
                        <td style={S.td}><StatePill state={a.state} /></td>

                        {/* Muted */}
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          {a.muted && <span style={{ fontSize: 14 }} title={`Muted until: ${a.muted_until || 'indefinitely'}`}>🔇</span>}
                        </td>

                        {/* Timestamp */}
                        <td style={{ ...S.td, fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}>
                          {a.timestamp}
                        </td>

                        {/* Actions */}
                        <td style={S.td} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {acting ? (
                              <Spinner />
                            ) : a.state !== 'acknowledged' ? (
                              <button
                                onClick={() => rowAction(a.id, 'ack', () => ackAlertV2(a.id))}
                                style={S.btn(accent)}
                                title="Acknowledge"
                              >✓ Ack</button>
                            ) : (
                              <button
                                onClick={() => rowAction(a.id, 'unack', () => unackAlertV2(a.id))}
                                style={S.btn('#6b7280')}
                                title="Unacknowledge"
                              >↩ Unack</button>
                            )}
                            {!a.muted ? (
                              <button
                                onClick={() => rowAction(a.id, 'mute', () => muteAlertV2(a.id))}
                                style={S.btn('#f59e0b')}
                                title="Mute"
                              >🔇</button>
                            ) : (
                              <button
                                onClick={() => rowAction(a.id, 'unmute', () => unmuteAlertV2(a.id))}
                                style={S.btn('#22c55e')}
                                title="Unmute"
                              >🔔</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Load more */}
          {hasMore && !loading && (
            <div style={{ textAlign: 'center' }}>
              <button onClick={loadMore} disabled={loadingMore} style={{ ...S.btn(accent), padding: '8px 24px', fontSize: 12 }}>
                {loadingMore ? <Spinner /> : 'Load More'}
              </button>
            </div>
          )}

          {!hasMore && alerts.length > 0 && !loading && (
            <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', paddingTop: 4 }}>
              {alerts.length} alert{alerts.length !== 1 ? 's' : ''} shown
            </div>
          )}
        </>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <BulkBar
          selected={selected.size}
          loading={bulkLoading}
          onAck={()   => doBulk(ids => bulkAckV2(ids))}
          onUnack={()  => doBulk(ids => bulkUnackV2(ids))}
          onMute={()   => doBulk(ids => bulkMuteV2(ids))}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* Detail panel overlay */}
      {detailId && (
        <>
          <div
            onClick={() => setDetailId(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)', zIndex: 199 }}
          />
          <DetailPanel
            id={detailId}
            accent={accent}
            onClose={() => setDetailId(null)}
            onAction={load}
          />
        </>
      )}
    </div>
  );
};

export default AlertsPage;
