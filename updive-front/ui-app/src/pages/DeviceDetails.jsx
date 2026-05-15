import { useState, useEffect, useCallback } from 'react';
import { PageHeader, StatCard, Badge, TableCard, TD } from '../components/Charts';
import {
  getDeviceFull,
  getMetrics, getInventory, getDeviceHealth,
  getOsList, setDeviceOs, clearDeviceOs,
} from '../api';

const fmt = {
  uptime: (s) => {
    if (!s) return 'N/A';
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  },
  bytes: (b) => {
    if (!b) return '0';
    if (b >= 1e9) return (b / 1e9).toFixed(1) + 'G';
    if (b >= 1e6) return (b / 1e6).toFixed(1) + 'M';
    if (b >= 1e3) return (b / 1e3).toFixed(1) + 'K';
    return b + 'B';
  },
  speed: (bps) => {
    if (!bps) return 'N/A';
    if (bps >= 1e9) return (bps / 1e9).toFixed(0) + ' Gbps';
    if (bps >= 1e6) return (bps / 1e6).toFixed(0) + ' Mbps';
    return (bps / 1e3).toFixed(0) + ' Kbps';
  },
  rate: (r) => {
    if (!r) return '0 bps';
    const b = r * 8;
    if (b >= 1e9) return (b / 1e9).toFixed(2) + ' Gbps';
    if (b >= 1e6) return (b / 1e6).toFixed(1) + ' Mbps';
    if (b >= 1e3) return (b / 1e3).toFixed(0) + ' Kbps';
    return b.toFixed(0) + ' bps';
  },
  mac: (m) => {
    if (!m || m.length < 12) return m || 'N/A';
    return m.match(/.{1,2}/g).join(':').toUpperCase();
  },
};

const TIME_RANGES = [
  { label: '1h',  value: '-1h' },
  { label: '6h',  value: '-6h' },
  { label: '24h', value: '-1d' },
  { label: '7d',  value: '-1w' },
  { label: '30d', value: '-1M' },
];

const ALL_TABS = ['Overview', 'Interfaces', 'CPU', 'Memory', 'Alerts', 'Eventlog', 'Metrics', 'Graphs', 'Inventory', 'Health'];

const Section = ({ title, children, action }) => (
  <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' }}>
    <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0f2f5', background: '#f9fafb',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{title}</span>
      {action}
    </div>
    {children}
  </div>
);

const KV = ({ label, value, mono, color }) => (
  <div style={{ display: 'flex', padding: '9px 18px', borderBottom: '1px solid #f9fafb' }}>
    <div style={{ width: 160, fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>{label}</div>
    <div style={{ flex: 1, fontSize: 12, color: color || '#111827', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value ?? 'N/A'}</div>
  </div>
);

const PercentBar = ({ value, warn = 75, color }) => {
  const bg = value >= warn ? '#ef4444' : value >= 50 ? '#f59e0b' : color || '#22c55e';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#f0f2f5', borderRadius: 4, height: 6 }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', borderRadius: 4, background: bg, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: bg, minWidth: 32 }}>{value}%</span>
    </div>
  );
};

const GraphImg = ({ src, alt }) => {
  const [status, setStatus] = useState('loading');
  return (
    <div style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', background: '#f9fafb', border: '1px solid #f0f2f5' }}>
      {status === 'loading' && (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 20, height: 20, border: '2px solid #e5e7eb', borderTopColor: '#6b7280', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
            Loading graph...
          </div>
        </div>
      )}
      {status === 'error' && (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11 }}>
          No RRD data available
        </div>
      )}
      <img src={src} alt={alt} onLoad={() => setStatus('ok')} onError={() => setStatus('error')}
        style={{ width: '100%', display: status === 'ok' ? 'block' : 'none', borderRadius: 6 }} />
    </div>
  );
};

const TimeRangeBar = ({ value, onChange, accent }) => (
  <div style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '8px 12px', alignItems: 'center' }}>
    <span style={{ fontSize: 11, color: '#6b7280', marginRight: 6 }}>Period:</span>
    {TIME_RANGES.map(r => (
      <button key={r.value} onClick={() => onChange(r.value)} style={{
        padding: '4px 12px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit',
        background: value === r.value ? accent : '#f3f4f6',
        color: value === r.value ? '#fff' : '#6b7280',
      }}>{r.label}</button>
    ))}
  </div>
);

