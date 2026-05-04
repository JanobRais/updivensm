import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Charts';
import { getDevices, getEventLog } from '../api';

const ACCENT = '#22c55e';

const SEVERITIES = [
  { value: '',  label: 'All Severities' },
  { value: '1', label: 'Emergency',  color: '#7c3aed' },
  { value: '2', label: 'OK / Up',    color: '#22c55e' },
  { value: '3', label: 'Info',       color: '#6b7280' },
  { value: '4', label: 'Warning',    color: '#f59e0b' },
  { value: '5', label: 'Notice',     color: '#3b82f6' },
];

const TYPES = [
  { value: '',           label: 'All Types' },
  { value: 'system',     label: 'System' },
  { value: 'up',         label: 'Up' },
  { value: 'down',       label: 'Down' },
  { value: 'alert',      label: 'Alert' },
  { value: 'interface',  label: 'Interface' },
  { value: 'config',     label: 'Config' },
  { value: 'poller',     label: 'Poller' },
  { value: 'reboot',     label: 'Reboot' },
  { value: 'auth',       label: 'Auth' },
  { value: 'syslog',     label: 'Syslog' },
];

const SEV_COLOR = { 1: '#7c3aed', 2: '#22c55e', 3: '#6b7280', 4: '#f59e0b', 5: '#3b82f6' };
const SEV_LABEL = { 1: 'EMERG', 2: 'OK', 3: 'INFO', 4: 'WARN', 5: 'NOTICE' };
const TYPE_COLOR = { system: '#6b7280', up: '#22c55e', down: '#ef4444', alert: '#f59e0b', interface: '#3b82f6', config: '#8b5cf6', poller: '#06b6d4', reboot: '#f97316', auth: '#ec4899', syslog: '#64748b' };

