import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Charts';
import { getSystemInfo, getSystemStats, getLogs } from '../api';

const ACCENT = '#22c55e';

const fmtUptime = (sec) => {
  if (!sec) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const fmtTime = (dt) => {
  if (!dt) return '—';
  const d = new Date(dt.replace(' ', 'T') + 'Z');
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString();
};

const SEV_COLORS = { 1: '#ef4444', 2: '#22c55e', 3: '#6b7280', 4: '#f59e0b', 5: '#3b82f6' };
const SEV_LABELS = { 1: 'emerg', 2: 'ok', 3: 'info', 4: 'warn', 5: 'notice' };

const card = { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '16px 20px' };

const InfoRow = ({ label, value, mono }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f9fafb' }}>
    <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', fontFamily: mono ? 'monospace' : 'inherit' }}>{value ?? '—'}</span>
  </div>
);

const StatBox = ({ label, value, sub, color }) => (
  <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 100 }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: color ?? '#111827', lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{label}</div>
    {sub && <div style={{ fontSize: 10, color: '#9ca3af' }}>{sub}</div>}
  </div>
);

export default function SystemPage({ accent = ACCENT }) {
  const [sysInfo,  setSysInfo]  = useState(null);
  const [stats,    setStats]    = useState(null);
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [si, st, lg] = await Promise.allSettled([
      getSystemInfo(),
      getSystemStats(),
      getLogs(20),
    ]);
    if (si.status === 'fulfilled') setSysInfo(si.value?.system?.[0] ?? null);
    if (st.status === 'fulfilled') setStats(st.value);
    if (lg.status === 'fulfilled') setLogs(lg.value);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = stats?.stats ?? {};
  const devices = stats?.devices ?? [];
  const dbTables = stats?.db_tables ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>System</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
            Runtime status and monitoring health
            {lastRefresh && <span style={{ marginLeft: 8, color: '#d1d5db' }}>· refreshed {fmtTime(lastRefresh.toISOString().replace('T', ' ').slice(0, 19))}</span>}
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 11, fontWeight: 600, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#374151', opacity: loading ? 0.5 : 1 }}>
          <Icon name="refresh" size={13} color="#6b7280" /> Refresh
        </button>
      </div>

      {/* Stat boxes */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatBox label="Devices Up"     value={loading ? '…' : `${s.devices_up ?? 0}/${s.devices_total ?? 0}`}  sub="online / total"     color={s.devices_up === s.devices_total ? accent : '#f59e0b'} />
        <StatBox label="Ports Up"       value={loading ? '…' : `${s.ports_up ?? 0}/${s.ports_total ?? 0}`}      sub="up / total"          color="#3b82f6" />
        <StatBox label="Active Alerts"  value={loading ? '…' : s.alerts_active ?? 0}                            sub="state = active"      color={s.alerts_active > 0 ? '#ef4444' : accent} />
        <StatBox label="Alert Rules"    value={loading ? '…' : s.rules_enabled ?? 0}                            sub="enabled rules"       color="#6b7280" />
        <StatBox label="Total Events"   value={loading ? '…' : (s.events_total ?? 0).toLocaleString()}          sub={s.last_event ? `last: ${fmtTime(s.last_event)}` : ''}  color="#6b7280" />
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* System Info */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Software Versions</div>
          {loading || !sysInfo ? <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</div> : <>
            <InfoRow label="UpdiveNSM"  value={sysInfo.local_ver} />
            <InfoRow label="PHP"        value={sysInfo.php_ver} />
            <InfoRow label="Database"   value={sysInfo.database_ver} mono />
            <InfoRow label="RRDtool"    value={sysInfo.rrdtool_ver} />
            <InfoRow label="Net-SNMP"   value={sysInfo.netsnmp_ver} />
            <InfoRow label="Python"     value={sysInfo.python_ver} />
            <InfoRow label="DB Schema"  value={sysInfo.db_schema} />
          </>}
        </div>

        {/* DB Tables */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Database Tables (top 10 by size)</div>
          {loading ? <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Table', 'Rows', 'Data MB', 'Idx MB'].map(h => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', padding: '4px 6px', textAlign: h === 'Table' ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dbTables.map(t => (
                  <tr key={t.table_name} style={{ borderTop: '1px solid #f9fafb' }}>
                    <td style={{ fontSize: 11, color: '#374151', padding: '5px 6px', fontFamily: 'monospace' }}>{t.table_name}</td>
                    <td style={{ fontSize: 11, color: '#6b7280', padding: '5px 6px', textAlign: 'right' }}>{Number(t.table_rows).toLocaleString()}</td>
                    <td style={{ fontSize: 11, color: '#6b7280', padding: '5px 6px', textAlign: 'right' }}>{t.data_mb}</td>
                    <td style={{ fontSize: 11, color: '#6b7280', padding: '5px 6px', textAlign: 'right' }}>{t.index_mb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Device Poll Status */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Device Polling Status</div>
        {loading ? <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f0f2f5' }}>
                {['Hostname', 'sysName', 'Status', 'Uptime', 'Last Polled', 'Last Discovered'].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 12px', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.device_id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>{d.hostname}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#6b7280' }}>{d.sysName ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: d.status ? '#f0fdf4' : '#fef2f2', color: d.status ? '#15803d' : '#dc2626' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: d.status ? accent : '#ef4444', display: 'inline-block' }} />
                      {d.status ? 'Up' : 'Down'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#374151' }}>{fmtUptime(d.uptime)}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#6b7280' }}>{fmtTime(d.last_polled)}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#6b7280' }}>{fmtTime(d.last_discovered)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Event Log */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
          Recent Events <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>last 20</span>
        </div>
        {loading ? <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</div> : logs.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No events</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {logs.map(ev => (
              <div key={ev.event_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid #f9fafb' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEV_COLORS[ev.severity] ?? '#6b7280', marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#111827' }}>{ev.message}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                    {ev.sysName ?? ev.hostname} · {fmtTime(ev.datetime)}
                  </div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 6, background: (SEV_COLORS[ev.severity] ?? '#6b7280') + '18', color: SEV_COLORS[ev.severity] ?? '#6b7280', textTransform: 'uppercase', flexShrink: 0 }}>
                  {SEV_LABELS[ev.severity] ?? ev.severity}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