// ─── Switch Front Panel ───────────────────────────────────────────
const SwitchPanel = ({ ports, selectedPort, onSelect, links = [] }) => {
  // Display max 24 ports per row
  const ROW = 24;
  // Map: port_id → link object (remote_hostname, remote_port)
  const linkMap = {};
  links.forEach(l => { linkMap[l.local_port_id] = l; });

  const rows = [];
  for (let i = 0; i < ports.length; i += ROW) rows.push(ports.slice(i, i + ROW).map((p, j) => ({ ...p, _slot: i + j + 1 })));

  const portColor = (p) => {
    if (p.flapping)                                          return '#f59e0b';
    if (p.ifAdminStatus === 'down' || p.ifAdminStatus === 2) return '#475569';
    if (p.ifOperStatus === 'up'   || p.ifOperStatus === 1)  return '#22c55e';
    return '#ef4444';
  };

  // Shorten remote hostname for label: take last segment after dash or dot
  const shortName = (name) => {
    const parts = name.split(/[-.]/).filter(Boolean);
    return parts[parts.length - 1]?.toUpperCase() ?? name;
  };

  return (
    <div style={{ background: '#1e293b', borderRadius: 10, padding: '14px 18px', userSelect: 'none' }}>
      {/* Chassis top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
          <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>FRONT PANEL</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {links.length > 0 && (
            <span style={{ color: '#f59e0b', fontSize: 9, fontWeight: 600 }}>
              ⬡ {links.length} neighbor{links.length > 1 ? 's' : ''}
            </span>
          )}
          <span style={{ color: '#64748b', fontSize: 9 }}>{ports.length} ports</span>
        </div>
      </div>

      {/* Port grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 4 }}>
            {row.map((p) => {
              const color   = portColor(p);
              const isUp    = p.ifOperStatus === 'up' || p.ifOperStatus === 1;
              const isSel   = selectedPort?.port_id === p.port_id;
              const link    = linkMap[p.port_id];
              const tooltip = link
                ? `${p.ifName}${p.ifAlias ? ' — ' + p.ifAlias : ''}\n⬡ Connected: ${link.remote_hostname} (${link.remote_port})`
                : `${p.ifName}${p.ifAlias ? ' — ' + p.ifAlias : ''}`;
              return (
                /* Fixed-height slot: port box (44px) + label zone (16px) = 60px always */
                <div key={p.port_id} style={{ flex: 1, minWidth: 24, maxWidth: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', height: 60 }}>
                  <div
                    onClick={() => onSelect(p)}
                    title={tooltip}
                    style={{
                      width: '100%', height: 44, borderRadius: 5, background: color,
                      cursor: 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 2,
                      border: isSel ? '2px solid #fff' : link ? '2px solid #f59e0b' : '2px solid rgba(255,255,255,0.08)',
                      boxShadow: isSel ? '0 0 0 2px #fff4' : link ? '0 0 10px #f59e0b60' : isUp ? `0 0 6px ${color}70` : 'none',
                      transition: 'all 0.12s',
                      transform: isSel ? 'scale(1.1)' : 'scale(1)',
                      position: 'relative',
                    }}
                  >
                    <span style={{ fontSize: 9, color: '#fff', fontWeight: 700, lineHeight: 1 }}>
                      {p._slot}
                    </span>
                    {/* Small dot indicator for neighbor inside the port */}
                    {link && !isSel && (
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 4px #f59e0b' }} />
                    )}
                  </div>
                  {/* Fixed 16px label zone — always present to keep alignment */}
                  <div style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {link && (
                      <span style={{
                        fontSize: 7, color: '#f59e0b', fontWeight: 700,
                        maxWidth: '100%', textAlign: 'center', lineHeight: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        padding: '0 2px',
                      }}>
                        {shortName(link.remote_hostname)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
        {[['#22c55e','Up'], ['#ef4444','Down'], ['#475569','Disabled'], ['#f59e0b','Neighbor']].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
            <span style={{ color: '#64748b', fontSize: 9 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Port Detail Panel ────────────────────────────────────────────
const PortDetail = ({ port, accent, link }) => {
  if (!port) return (
    <div style={{ background: '#f9fafb', borderRadius: 10, border: '1px dashed #e5e7eb',
      padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#9ca3af', fontSize: 12, flexDirection: 'column', gap: 8 }}>
      <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth={1.5}>
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
      Portni tanlang
    </div>
  );

  const isUp   = port.ifOperStatus === 'up' || port.ifOperStatus === 1;
  const isAdm  = port.ifAdminStatus === 'up' || port.ifAdminStatus === 1;
  const inRate  = fmt.rate(port.ifInOctets_rate);
  const outRate = fmt.rate(port.ifOutOctets_rate);
  const inPkts  = port.ifInUcastPkts_rate  ? `${Math.round(port.ifInUcastPkts_rate)}  pps` : '—';
  const outPkts = port.ifOutUcastPkts_rate ? `${Math.round(port.ifOutUcastPkts_rate)} pps` : '—';
  const util    = (port.ifSpeed && port.ifSpeed > 0)
    ? Math.min(100, Math.round(((port.ifInOctets_rate || 0) + (port.ifOutOctets_rate || 0)) * 8 / port.ifSpeed * 100))
    : null;

  const statusColor = isUp ? '#22c55e' : '#ef4444';

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${statusColor}40`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 18px', background: statusColor + '10',
        borderBottom: `1px solid ${statusColor}30`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{port.ifName}</div>
          {port.ifAlias && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{port.ifAlias}</div>}
          {link && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>⬡</span>
              <span style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '1px 8px', borderRadius: 10, fontWeight: 600 }}>
                {link.remote_hostname} — {link.remote_port}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor,
            background: statusColor + '15', padding: '3px 10px', borderRadius: 20 }}>
            {isUp ? 'UP' : 'DOWN'}
          </span>
          {!isAdm && <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '3px 8px', borderRadius: 20 }}>admin-down</span>}
        </div>
      </div>

      {/* Traffic summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #f0f2f5' }}>
        {[
          ['↓ In',  inRate,  accent],
          ['↑ Out', outRate, '#3b82f6'],
          ['Util',  util !== null ? util + '%' : 'N/A', util !== null ? (util > 80 ? '#ef4444' : util > 50 ? '#f59e0b' : '#22c55e') : '#9ca3af'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ padding: '12px 16px', textAlign: 'center', borderRight: '1px solid #f0f2f5' }}>
            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* All fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {[
          ['ifIndex',       port.ifIndex],
          ['ifType',        port.ifType],
          ['Speed',         fmt.speed(port.ifSpeed)],
          ['MTU',           port.ifMtu ? port.ifMtu + ' B' : 'N/A'],
          ['MAC',           fmt.mac(port.ifPhysAddress)],
          ['Admin Status',  isAdm ? 'Up' : 'Down'],
          ['In packets/s',  inPkts],
          ['Out packets/s', outPkts],
          ['In errors',     port.ifInErrors      ?? '0'],
          ['Out errors',    port.ifOutErrors     ?? '0'],
          ['In discards',   port.ifInDiscards    ?? '0'],
          ['Out discards',  port.ifOutDiscards   ?? '0'],
          ['Port ID',       port.port_id],
          ['Device ID',     port.device_id],
        ].map(([label, value], i) => (
          <div key={label} style={{
            padding: '8px 16px', borderBottom: '1px solid #f9fafb',
            borderRight: i % 2 === 0 ? '1px solid #f0f2f5' : 'none',
            background: i % 4 < 2 ? '#fff' : '#fafafa',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 12, color: '#111827', fontFamily: 'monospace' }}>{value ?? 'N/A'}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Metrics mini-dashboard ───────────────────────────────────────
const M_DEFS = [
  { type: 'cpu',      label: 'CPU Usage',    unit: '%',   color: '#f59e0b' },
  { type: 'mem',      label: 'Memory',       unit: '%',   color: '#ef4444' },
  { type: 'port_in',  label: 'Traffic In',   unit: 'Bps', color: '#3b82f6' },
  { type: 'port_out', label: 'Traffic Out',  unit: 'Bps', color: '#8b5cf6' },
];

const M_PRESETS = [
  { label: '1h',  h: 1   },
  { label: '6h',  h: 6   },
  { label: '24h', h: 24  },
  { label: '7d',  h: 168 },
];

function mAgo(hours) {
  const d = new Date(); d.setHours(d.getHours() - hours);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function mFmt(v, unit) {
  if (v === null || v === undefined) return '—';
  if (unit === 'Bps') {
    if (v >= 1e9) return (v/1e9).toFixed(1) + ' GB/s';
    if (v >= 1e6) return (v/1e6).toFixed(1) + ' MB/s';
    if (v >= 1e3) return (v/1e3).toFixed(1) + ' KB/s';
    return Number(v).toFixed(0) + ' B/s';
  }
  if (unit === '%') return Number(v).toFixed(1) + '%';
  return Number(v).toFixed(2);
}

function MiniChart({ uid, data, unit, color }) {
  const W = 500, H = 120, PL = 52, PR = 8, PT = 6, PB = 20;
  const iW = W-PL-PR, iH = H-PT-PB;
  if (!data || data.length < 2) return (
    <div style={{ height: 120, display:'flex', alignItems:'center', justifyContent:'center',
      color:'#9ca3af', fontSize:11, background:'#f9fafb', borderRadius:6 }}>No data</div>
  );
  const vals  = data.map(d => Number(d.value));
  const times = data.map(d => new Date(d.collected_at.replace(' ','T')).getTime());
  const minV  = Math.min(...vals), maxV = Math.max(...vals);
  const minT  = Math.min(...times), maxT = Math.max(...times);
  const rv = maxV - minV || 1, rt = maxT - minT || 1;
  const px = t => PL + ((t-minT)/rt)*iW;
  const py = v => PT + iH - ((v-minV)/rv)*iH;
  const pts  = data.map((_,i) => `${px(times[i])},${py(vals[i])}`).join(' ');
  const area = `M${px(times[0])},${PT+iH} ` + data.map((_,i) => `L${px(times[i])},${py(vals[i])}`).join(' ') + ` L${px(times[times.length-1])},${PT+iH} Z`;
  const yTks = [0,1,2,3].map(i => minV + (rv/3)*i);
  const xTks = [0,1,2,3].map(i => minT + (rt/3)*i);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block' }}>
      <defs>
        <linearGradient id={`mg-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.01"/>
        </linearGradient>
      </defs>
      {yTks.map((v,i) => (
        <g key={i}>
          <line x1={PL} x2={W-PR} y1={py(v)} y2={py(v)} stroke="#f0f2f5" strokeWidth="1"/>
          <text x={PL-4} y={py(v)+4} textAnchor="end" fontSize={8} fill="#9ca3af">{mFmt(v,unit)}</text>
        </g>
      ))}
      {xTks.map((t,i) => {
        const d = new Date(t);
        const l = rt > 86400000
          ? `${d.getMonth()+1}/${d.getDate()}`
          : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        return <text key={i} x={px(t)} y={H-3} textAnchor="middle" fontSize={8} fill="#9ca3af">{l}</text>;
      })}
      <path d={area} fill={`url(#mg-${uid})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
const DeviceDetailsPage = ({ hostname, onBack, accent }) => {
  const [device,     setDevice]    = useState(null);
  const [ports,      setPorts]     = useState([]);
  const [processors, setProcs]     = useState([]);
  const [mempools,   setMems]      = useState([]);
  const [alerts,     setAlerts]    = useState([]);
  const [eventlog,   setEventlog]  = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [tab,        setTab]       = useState('Overview');
  const [timeRange,  setTimeRange] = useState('-1d');
  const [selPort,    setSelPort]   = useState(null);
  const [links,      setLinks]     = useState([]);
  const [showAllPorts, setShowAllPorts] = useState(false);

  // Metrics tab state
  const [mPreset,      setMPreset]      = useState('6h');
  const [mRangeMode,   setMRangeMode]   = useState('preset'); // 'preset' | 'custom'
  const [mCustomFrom,  setMCustomFrom]  = useState('');
  const [mCustomTo,    setMCustomTo]    = useState('');
  const [mApplied,     setMApplied]     = useState(0); // incremented on Apply
  const [mPortId,      setMPortId]      = useState(null);
  const [mData,        setMData]        = useState({});
  const [mLoading,     setMLoading]     = useState(false);
  const [mTick,        setMTick]        = useState(0);

  // CPU / Memory chart state
  const [cpuRange,     setCpuRange]     = useState('6h');
  const [cpuData,      setCpuData]      = useState([]);
  const [cpuLoading,   setCpuLoading]   = useState(false);
  const [memRange,     setMemRange]     = useState('6h');
  const [memData,      setMemData]      = useState([]);
  const [memLoading,   setMemLoading]   = useState(false);

  // Inventory tab state
  const [inventory,    setInventory]    = useState([]);
  const [invLoading,   setInvLoading]   = useState(false);

  // Health tab state
  const [health,       setHealth]       = useState(null);
  const [healthLoading,setHealthLoading]= useState(false);

  // OS override modal state
  const [showOsModal,  setShowOsModal]  = useState(false);
  const [osList,       setOsList]       = useState([]);
  const [osSelected,   setOsSelected]   = useState('');
  const [osSaving,     setOsSaving]     = useState(false);

  useEffect(() => {
    setLoading(true);
    setSelPort(null);
    getDeviceFull(hostname)
      .then(d => {
        setDevice(d.device);
        setPorts(d.ports      ?? []);
        setProcs(d.processors ?? []);
        setMems(d.mempools    ?? []);
        setAlerts(d.alerts    ?? []);
        setEventlog(d.eventlog ?? []);
        setLinks(d.links      ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [hostname]);

  const dtLocalToApi = v => v ? v.replace('T', ' ') + ':00' : null;

  // Load metrics when Metrics tab is active
  useEffect(() => {
    if (tab !== 'Metrics' || !device) return;
    const devId = device.device_id;
    let from, to;
    if (mRangeMode === 'custom' && mCustomFrom && mCustomTo) {
      from = dtLocalToApi(mCustomFrom);
      to   = dtLocalToApi(mCustomTo);
    } else {
      const hours = M_PRESETS.find(p => p.label === mPreset)?.h ?? 6;
      from = mAgo(hours);
      const d = new Date(); const pad = n => String(n).padStart(2,'0');
      to   = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    }

    if (mPortId === 'all') {
      const activePorts = ports
        .filter(p => (p.ifInOctets_rate || 0) > 0 || (p.ifOutOctets_rate || 0) > 0)
        .sort((a, b) => ((b.ifInOctets_rate || 0) + (b.ifOutOctets_rate || 0)) - ((a.ifInOctets_rate || 0) + (a.ifOutOctets_rate || 0)))
        .slice(0, 10);
      setMLoading(true);
      Promise.all(activePorts.flatMap(port => [
        getMetrics({ device_id: devId, metric_type: 'port_in',  from, to, resolution: 'auto', limit: 300, object_id: port.port_id })
          .then(r => ({ portId: port.port_id, portName: port.ifName, type: 'port_in',  rows: r.metrics ?? [] }))
          .catch(() => ({ portId: port.port_id, portName: port.ifName, type: 'port_in',  rows: [] })),
        getMetrics({ device_id: devId, metric_type: 'port_out', from, to, resolution: 'auto', limit: 300, object_id: port.port_id })
          .then(r => ({ portId: port.port_id, portName: port.ifName, type: 'port_out', rows: r.metrics ?? [] }))
          .catch(() => ({ portId: port.port_id, portName: port.ifName, type: 'port_out', rows: [] })),
      ])).then(results => {
        const byPort = {};
        results.forEach(r => {
          if (!byPort[r.portId]) byPort[r.portId] = { portId: r.portId, portName: r.portName };
          byPort[r.portId][r.type] = r.rows;
        });
        setMData({ _allPorts: Object.values(byPort) });
        setMLoading(false);
      });
      return;
    }

    const portId = mPortId ?? ports[0]?.port_id ?? null;
    setMLoading(true);
    Promise.all(M_DEFS.map(mt => {
      const params = { device_id: devId, metric_type: mt.type, from, to, resolution:'auto', limit:500 };
      if ((mt.type === 'port_in' || mt.type === 'port_out') && portId) params.object_id = portId;
      return getMetrics(params).then(r => ({ type: mt.type, rows: r.metrics ?? [] })).catch(() => ({ type: mt.type, rows: [] }));
    })).then(results => {
      const d = {};
      results.forEach(r => { d[r.type] = r.rows; });
      setMData(d);
      setMLoading(false);
    });
  }, [tab, device, mPreset, mRangeMode, mApplied, mPortId, mTick]);

  // Load CPU chart data
  useEffect(() => {
    if (tab !== 'CPU' || !device) return;
    const hoursMap = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 };
    const hours = hoursMap[cpuRange] ?? 6;
    const from  = new Date(Date.now() - hours * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
    const to    = new Date().toISOString().replace('T', ' ').slice(0, 19);
    setCpuLoading(true);
    getMetrics({ device_id: device.device_id, metric_type: 'cpu', from, to, resolution: 'auto', limit: 300 })
      .then(r => setCpuData(r.metrics ?? []))
      .catch(() => setCpuData([]))
      .finally(() => setCpuLoading(false));
  }, [tab, device, cpuRange]);

  // Load Memory chart data
  useEffect(() => {
    if (tab !== 'Memory' || !device) return;
    const hoursMap = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 };
    const hours = hoursMap[memRange] ?? 6;
    const from  = new Date(Date.now() - hours * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
    const to    = new Date().toISOString().replace('T', ' ').slice(0, 19);
    setMemLoading(true);
    getMetrics({ device_id: device.device_id, metric_type: 'mem', from, to, resolution: 'auto', limit: 300 })
      .then(r => setMemData(r.metrics ?? []))
      .catch(() => setMemData([]))
      .finally(() => setMemLoading(false));
  }, [tab, device, memRange]);

  // Load inventory when tab is active
  useEffect(() => {
    if (tab !== 'Inventory' || !device) return;
    setInvLoading(true);
    getInventory(hostname)
      .then(setInventory)
      .catch(() => setInventory([]))
      .finally(() => setInvLoading(false));
  }, [tab, hostname, device]);

  // Load health when tab is active
  useEffect(() => {
    if (tab !== 'Health' || !device) return;
    setHealthLoading(true);
    getDeviceHealth(hostname)
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setHealthLoading(false));
  }, [tab, hostname, device]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading SNMP data...</div>;
  if (!device)  return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Device not found.</div>;

  const linkByPortId = {};
  links.forEach(l => { linkByPortId[l.local_port_id] = l; });

  const avgCpu    = processors.length
    ? Math.round(processors.reduce((a, b) => a + (b.processor_usage || 0), 0) / processors.length) : 0;
  const ram         = mempools.find(m => m.mempool_class === 'system') || mempools[0];
  const portsUp     = ports.filter(p => p.ifOperStatus === 'up' || p.ifOperStatus === 1).length;
  const activeAlerts = alerts.filter(a => a.state === 1);
  const devId       = device.device_id;

  // Device Type Detection
  const os = (device.os || '').toLowerCase();
  const purpose = (device.purpose || '').toLowerCase();
  const isCamera = os.includes('hikvision') || os.includes('dahua') || purpose === 'camera';
  const isSwitch = os.includes('eltex') || os.includes('cisco') || os.includes('procurve') || os.includes('ios') || ports.length > 2;
  const isRouter = os.includes('junos') || os.includes('ios-xr') || os.includes('mikrotik');

  const gUrl = (type, id, extra = '') => {
    const param = type.startsWith('device_') ? `device=${id}` : `id=${id}`;
    return `/graph.php?type=${type}&${param}&from=${timeRange}&to=now&width=600&height=200&legend=yes${extra}`;
  };

  const DEVICE_GRAPHS = [
    { type: 'device_processor', label: 'CPU Usage' },
    { type: 'device_mempool',   label: 'Memory Pools' },
    { type: 'device_ping_perf', label: 'Ping Latency / Loss' },
    { type: 'device_uptime',    label: 'Uptime' },
  ];

  const PORT_GRAPHS = [
    { type: 'port_bits',    label: 'Traffic (bits/s)' },
    { type: 'port_errors',  label: 'Errors' },
    { type: 'port_packets', label: 'Packets' },
  ];
  
  const isPhysicalPort = (p) => {
    const type = (p.ifType || '').toLowerCase();
    const name = (p.ifName || '').toLowerCase();
    // Exclude common virtual/logical types
    if (type.includes('vlan') || type.includes('loopback') || type.includes('tunnel') || type.includes('softwareloopback') || type.includes('l2vlan')) return false;
    // Exclude by name patterns
    if (name.startsWith('vl') || name.startsWith('lo') || name.startsWith('nu') || name.startsWith('tu')) return false;
    if (name.includes('vlan') || name.includes('loopback') || name.includes('null') || name.includes('tunnel')) return false;
    return true;
  };

  const filteredPorts = showAllPorts ? ports : ports.filter(isPhysicalPort);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <PageHeader
        title={device.display || device.sysName || device.hostname}
        desc={`${device.hardware || device.os || ''} · ${device.ip}`}
        icon={device.icon}
        action={
          <button onClick={onBack} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>
            ← Back
          </button>
        }
      />

      {/* OS generic warning banner */}
      {device.os === 'generic' && !device.os_forced && (
        <div style={{ background: '#fefce8', border: '1px solid #fbbf24', borderRadius: 10, padding: '12px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>OS aniqlanmadi — <code style={{ background: '#fef08a', padding: '1px 6px', borderRadius: 4 }}>generic</code></div>
              <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                Ushbu qurilma uchun OS avtomatik tanilmadi. OID yoki sysDescr mos kelmadi.
                {"Qo'lda OS belgilash orqali to'g'ri modul va grafiklarni yoqing."}
              </div>
            </div>
          </div>
          <button onClick={() => {
            getOsList().then(list => { setOsList(list); setOsSelected(''); setShowOsModal(true); });
          }} style={{
            background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
          }}>
            OS belgilash
          </button>
        </div>
      )}

      {/* OS forced badge */}
      {device.os_forced && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🔒</span>
            <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
              {"OS qo'lda belgilangan:"} <strong>{device.os}</strong>
            </span>
          </div>
          <button onClick={() => {
            clearDeviceOs(hostname).then(() => {
              setDevice(d => ({ ...d, os: d.os, os_forced: 0 }));
              getDeviceDetails(hostname).then(setDevice);
            });
          }} style={{
            background: 'transparent', color: '#16a34a', border: '1px solid #86efac',
            borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Tozalash
          </button>
        </div>
      )}

      {/* OS override modal */}
      {showOsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 420, maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{"OS ni qo'lda belgilash"}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 18 }}>
              Qurilma: <strong>{hostname}</strong>
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>OS tanlang</label>
            <select value={osSelected} onChange={e => setOsSelected(e.target.value)} style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db',
              fontSize: 13, fontFamily: 'inherit', background: '#f9fafb', marginBottom: 20,
            }}>
              <option value="">-- Tanlang --</option>
              {osList.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowOsModal(false)} style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151',
              }}>Bekor qilish</button>
              <button disabled={!osSelected || osSaving} onClick={() => {
                setOsSaving(true);
                setDeviceOs(hostname, osSelected).then(() => {
                  setShowOsModal(false);
                  setOsSaving(false);
                  setDevice(d => ({ ...d, os: osSelected, os_forced: 1 }));
                }).catch(() => setOsSaving(false));
              }} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: osSelected ? '#f59e0b' : '#e5e7eb', color: osSelected ? '#fff' : '#9ca3af',
                fontSize: 12, fontWeight: 700, cursor: osSelected ? 'pointer' : 'default', fontFamily: 'inherit',
              }}>
                {osSaving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard label="Status"        value={device.status ? 'UP' : 'DOWN'} icon="checkCircle" color={device.status ? '#22c55e' : '#ef4444'} />
        <StatCard label="Uptime"        value={fmt.uptime(device.uptime)}      icon="clock"       color="#f59e0b" />
        {processors.length > 0 && <StatCard label="CPU Avg"       value={avgCpu + '%'}                   icon="activity"    color="#8b5cf6" subtext={`${processors.length} cores`} />}
        {ram && <StatCard label="RAM"           value={ram.mempool_perc + '%'} icon="database" color="#3b82f6"
          subtext={`${fmt.bytes(ram.mempool_used)} / ${fmt.bytes(ram.mempool_total)}`} />}
        {ports.length > 0 && <StatCard label="Ports Up"      value={`${portsUp}/${ports.length}`}   icon="wifi"        color={accent} />}
        <StatCard label="Active Alerts" value={activeAlerts.length}            icon="alerts"      color={activeAlerts.length > 0 ? '#ef4444' : '#22c55e'} />
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '8px 12px', flexWrap: 'wrap' }}>
        {ALL_TABS.filter(t => {
          if (t === 'Interfaces' && ports.length === 0) return false;
          if (t === 'CPU' && processors.length === 0) return false;
          if (t === 'Memory' && mempools.length === 0) return false;
          return true;
        }).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '5px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            background: tab === t ? accent : 'transparent',
            color: tab === t ? '#fff' : '#6b7280',
          }}>{t}</button>
        ))}
      </div>

      {/* ── Overview ───────────────────────────────────────────────── */}
      {tab === 'Overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Switch Front Panel (Only for switches/routers with ports) */}
          {ports.length > 2 && isSwitch && (
            <Section 
              title={`Switch Panel — ${device.sysName || device.hostname}`}
              action={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>Barcha interfeyslar:</span>
                  <button 
                    onClick={() => setShowAllPorts(!showAllPorts)}
                    style={{
                      width: 32, height: 18, borderRadius: 10, border: 'none', position: 'relative',
                      background: showAllPorts ? accent : '#d1d5db', cursor: 'pointer', transition: 'background 0.2s'
                    }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2, left: showAllPorts ? 16 : 2, transition: 'left 0.2s'
                    }} />
                  </button>
                </div>
              }
            >
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SwitchPanel ports={filteredPorts} selectedPort={selPort} onSelect={setSelPort} links={links} />
                <PortDetail port={selPort} accent={accent} link={selPort ? linkByPortId[selPort.port_id] : null} />
              </div>
            </Section>
          )}

          {/* Camera / NVR Specific Section */}
          {isCamera && (
            <Section title="Camera Details & Hardware">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                <KV label="Serial Number" value={device.serial || 'N/A'} mono color="#059669" />
                <KV label="Hardware Model" value={device.hardware} />
                <KV label="Software Version" value={device.version} />
                <KV label="Device Type" value="Network Camera / NVR" />
                {device.sysName && <KV label="System Name" value={device.sysName} />}
              </div>
            </Section>
          )}

          {/* System info */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <Section title="System Info">
                <KV label="Hostname"    value={device.hostname} />
                <KV label="SysName"     value={device.sysName} />
                <KV label="IP"          value={device.ip} mono />
                <KV label="OS"          value={device.os} />
                <KV label="Hardware"    value={device.hardware} />
                <KV label="Description" value={device.sysDescr} />
                <KV label="SNMP Ver"    value={device.snmpver} mono />
                <KV label="Last Polled" value={device.last_polled} />
              </Section>
            </div>
            <div style={{ width: 280 }}>
              <Section title="Features">
                <div style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {device.features
                    ? device.features.split(',').map(f => (
                        <span key={f} style={{ background: `${accent}15`, color: accent, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4 }}>{f.trim()}</span>
                      ))
                    : <span style={{ color: '#9ca3af', fontSize: 11 }}>No feature data</span>
                  }
                </div>
              </Section>
            </div>
          </div>
        </div>
      )}

      {/* ── Interfaces ─────────────────────────────────────────────── */}
      {tab === 'Interfaces' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Mini panel in Interfaces tab too */}
          {ports.length > 0 && (
            <Section 
              title="Port Panel — click a port to highlight"
              action={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#6b7280' }}>Show All:</span>
                  <button 
                    onClick={() => setShowAllPorts(!showAllPorts)}
                    style={{
                      width: 28, height: 16, borderRadius: 10, border: 'none', position: 'relative',
                      background: showAllPorts ? accent : '#d1d5db', cursor: 'pointer'
                    }}
                  >
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2, left: showAllPorts ? 14 : 2, transition: 'left 0.2s'
                    }} />
                  </button>
                </div>
              }
            >
              <div style={{ padding: 14 }}>
                <SwitchPanel ports={filteredPorts} selectedPort={selPort} onSelect={setSelPort} links={links} />
              </div>
            </Section>
          )}

          <Section title={`Interfaces (${filteredPorts.length})`}>
            <div style={{ overflowX: 'auto' }}>
              <TableCard
                headers={['#', 'Interface', 'Alias', 'Speed', 'Status', 'In Rate', 'Out Rate']}
                rows={filteredPorts}
                renderRow={(p, i) => {
                  const isUp  = p.ifOperStatus === 'up' || p.ifOperStatus === 1;
                  const isSel = selPort?.port_id === p.port_id;
                  return (
                    <tr key={p.port_id}
                      onClick={() => setSelPort(p)}
                      style={{
                        borderTop: '1px solid #f0f2f5',
                        background: p.flapping ? '#fffbeb' : isSel ? `${accent}12` : i % 2 === 0 ? '#fff' : '#fafafa',
                        cursor: 'pointer',
                        borderLeft: p.flapping ? '3px solid #f59e0b' : isSel ? `3px solid ${accent}` : '3px solid transparent',
                      }}>
                      <TD mono>{p.ifIndex}</TD>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{p.ifName}</span>
                        {p.flapping ? (
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#d97706',
                            background: '#fef3c7', padding: '1px 6px', borderRadius: 4,
                            border: '1px solid #fde68a', verticalAlign: 'middle' }}>
                            FLAPPING
                          </span>
                        ) : null}
                      </td>
                      <TD>{p.ifAlias || '—'}</TD>
                      <TD>{fmt.speed(p.ifSpeed)}</TD>
                      <td style={{ padding: '9px 14px' }}>
                        {p.flapping ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706',
                            background: '#fef3c7', padding: '2px 8px', borderRadius: 20,
                            border: '1px solid #fde68a' }}>
                            flapping
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? '#22c55e' : '#ef4444',
                            background: isUp ? '#f0fdf4' : '#fef2f2', padding: '2px 8px', borderRadius: 20 }}>
                            {isUp ? 'up' : 'down'}
                          </span>
                        )}
                      </td>
                      <TD mono style={{ color: accent }}>{fmt.rate(p.ifInOctets_rate)}</TD>
                      <TD mono style={{ color: '#3b82f6' }}>{fmt.rate(p.ifOutOctets_rate)}</TD>
                    </tr>
                  );
                }}
              />
            </div>
          </Section>

          {/* Selected port detail */}
          {selPort && (
            <Section title={`Port Detail — ${selPort.ifName}`}>
              <div style={{ padding: 16 }}>
                <PortDetail port={selPort} accent={accent} link={linkByPortId[selPort.port_id]} />
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ── CPU ────────────────────────────────────────────────────── */}
      {tab === 'CPU' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Current usage */}
          <Section title={`CPU Cores (${processors.length}) — Avg: ${avgCpu}%`}>
            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {processors.length === 0
                ? <p style={{ color: '#9ca3af', fontSize: 12 }}>No processor data available.</p>
                : processors.map((p) => (
                    <div key={p.processor_id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#374151', marginBottom: 4 }}>
                        <span>{p.processor_descr} #{p.processor_index}</span>
                        <span style={{ fontWeight: 700, color: (p.processor_usage||0) > 80 ? '#ef4444' : '#374151' }}>{p.processor_usage || 0}%</span>
                      </div>
                      <PercentBar value={p.processor_usage || 0} warn={p.processor_perc_warn || 75} color={accent} />
                    </div>
                  ))
              }
            </div>
          </Section>

          {/* Historical chart */}
          <Section title="CPU Tarix" action={
            <div style={{ display: 'flex', gap: 4 }}>
              {['1h','6h','24h','7d'].map(r => (
                <button key={r} onClick={() => setCpuRange(r)} style={{
                  padding: '3px 10px', borderRadius: 6, border: 'none', fontSize: 11,
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  background: cpuRange === r ? accent : '#f3f4f6',
                  color: cpuRange === r ? '#fff' : '#6b7280',
                }}>{r}</button>
              ))}
            </div>
          }>
            <div style={{ padding: '12px 16px' }}>
              {cpuLoading
                ? <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>Yuklanmoqda…</div>
                : <MiniChart uid="cpu-hist" data={cpuData} unit="%" color={accent} />
              }
            </div>
          </Section>
        </div>
      )}

      {/* ── Memory ─────────────────────────────────────────────────── */}
      {tab === 'Memory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Current usage */}
          <Section title="Memory Pools">
            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {mempools.length === 0
                ? <p style={{ color: '#9ca3af', fontSize: 12 }}>No memory pool data available.</p>
                : mempools.map(m => (
                    <div key={m.mempool_id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600 }}>{m.mempool_descr}</span>
                        <span style={{ color: '#6b7280', fontSize: 11 }}>
                          {fmt.bytes(m.mempool_used)} / {fmt.bytes(m.mempool_total)}
                          <span style={{ marginLeft: 8, fontWeight: 700, color: (m.mempool_perc||0) > 85 ? '#ef4444' : '#374151' }}>
                            {m.mempool_perc || 0}%
                          </span>
                        </span>
                      </div>
                      <PercentBar value={m.mempool_perc || 0} warn={m.mempool_perc_warn || 90} color="#3b82f6" />
                    </div>
                  ))
              }
            </div>
          </Section>

          {/* Historical chart */}
          <Section title="Memory Tarix" action={
            <div style={{ display: 'flex', gap: 4 }}>
              {['1h','6h','24h','7d'].map(r => (
                <button key={r} onClick={() => setMemRange(r)} style={{
                  padding: '3px 10px', borderRadius: 6, border: 'none', fontSize: 11,
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  background: memRange === r ? '#3b82f6' : '#f3f4f6',
                  color: memRange === r ? '#fff' : '#6b7280',
                }}>{r}</button>
              ))}
            </div>
          }>
            <div style={{ padding: '12px 16px' }}>
              {memLoading
                ? <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>Yuklanmoqda…</div>
                : <MiniChart uid="mem-hist" data={memData} unit="%" color="#3b82f6" />
              }
            </div>
          </Section>
        </div>
      )}

      {/* ── Alerts ─────────────────────────────────────────────────── */}
      {tab === 'Alerts' && (
        <Section title={`Alerts (${alerts.length})`}>
          <TableCard
            headers={['Rule', 'Severity', 'State', 'Timestamp']}
            rows={alerts}
            renderRow={(a, i) => (
              <tr key={a.id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <TD bold>{a.rule?.name || a.name || '—'}</TD>
                <td style={{ padding: '9px 14px' }}><Badge status={a.severity || 'warning'} /></td>
                <td style={{ padding: '9px 14px' }}><Badge status={a.state === 1 ? 'active' : 'ok'} /></td>
                <TD>{a.timestamp || '—'}</TD>
              </tr>
            )}
          />
        </Section>
      )}

      {/* ── Eventlog ───────────────────────────────────────────────── */}
      {tab === 'Eventlog' && (
        <Section title={`Event Log (${eventlog.length})`}>
          <div style={{ padding: '8px 0' }}>
            {eventlog.length === 0
              ? <p style={{ padding: '12px 18px', color: '#9ca3af', fontSize: 12 }}>No events.</p>
              : eventlog.slice(0, 30).map((e, i) => (
                  <div key={e.event_id || i} style={{ display: 'flex', gap: 12, padding: '9px 18px',
                    borderBottom: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: '#22c55e' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#111827' }}>{e.message}</span>
                        <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0, marginLeft: 12 }}>{e.datetime}</span>
                      </div>
                    </div>
                  </div>
                ))
            }
          </div>
        </Section>
      )}

      {/* ── Metrics ────────────────────────────────────────────────── */}
      {tab === 'Metrics' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Controls */}
          <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e8ecf0', padding:'10px 16px',
            display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'#6b7280', fontWeight:600 }}>Range:</span>
            {M_PRESETS.map(p => (
              <button key={p.label} onClick={() => { setMRangeMode('preset'); setMPreset(p.label); }} style={{
                padding:'4px 12px', borderRadius:20, border:'none', fontSize:11, fontWeight:500,
                cursor:'pointer', fontFamily:'inherit',
                background: mRangeMode === 'preset' && mPreset === p.label ? accent : '#f3f4f6',
                color:       mRangeMode === 'preset' && mPreset === p.label ? '#fff' : '#6b7280',
              }}>{p.label}</button>
            ))}
            <button onClick={() => { setMRangeMode('custom'); if (!mCustomTo) { const now = new Date(); const pad = n => String(n).padStart(2,'0'); setMCustomTo(`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`); } }} style={{
              padding:'4px 12px', borderRadius:20, border:'none', fontSize:11, fontWeight:500,
              cursor:'pointer', fontFamily:'inherit',
              background: mRangeMode === 'custom' ? accent : '#f3f4f6',
              color:       mRangeMode === 'custom' ? '#fff' : '#6b7280',
            }}>Custom</button>
            {mRangeMode === 'custom' && (
              <>
                <input type="datetime-local" value={mCustomFrom} onChange={e => setMCustomFrom(e.target.value)}
                  style={{ padding:'3px 6px', fontSize:11, border:'1px solid #e5e7eb', borderRadius:6,
                    fontFamily:'inherit', outline:'none', color:'#374151', cursor:'pointer' }} />
                <span style={{ fontSize:11, color:'#9ca3af' }}>—</span>
                <input type="datetime-local" value={mCustomTo} onChange={e => setMCustomTo(e.target.value)}
                  style={{ padding:'3px 6px', fontSize:11, border:'1px solid #e5e7eb', borderRadius:6,
                    fontFamily:'inherit', outline:'none', color:'#374151', cursor:'pointer' }} />
                <button onClick={() => setMApplied(a => a+1)} disabled={!mCustomFrom || !mCustomTo || mLoading}
                  style={{ padding:'4px 12px', fontSize:11, fontWeight:600, border:'none', borderRadius:7,
                    background: (!mCustomFrom || !mCustomTo) ? '#e5e7eb' : '#10b981', color:'#fff',
                    cursor: (!mCustomFrom || !mCustomTo) ? 'default' : 'pointer', fontFamily:'inherit' }}>
                  Apply
                </button>
              </>
            )}
            {ports.length > 0 && (
              <>
                <span style={{ fontSize:11, color:'#6b7280', fontWeight:600, marginLeft:6 }}>Port:</span>
                <select
                  value={mPortId === 'all' ? 'all' : (mPortId ?? ports[0]?.port_id ?? '')}
                  onChange={e => setMPortId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  style={{ padding:'4px 8px', fontSize:11, border:'1px solid #e5e7eb', borderRadius:6,
                    fontFamily:'inherit', cursor:'pointer', outline:'none', color:'#374151' }}>
                  <option value="all">All Ports (active)</option>
                  {ports.map(p => <option key={p.port_id} value={p.port_id}>{p.ifName}</option>)}
                </select>
              </>
            )}
            <button onClick={() => mRangeMode === 'custom' ? setMApplied(a => a+1) : setMTick(t => t+1)} disabled={mLoading} style={{
              marginLeft:'auto', padding:'5px 14px', fontSize:11, fontWeight:600, border:'none',
              borderRadius:7, background:accent, color:'#fff', cursor:'pointer', fontFamily:'inherit',
              opacity: mLoading ? 0.6 : 1 }}>
              {mLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {/* 2×2 chart grid or empty state */}
          {mPortId === 'all' ? (
            // All active ports view
            (mData._allPorts || []).length === 0 ? (
              <div style={{ background:'#fff', borderRadius:10, border:'1px dashed #e8ecf0', padding:40, textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:600, color:'#374151', marginBottom:8 }}>Aktiv portlar topilmadi</div>
                <div style={{ fontSize:12, color:'#9ca3af' }}>Hozirda trafik o'tayotgan portlar yo'q.</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {(mData._allPorts || []).map(portData => {
                  const portObj = ports.find(p => p.port_id === portData.portId);
                  const inRate  = portObj ? fmt.rate(portObj.ifInOctets_rate)  : '—';
                  const outRate = portObj ? fmt.rate(portObj.ifOutOctets_rate) : '—';
                  return (
                    <div key={portData.portId} style={{ background:'#fff', borderRadius:10, border:'1px solid #e8ecf0', padding:'12px 14px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                        <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{portData.portName}</span>
                        <div style={{ display:'flex', gap:12, fontSize:11 }}>
                          <span style={{ color:'#3b82f6', fontWeight:600 }}>↓ {inRate}</span>
                          <span style={{ color:'#8b5cf6', fontWeight:600 }}>↑ {outRate}</span>
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                        {[
                          { type:'port_in',  label:'Traffic In',  color:'#3b82f6', unit:'Bps' },
                          { type:'port_out', label:'Traffic Out', color:'#8b5cf6', unit:'Bps' },
                        ].map(mt => {
                          const rows = portData[mt.type] ?? [];
                          const last = rows.length > 0 ? rows[rows.length-1]?.value : null;
                          return (
                            <div key={mt.type}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                                <span style={{ fontSize:11, fontWeight:600, color:'#374151' }}>{mt.label}</span>
                                {last !== null && <span style={{ fontSize:11, fontWeight:700, color:mt.color }}>{mFmt(last, mt.unit)}</span>}
                              </div>
                              <MiniChart uid={`${portData.portId}-${mt.type}`} data={rows} unit={mt.unit} color={mt.color} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : Object.keys(mData).length === 0 || M_DEFS.every(mt => (mData[mt.type] ?? []).length === 0) ? (
            <div style={{ background:'#fff', borderRadius:10, border:'1px dashed #e8ecf0', padding:40, textAlign:'center' }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#374151', marginBottom:8 }}>Ma'lumot topilmadi</div>
              <div style={{ fontSize:12, color:'#9ca3af' }}>Ushbu qurilma (ayniqsa kameralar) standart CPU, Memory va Port metrikalarini doimiy uzatmasligi mumkin.</div>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              {M_DEFS.map(mt => {
                const rows = mData[mt.type] ?? [];
                if (rows.length === 0) return null; // Hide empty charts
                const last = rows.length > 0 ? rows[rows.length-1]?.value : null;
                return (
                  <div key={mt.type} style={{ background:'#fff', borderRadius:10, border:'1px solid #e8ecf0', padding:'12px 14px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:'#111827' }}>{mt.label}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        {last !== null && (
                          <span style={{ fontSize:12, fontWeight:700, color: mt.color }}>{mFmt(last, mt.unit)}</span>
                        )}
                        <span style={{ fontSize:10, color:'#9ca3af' }}>{rows.length} pts</span>
                      </div>
                    </div>
                    <MiniChart uid={`${mt.type}-${devId}`} data={rows} unit={mt.unit} color={mt.color} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Stats summary row */}
          {mPortId !== 'all' && Object.keys(mData).length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
              {M_DEFS.map(mt => {
                const rows = mData[mt.type] ?? [];
                if (!rows.length) return null;
                const vals = rows.map(r => Number(r.value));
                const avg  = vals.reduce((a,b)=>a+b,0)/vals.length;
                const max  = Math.max(...vals);
                const min  = Math.min(...vals);
                return (
                  <div key={mt.type} style={{ background:'#fff', borderRadius:10, border:'1px solid #e8ecf0', padding:'12px 16px' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>{mt.label}</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      {[['Avg', avg], ['Max', max], ['Min', min]].map(([lbl, val]) => (
                        <div key={lbl} style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
                          <span style={{ color:'#6b7280' }}>{lbl}</span>
                          <span style={{ fontWeight:600, color: lbl==='Max' ? mt.color : '#374151' }}>{mFmt(val, mt.unit)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Inventory ──────────────────────────────────────────────── */}
      {tab === 'Inventory' && (
        <Section title={`Hardware Inventory${inventory.length ? ` (${inventory.length})` : ''}`}>
          {invLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading...</div>
          ) : inventory.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
              No inventory data available for this device.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Name', 'Description', 'Class', 'Model', 'Serial', 'Manufacturer', 'FW Rev'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, color: '#6b7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1px solid #f0f2f5' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item, i) => (
                    <tr key={item.entPhysicalIndex ?? i} style={{ borderBottom: '1px solid #f9fafb', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#111827' }}>{item.entPhysicalName || '—'}</td>
                      <td style={{ padding: '8px 14px', fontSize: 11, color: '#374151', maxWidth: 240, wordBreak: 'break-word' }}>{item.entPhysicalDescr || '—'}</td>
                      <td style={{ padding: '8px 14px', fontSize: 11, color: '#6b7280' }}>
                        <span style={{ background: '#f3f4f6', padding: '2px 7px', borderRadius: 4, fontFamily: 'monospace', fontSize: 10 }}>
                          {item.entPhysicalClass || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 14px', fontSize: 11, color: '#374151', fontFamily: 'monospace' }}>{item.entPhysicalModelName || '—'}</td>
                      <td style={{ padding: '8px 14px', fontSize: 11, color: '#374151', fontFamily: 'monospace' }}>{item.entPhysicalSerialNum || '—'}</td>
                      <td style={{ padding: '8px 14px', fontSize: 11, color: '#374151' }}>{item.entPhysicalMfgName || '—'}</td>
                      <td style={{ padding: '8px 14px', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{item.entPhysicalFirmwareRev || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* ── Health ─────────────────────────────────────────────────── */}
      {tab === 'Health' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {healthLoading ? (
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
              Loading health data...
            </div>
          ) : !health || !health.health || (Array.isArray(health.health) && health.health.length === 0) ? (
            <div style={{ background: '#fff', borderRadius: 10, border: '1px dashed #e8ecf0', padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>No Health Sensors</div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>This device does not report SNMP health sensors (temperature, voltage, fans, etc.).</div>
            </div>
          ) : (
            <>
              {/* If response is a list of type strings */}
              {Array.isArray(health.health) && typeof health.health[0] === 'string' && (
                <Section title="Available Health Sensor Types">
                  <div style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {health.health.map(type => (
                      <span key={type} style={{ background: `${accent}15`, color: accent, fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20, textTransform: 'capitalize' }}>
                        {type}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {/* If response contains sensor objects */}
              {Array.isArray(health.health) && typeof health.health[0] === 'object' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 12 }}>
                  {health.health.map((sensor, i) => {
                    const pct  = sensor.sensor_limit > 0 ? Math.min(100, Math.round((sensor.sensor_current / sensor.sensor_limit) * 100)) : null;
                    const warn = pct !== null && sensor.sensor_limit_warn ? Math.round((sensor.sensor_limit_warn / sensor.sensor_limit) * 100) : 75;
                    const barColor = pct !== null ? (pct >= warn ? '#ef4444' : pct >= 50 ? '#f59e0b' : accent) : accent;
                    return (
                      <div key={sensor.sensor_id ?? i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '14px 16px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                          {sensor.sensor_class || 'Sensor'}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                          {sensor.sensor_descr || `Sensor #${sensor.sensor_id}`}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: barColor, marginBottom: 8 }}>
                          {sensor.sensor_current ?? '—'}
                          {sensor.sensor_class === 'temperature' ? ' °C' : sensor.sensor_class === 'voltage' ? ' V' : sensor.sensor_class === 'fanspeed' ? ' RPM' : ''}
                        </div>
                        {pct !== null && (
                          <div style={{ background: '#f0f2f5', borderRadius: 4, height: 5 }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: barColor, transition: 'width 0.4s' }} />
                          </div>
                        )}
                        {(sensor.sensor_limit || sensor.sensor_limit_warn) && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: '#9ca3af' }}>
                            <span>Warn: {sensor.sensor_limit_warn ?? '—'}</span>
                            <span>Limit: {sensor.sensor_limit ?? '—'}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Raw data fallback */}
              {(!Array.isArray(health.health) || health.health.length === 0) && health.count === 0 && (
                <div style={{ background: '#fff', borderRadius: 10, border: '1px dashed #e8ecf0', padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                  No sensors reported by this device.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Graphs ─────────────────────────────────────────────────── */}
      {tab === 'Graphs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TimeRangeBar value={timeRange} onChange={setTimeRange} accent={accent} />

          <Section title="Device Metrics">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 16 }}>
              {DEVICE_GRAPHS.map(({ type, label }) => (
                <div key={type}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</div>
                  <GraphImg src={gUrl(type, devId)} alt={label} />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Interface Graphs">
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Interface:</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {ports.map(p => {
                  const isUp  = p.ifOperStatus === 'up' || p.ifOperStatus === 1;
                  const isSel = selPort?.port_id === p.port_id;
                  return (
                    <button key={p.port_id} onClick={() => setSelPort(p)} style={{
                      padding: '3px 10px', borderRadius: 20, border: '1px solid',
                      fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                      background: isSel ? accent : '#fff',
                      color: isSel ? '#fff' : (isUp ? '#374151' : '#ef4444'),
                      borderColor: isSel ? accent : (isUp ? '#e5e7eb' : '#fecaca'),
                    }}>{p.ifName}</button>
                  );
                })}
              </div>
            </div>
            {selPort ? (
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                  {selPort.ifName}
                  {selPort.ifAlias && <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>{selPort.ifAlias}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {PORT_GRAPHS.map(({ type, label }) => (
                    <div key={type}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</div>
                      <GraphImg src={gUrl(type, selPort.port_id)} alt={label} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ padding: '16px 18px', color: '#9ca3af', fontSize: 12 }}>Select an interface above.</p>
            )}
          </Section>
        </div>
      )}
    </div>
  );
};

export default DeviceDetailsPage;