function toLocal(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function ago(n, unit) {
  const d = new Date();
  if (unit === 'h') d.setHours(d.getHours() - n);
  if (unit === 'd') d.setDate(d.getDate() - n);
  if (unit === 'M') d.setMonth(d.getMonth() - n);
  return toLocal(d);
}

const PRESETS = [
  { label: '1h',  from: () => ago(1, 'h') },
  { label: '6h',  from: () => ago(6, 'h') },
  { label: '24h', from: () => ago(24,'h') },
  { label: '7d',  from: () => ago(7, 'd') },
  { label: '30d', from: () => ago(30,'d') },
  { label: '1y',  from: () => ago(12,'M') },
];

const PER_PAGE_OPTIONS = [25, 50, 100, 200];

const Sel = ({ value, onChange, children }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', color: '#111827', background: '#fff', cursor: 'pointer', outline: 'none' }}>
    {children}
  </select>
);

export default function LogsPage({ accent = ACCENT }) {
  const [devices,  setDevices]  = useState([]);
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // filters
  const [deviceId,  setDeviceId]  = useState('');
  const [severity,  setSeverity]  = useState('');
  const [type,      setType]      = useState('');
  const [search,    setSearch]    = useState('');
  const [from,      setFrom]      = useState(() => ago(24, 'h'));
  const [to,        setTo]        = useState(() => toLocal(new Date()));
  const [preset,    setPreset]    = useState('24h');
  const [page,      setPage]      = useState(1);
  const [perPage,   setPerPage]   = useState(50);

  useEffect(() => { getDevices().then(setDevices).catch(() => {}); }, []);

  const load = useCallback(async (pg = page) => {
    setLoading(true); setError('');
    try {
      const params = { page: pg, per_page: perPage };
      if (from)     params.from     = from.replace('T', ' ') + ':00';
      if (to)       params.to       = to.replace('T', ' ')   + ':59';
      if (deviceId) params.device_id = deviceId;
      if (severity) params.severity  = severity;
      if (type)     params.type      = type;
      if (search.trim()) params.search = search.trim();
      setResult(await getEventLog(params));
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Request failed');
    }
    setLoading(false);
  }, [page, perPage, from, to, deviceId, severity, type, search]);

  // load on mount and when filters change (reset page to 1)
  useEffect(() => { setPage(1); load(1); }, [perPage, from, to, deviceId, severity, type]);

  const applyPreset = (p) => {
    setPreset(p.label);
    setFrom(p.from());
    setTo(toLocal(new Date()));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1); load(1);
  };

  const goPage = (pg) => { setPage(pg); load(pg); };

  const logs   = result?.logs    ?? [];
  const total  = result?.total   ?? 0;
  const pages  = result?.pages   ?? 1;

  // Pagination: show at most 7 page buttons with ellipsis
  const pageButtons = () => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const arr = [];
    if (page <= 4) {
      arr.push(1,2,3,4,5,'…',pages);
    } else if (page >= pages - 3) {
      arr.push(1,'…',pages-4,pages-3,pages-2,pages-1,pages);
    } else {
      arr.push(1,'…',page-1,page,page+1,'…',pages);
    }
    return arr;
  };

  const F = { sel: { padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', color: '#111827', background: '#fff', cursor: 'pointer', outline: 'none' } };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Event Logs</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
            {total > 0 ? <>{total.toLocaleString()} events found</> : 'System and device event history'}
          </div>
        </div>
        <button onClick={() => load(page)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 11, fontWeight: 600, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#374151', opacity: loading ? 0.5 : 1 }}>
          <Icon name="refresh" size={13} color="#6b7280" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>

        {/* Date presets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick range</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)} style={{ padding: '5px 9px', fontSize: 11, fontWeight: 600, border: `1px solid ${preset === p.label ? accent : '#e5e7eb'}`, borderRadius: 6, background: preset === p.label ? accent + '15' : '#fff', color: preset === p.label ? accent : '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* From / To */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>From</label>
          <input type="datetime-local" value={from} onChange={e => { setFrom(e.target.value); setPreset(''); }} style={{ ...F.sel, cursor: 'text' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>To</label>
          <input type="datetime-local" value={to} onChange={e => { setTo(e.target.value); setPreset(''); }} style={{ ...F.sel, cursor: 'text' }} />
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 36, background: '#e5e7eb', alignSelf: 'flex-end', margin: '0 4px' }} />

        {/* Host */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Host</label>
          <Sel value={deviceId} onChange={v => { setDeviceId(v); setPage(1); }}>
            <option value="">All Hosts</option>
            {devices.map(d => <option key={d.device_id} value={d.device_id}>{d.sysName || d.hostname}</option>)}
          </Sel>
        </div>

        {/* Severity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Severity</label>
          <Sel value={severity} onChange={v => { setSeverity(v); setPage(1); }}>
            {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Sel>
        </div>

        {/* Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</label>
          <Sel value={type} onChange={v => { setType(v); setPage(1); }}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Sel>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 36, background: '#e5e7eb', alignSelf: 'flex-end', margin: '0 4px' }} />

        {/* Search */}
        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Search message</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={12} color="#9ca3af" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by message…" style={{ ...F.sel, cursor: 'text', paddingLeft: 28, width: 200 }} />
            </div>
            <button type="submit" style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 7, background: accent, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              Search
            </button>
            {(search || deviceId || severity || type) && (
              <button type="button" onClick={() => { setSearch(''); setDeviceId(''); setSeverity(''); setType(''); }} style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, border: '1px solid #e5e7eb', borderRadius: 7, background: '#fff', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#dc2626' }}>{error}</div>}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' }}>
        {/* Table header row with per-page */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {loading ? 'Loading…' : total > 0 ? `Showing ${((page-1)*perPage)+1}–${Math.min(page*perPage, total)} of ${total.toLocaleString()}` : '0 results'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Per page:</span>
            <Sel value={perPage} onChange={v => { setPerPage(Number(v)); setPage(1); }}>
              {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </Sel>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f0f2f5', background: '#fafafa' }}>
              {['Timestamp', 'Host', 'Type', 'Severity', 'Message'].map(h => (
                <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>No events match your filters</td></tr>
            ) : logs.map((ev, i) => {
              const sevColor  = SEV_COLOR[ev.severity]  ?? '#6b7280';
              const typeColor = TYPE_COLOR[ev.type]     ?? '#6b7280';
              return (
                <tr key={ev.event_id} style={{ borderBottom: '1px solid #f9fafb', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '8px 14px', fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{ev.datetime}</td>
                  <td style={{ padding: '8px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{ev.sysName || ev.hostname}</div>
                    {ev.sysName && <div style={{ fontSize: 10, color: '#9ca3af' }}>{ev.hostname}</div>}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: typeColor + '18', color: typeColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {ev.type || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: sevColor + '18', color: sevColor }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: sevColor, display: 'inline-block' }} />
                      {SEV_LABEL[ev.severity] ?? ev.severity}
                    </span>
                  </td>
                  <td style={{ padding: '8px 14px', fontSize: 12, color: '#374151', maxWidth: 480 }}>{ev.message}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <button onClick={() => goPage(page - 1)} disabled={page <= 1 || loading} style={{ padding: '5px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: page > 1 ? 'pointer' : 'default', color: '#374151', fontFamily: 'inherit', opacity: page <= 1 ? 0.4 : 1 }}>
              ‹ Prev
            </button>
            {pageButtons().map((btn, i) =>
              btn === '…' ? (
                <span key={`e${i}`} style={{ padding: '5px 4px', fontSize: 12, color: '#9ca3af' }}>…</span>
              ) : (
                <button key={btn} onClick={() => goPage(btn)} style={{ padding: '5px 10px', fontSize: 12, border: `1px solid ${btn === page ? accent : '#e5e7eb'}`, borderRadius: 6, background: btn === page ? accent : '#fff', color: btn === page ? '#fff' : '#374151', cursor: 'pointer', fontWeight: btn === page ? 700 : 400, fontFamily: 'inherit' }}>
                  {btn}
                </button>
              )
            )}
            <button onClick={() => goPage(page + 1)} disabled={page >= pages || loading} style={{ padding: '5px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: page < pages ? 'pointer' : 'default', color: '#374151', fontFamily: 'inherit', opacity: page >= pages ? 0.4 : 1 }}>
              Next ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
