import { useState, useEffect } from 'react';
import { PageHeader, StatCard, Badge, TableCard, TD } from '../components/Charts';
import {
  getDeviceDetails, getDevicePorts, getDeviceProcessors,
  getDeviceMempools, getDeviceAlerts, getDeviceEventlog,
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
  speed: (bps) => !bps ? 'N/A' : `${Math.round(bps / 1e6)} Mbps`,
};

const TIME_RANGES = [
  { label: '1h',  value: '-1h' },
  { label: '6h',  value: '-6h' },
  { label: '24h', value: '-1d' },
  { label: '7d',  value: '-1w' },
  { label: '30d', value: '-1M' },
];

const TABS = ['Overview', 'Interfaces', 'CPU', 'Memory', 'Alerts', 'Eventlog', 'Graphs'];

const Section = ({ title, children }) => (
  <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' }}>
    <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0f2f5', background: '#f9fafb' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{title}</span>
    </div>
    {children}
  </div>
);

const KV = ({ label, value, mono }) => (
  <div style={{ display: 'flex', padding: '9px 18px', borderBottom: '1px solid #f9fafb' }}>
    <div style={{ width: 160, fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>{label}</div>
    <div style={{ flex: 1, fontSize: 12, color: '#111827', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value ?? 'N/A'}</div>
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

// ─── Graph image with loading skeleton + error fallback ───────────
const GraphImg = ({ src, alt }) => {
  const [status, setStatus] = useState('loading'); // loading | ok | error
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
      <img
        src={src}
        alt={alt}
        onLoad={() => setStatus('ok')}
        onError={() => setStatus('error')}
        style={{ width: '100%', display: status === 'ok' ? 'block' : 'none', borderRadius: 6 }}
      />
    </div>
  );
};

// ─── Time range selector ──────────────────────────────────────────
const TimeRangeBar = ({ value, onChange, accent }) => (
  <div style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '8px 12px', alignItems: 'center' }}>
    <span style={{ fontSize: 11, color: '#6b7280', marginRight: 6 }}>Period:</span>
    {TIME_RANGES.map(r => (
      <button key={r.value} onClick={() => onChange(r.value)} style={{
        padding: '4px 12px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit',
        background: value === r.value ? accent : '#f3f4f6',
        color: value === r.value ? '#fff' : '#6b7280',
        transition: 'background 0.15s',
      }}>{r.label}</button>
    ))}
  </div>
);

const DeviceDetailsPage = ({ hostname, onBack, accent }) => {
  const [device,    setDevice]    = useState(null);
  const [ports,     setPorts]     = useState([]);
  const [processors,setProcs]     = useState([]);
  const [mempools,  setMems]      = useState([]);
  const [alerts,    setAlerts]    = useState([]);
  const [eventlog,  setEventlog]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('Overview');
  const [timeRange, setTimeRange] = useState('-1d');
  const [selPort,   setSelPort]   = useState(null); // selected port for graph

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getDeviceDetails(hostname),
      getDevicePorts(hostname),
      getDeviceProcessors(hostname),
      getDeviceMempools(hostname),
      getDeviceAlerts(hostname),
      getDeviceEventlog(hostname),
    ]).then(([dev, p, procs, mems, alts, logs]) => {
      setDevice(dev);
      setPorts(p);
      setProcs(procs);
      setMems(mems);
      setAlerts(alts);
      setEventlog(logs);
      // default: first up port
      const firstUp = p.find(pt => pt.ifOperStatus === 'up');
      setSelPort(firstUp || p[0] || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [hostname]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading SNMP data...</div>;
  if (!device)  return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Device not found.</div>;

  const avgCpu = processors.length
    ? Math.round(processors.reduce((a, b) => a + (b.processor_usage || 0), 0) / processors.length) : 0;
  const ram = mempools.find(m => m.mempool_class === 'system') || mempools[0];
  const portsUp      = ports.filter(p => p.ifOperStatus === 'up').length;
  const activeAlerts = alerts.filter(a => a.state === 1);
  const devId        = device.device_id;

  // Build graph URL helper
  const gUrl = (type, id, extra = '') =>
    `/graph?type=${type}&id=${id}&from=${timeRange}&to=now&width=600&height=200&legend=yes${extra}`;

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
            {device.notes && (
              <div style={{ marginTop: 12 }}>
                <Section title="Notes">
                  <p style={{ padding: '12px 18px', fontSize: 12, color: '#6b7280', lineHeight: 1.5, margin: 0 }}>{device.notes}</p>
                </Section>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Interfaces ─────────────────────────────────────────────── */}
      {tab === 'Interfaces' && (
        <Section title={`Interfaces (${ports.length})`}>
          <div style={{ overflowX: 'auto' }}>
            <TableCard
              headers={['Index', 'Interface', 'Alias', 'Speed', 'Status', 'In', 'Out']}
              rows={ports}
              renderRow={(p, i) => (
                <tr key={p.port_id} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <TD mono>{p.ifIndex}</TD>
                  <TD bold>{p.ifName}</TD>
                  <TD>{p.ifAlias}</TD>
                  <TD>{fmt.speed(p.ifSpeed)}</TD>
                  <td style={{ padding: '9px 14px' }}><Badge status={p.ifOperStatus === 'up' ? 'up' : 'down'} /></td>
                  <TD mono>{fmt.bytes((p.ifInOctets_rate || 0) * 8)}/s</TD>
                  <TD mono>{fmt.bytes((p.ifOutOctets_rate || 0) * 8)}/s</TD>
                </tr>
              )}
            />
          </div>
        </Section>
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
                        {fmt.bytes(m.mempool_used)} used / {fmt.bytes(m.mempool_total)} total
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
                  <div key={e.event_id || i} style={{ display: 'flex', gap: 12, padding: '9px 18px', borderBottom: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
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

          {/* Device metric graphs */}
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

          {/* Port graphs */}
          <Section title="Interface Graphs">
            {/* Port selector */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Interface:</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {ports.map(p => (
                  <button key={p.port_id} onClick={() => setSelPort(p)} style={{
                    padding: '3px 10px', borderRadius: 20, border: '1px solid',
                    fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                    background: selPort?.port_id === p.port_id ? accent : '#fff',
                    color: selPort?.port_id === p.port_id ? '#fff' : '#374151',
                    borderColor: selPort?.port_id === p.port_id ? accent : '#e5e7eb',
                  }}>{p.ifName}</button>
                ))}
              </div>
            </div>

            {selPort ? (
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                  {selPort.ifName}
                  {selPort.ifAlias && <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>{selPort.ifAlias}</span>}
                  <Badge status={selPort.ifOperStatus === 'up' ? 'up' : 'down'} />
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
              <p style={{ padding: '16px 18px', color: '#9ca3af', fontSize: 12 }}>No ports available.</p>
            )}
          </Section>
        </div>
      )}
    </div>
  );
};

export default DeviceDetailsPage;
