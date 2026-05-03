import { useState, useEffect } from 'react';
import { PageHeader, StatCard, Badge, TableCard, TD } from '../components/Charts';
import {
  getDeviceDetails, getDevicePorts, getDeviceProcessors,
  getDeviceMempools, getDeviceAlerts, getDeviceEventlog, getDeviceLinks,
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

const TABS = ['Overview', 'Interfaces', 'CPU', 'Memory', 'Alerts', 'Eventlog', 'Graphs'];

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
  // 2 rows for >12 ports (like real switches: 48-port = 2×24, 24-port = 2×12)
  const ROW = ports.length <= 12 ? ports.length : Math.ceil(ports.length / 2);
  // Map: port_id → link object (remote_hostname, remote_port)
  const linkMap = {};
  links.forEach(l => { linkMap[l.local_port_id] = l; });

  const rows = [];
  for (let i = 0; i < ports.length; i += ROW) rows.push(ports.slice(i, i + ROW).map((p, j) => ({ ...p, _slot: i + j + 1 })));

  const portColor = (p) => {
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
  const util    = port.ifSpeed
    ? Math.min(100, Math.round(((port.ifInOctets_rate || 0) + (port.ifOutOctets_rate || 0)) * 8 / port.ifSpeed * 100))
    : 0;

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
          ['Util',  util + '%', util > 80 ? '#ef4444' : util > 50 ? '#f59e0b' : '#22c55e'],
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

  useEffect(() => {
    setLoading(true);
    setSelPort(null);
    const safe = (promise, fallback) => promise.catch(() => fallback);
    Promise.all([
      getDeviceDetails(hostname),
      safe(getDevicePorts(hostname),      []),
      safe(getDeviceProcessors(hostname), []),
      safe(getDeviceMempools(hostname),   []),
      safe(getDeviceAlerts(hostname),     []),
      safe(getDeviceEventlog(hostname),   []),
      safe(getDeviceLinks(hostname),      []),
    ]).then(([dev, p, procs, mems, alts, logs, lks]) => {
      setDevice(dev);
      setPorts(p);
      setProcs(procs);
      setMems(mems);
      setAlerts(alts);
      setEventlog(logs);
      setLinks(lks);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [hostname]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <PageHeader
        title={device.sysName || device.hostname}
        desc={`${device.hardware || device.os || ''} · ${device.ip}`}
        action={
          <button onClick={onBack} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>
            ← Back
          </button>
        }
      />

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard label="Status"        value={device.status ? 'UP' : 'DOWN'} icon="checkCircle" color={device.status ? '#22c55e' : '#ef4444'} />
        <StatCard label="Uptime"        value={fmt.uptime(device.uptime)}      icon="clock"       color="#f59e0b" />
        <StatCard label="CPU Avg"       value={avgCpu + '%'}                   icon="activity"    color="#8b5cf6" subtext={`${processors.length} cores`} />
        <StatCard label="RAM"           value={ram ? ram.mempool_perc + '%' : 'N/A'} icon="database" color="#3b82f6"
          subtext={ram ? `${fmt.bytes(ram.mempool_used)} / ${fmt.bytes(ram.mempool_total)}` : ''} />
        <StatCard label="Ports Up"      value={`${portsUp}/${ports.length}`}   icon="wifi"        color={accent} />
        <StatCard label="Active Alerts" value={activeAlerts.length}            icon="alerts"      color={activeAlerts.length > 0 ? '#ef4444' : '#22c55e'} />
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '8px 12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
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

          {/* Switch Front Panel + Port Detail */}
          {ports.length > 0 && (
            <Section title={`Switch Panel — ${device.sysName || device.hostname}`}>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SwitchPanel ports={ports} selectedPort={selPort} onSelect={setSelPort} links={links} />
                <PortDetail port={selPort} accent={accent} link={selPort ? linkByPortId[selPort.port_id] : null} />
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
            <Section title="Port Panel — click a port to highlight">
              <div style={{ padding: 14 }}>
                <SwitchPanel ports={ports} selectedPort={selPort} onSelect={setSelPort} links={links} />
              </div>
            </Section>
          )}

          <Section title={`Interfaces (${ports.length})`}>
            <div style={{ overflowX: 'auto' }}>
              <TableCard
                headers={['#', 'Interface', 'Alias', 'Speed', 'Status', 'In Rate', 'Out Rate']}
                rows={ports}
                renderRow={(p, i) => {
                  const isUp  = p.ifOperStatus === 'up' || p.ifOperStatus === 1;
                  const isSel = selPort?.port_id === p.port_id;
                  return (
                    <tr key={p.port_id}
                      onClick={() => setSelPort(p)}
                      style={{
                        borderTop: '1px solid #f0f2f5',
                        background: isSel ? `${accent}12` : i % 2 === 0 ? '#fff' : '#fafafa',
                        cursor: 'pointer',
                        borderLeft: isSel ? `3px solid ${accent}` : '3px solid transparent',
                      }}>
                      <TD mono>{p.ifIndex}</TD>
                      <TD bold>{p.ifName}</TD>
                      <TD>{p.ifAlias || '—'}</TD>
                      <TD>{fmt.speed(p.ifSpeed)}</TD>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? '#22c55e' : '#ef4444',
                          background: isUp ? '#f0fdf4' : '#fef2f2', padding: '2px 8px', borderRadius: 20 }}>
                          {isUp ? 'up' : 'down'}
                        </span>
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
        <Section title={`CPU Cores (${processors.length}) — Avg: ${avgCpu}%`}>
          <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {processors.length === 0
              ? <p style={{ color: '#9ca3af', fontSize: 12 }}>No processor data available.</p>
              : processors.map((p) => (
                  <div key={p.processor_id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#374151', marginBottom: 4 }}>
                      <span>{p.processor_descr} #{p.processor_index}</span>
                    </div>
                    <PercentBar value={p.processor_usage || 0} warn={p.processor_perc_warn || 75} color={accent} />
                  </div>
                ))
            }
          </div>
        </Section>
      )}

      {/* ── Memory ─────────────────────────────────────────────────── */}
      {tab === 'Memory' && (
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
                      </span>
                    </div>
                    <PercentBar value={m.mempool_perc || 0} warn={m.mempool_perc_warn || 90} color="#3b82f6" />
                  </div>
                ))
            }
          </div>
        </Section>
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
