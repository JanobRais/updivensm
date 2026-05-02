import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getDevices, getAlerts, getPorts, getPollers, getServices, getLogs,
  getDeviceProcessors, getDeviceMempools,
} from '../api';
import { StatCard, Badge, Icon, AreaChartSVG, DonutChartSVG } from '../components/Charts';

const REFRESH_MS   = 60_000;
const HISTORY_LEN  = 20;

const fmtBps = (rate) => {
  if (!rate) return '0';
  const b = rate * 8;
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' Gbps';
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' Mbps';
  if (b >= 1e3) return (b / 1e3).toFixed(1) + ' Kbps';
  return b + ' bps';
};

const Skeleton = ({ w = '100%', h = 14, radius = 4 }) => (
  <div style={{ width: w, height: h, borderRadius: radius, background: 'linear-gradient(90deg,#f0f2f5 25%,#e8ecf0 50%,#f0f2f5 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
);

const DashboardPage = ({ accent }) => {
  const [devices,        setDevices]        = useState(null);   // null = loading
  const [alerts,         setAlerts]         = useState(null);
  const [ports,          setPorts]          = useState(null);
  const [pollers,        setPollers]        = useState(null);
  const [services,       setServices]       = useState(null);
  const [events,         setEvents]         = useState(null);
  const [cpu,            setCpu]            = useState(null);
  const [ram,            setRam]            = useState(null);
  const [topCpu,         setTopCpu]         = useState(null);
  const [trafficHistory, setTrafficHistory] = useState([]);
  const [countdown,      setCountdown]      = useState(REFRESH_MS / 1000);
  const trafficRef = useRef([]);

  // Each source loads independently — UI shows data as it arrives
  const fetchAll = useCallback(() => {
    setCountdown(REFRESH_MS / 1000);

    // ── Critical path: devices, alerts, ports ──────────────────────
    getDevices().then(devs => {
      setDevices(devs);
      if (!devs.length) return;

      // After devices: per-device CPU (lazy, non-blocking)
      const first = devs[0].hostname;
      getDeviceProcessors(first)
        .then(procs => setCpu(procs.length
          ? Math.round(procs.reduce((a, b) => a + (b.processor_usage || 0), 0) / procs.length) : 0))
        .catch(() => setCpu(0));

      getDeviceMempools(first)
        .then(mems => { const p = mems.find(m => m.mempool_class === 'system') || mems[0]; setRam(p ? p.mempool_perc : 0); })
        .catch(() => setRam(0));

      Promise.all(
        devs.slice(0, 8).map(d =>
          getDeviceProcessors(d.hostname)
            .then(procs => ({ hostname: d.sysName || d.hostname, cpu: procs.length ? Math.round(procs.reduce((a, b) => a + (b.processor_usage || 0), 0) / procs.length) : 0 }))
            .catch(() => ({ hostname: d.sysName || d.hostname, cpu: 0 }))
        )
      ).then(res => setTopCpu(res.sort((a, b) => b.cpu - a.cpu)));
    }).catch(() => setDevices([]));

    getAlerts().then(setAlerts).catch(() => setAlerts([]));

    getPorts().then(pts => {
      setPorts(pts);
      const totalIn  = pts.reduce((s, p) => s + (p.ifInOctets_rate  || 0), 0);
      const totalOut = pts.reduce((s, p) => s + (p.ifOutOctets_rate || 0), 0);
      const now = new Date();
      const label = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      trafficRef.current = [
        ...trafficRef.current.slice(-(HISTORY_LEN - 1)),
        { time: label, in: Math.round(totalIn * 8 / 1000), out: Math.round(totalOut * 8 / 1000) },
      ];
      setTrafficHistory([...trafficRef.current]);
    }).catch(() => setPorts([]));

    // ── Secondary: pollers, services ──────────────────────────────
    getPollers().then(setPollers).catch(() => setPollers([]));
    getServices().then(setServices).catch(() => setServices([]));

    // ── Lazy: event log (heaviest, loads last) ────────────────────
    getLogs(30).then(setEvents).catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    fetchAll();
    const refreshTimer   = setInterval(fetchAll, REFRESH_MS);
    const countdownTimer = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => { clearInterval(refreshTimer); clearInterval(countdownTimer); };
  }, [fetchAll]);

  // Derived values (safe with null guards)
  const upDevices    = (devices || []).filter(d => d.status === 1 || d.status === 'up').length;
  const downDevices  = (devices || []).filter(d => d.status === 0 || d.status === 'down').length;
  const warnDevices  = Math.max(0, (devices || []).length - upDevices - downDevices);
  const portsUp      = (ports || []).filter(p => p.ifOperStatus === 'up').length;
  const portsDown    = (ports || []).filter(p => p.ifOperStatus === 'down').length;
  const activeAlerts = (alerts || []).filter(a => a.state === 1);

  const topPorts = [...(ports || [])]
    .sort((a, b) => ((b.ifInOctets_rate || 0) + (b.ifOutOctets_rate || 0)) - ((a.ifInOctets_rate || 0) + (a.ifOutOctets_rate || 0)))
    .slice(0, 8);

  const deviceStatusData = [
    { name: 'Up',      value: upDevices  || (devices?.length ? 0 : 1), color: '#22c55e' },
    { name: 'Warning', value: warnDevices, color: '#f59e0b' },
    { name: 'Down',    value: downDevices, color: '#ef4444' },
  ];

  const lastTraffic = trafficHistory[trafficHistory.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @keyframes shimmer { to { background-position: -200% 0; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 2 }}>Dashboard</h1>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Network overview — live SNMP data</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={fetchAll} style={{
            background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 7,
            padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 5, color: '#374151',
          }}>
            <Icon name="refresh" size={11} color="#6b7280" /> Refresh
          </button>
          <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 8, padding: '6px 12px', fontSize: 11, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="clock" size={12} color="#6b7280" />
            Next: {countdown}s
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent, animation: 'pulse 2s infinite' }} />
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {devices === null
          ? Array.from({ length: 6 }, (_, i) => (
              <div key={i} style={{ flex: '1 1 130px', minWidth: 120, background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Skeleton w="60%" h={10} /><Skeleton w="40%" h={22} /><Skeleton w="70%" h={9} />
              </div>
            ))
          : <>
              <StatCard label="Devices" value={`${upDevices}/${devices.length}`} icon="server" color={accent}
                subtext={downDevices > 0 ? `${downDevices} down` : 'All reachable'} trend={downDevices > 0 ? 'down' : 'up'} />
              <StatCard label="Ports Up" value={`${portsUp}/${(ports||[]).length}`} icon="wifi" color="#3b82f6" subtext={`${portsDown} down`} />
              <StatCard label="Active Alerts" value={activeAlerts.length} icon="alerts" color="#ef4444"
                subtext={activeAlerts.length ? 'Needs attention' : 'All clear'} trend={activeAlerts.length > 0 ? 'up' : 'down'} />
              <StatCard label="Services" value={services === null ? '—' : services.length} icon="services" color="#10b981" subtext="Monitored" />
              <StatCard label="Avg CPU" value={cpu === null ? '—' : cpu + '%'} icon="pollers" color="#8b5cf6" subtext="First device" trend={cpu > 70 ? 'up' : 'down'} />
              <StatCard label="Avg RAM" value={ram === null ? '—' : ram + '%'} icon="database" color="#f59e0b" subtext="First device" trend={ram > 80 ? 'up' : 'down'} />
            </>
        }
      </div>

      {/* Traffic + Device Donut */}
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 2, background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Aggregate Network Traffic</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Sum of all ports (Kbps) — sampled every 60s</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 10 }}>
              {[['In', accent], ['Out', '#3b82f6']].map(([l, c]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280' }}>
                  <span style={{ width: 10, height: 2, background: c, display: 'inline-block', borderRadius: 1 }} />{l}
                </span>
              ))}
            </div>
          </div>

          {trafficHistory.length >= 2
            ? <AreaChartSVG data={trafficHistory} keys={['in', 'out']} colors={[accent, '#3b82f6']} height={160} />
            : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>
                {ports === null ? 'Loading port data...' : 'Collecting first sample... (' + countdown + 's)'}
              </div>
          }
          {lastTraffic && (
            <div style={{ display: 'flex', gap: 24, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f2f5' }}>
              <span style={{ fontSize: 11, color: '#6b7280' }}>In: <strong style={{ color: accent }}>{lastTraffic.in} Kbps</strong></span>
              <span style={{ fontSize: 11, color: '#6b7280' }}>Out: <strong style={{ color: '#3b82f6' }}>{lastTraffic.out} Kbps</strong></span>
              <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{trafficHistory.length} samples</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 2 }}>Device Status</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>Reachability</div>
          {devices === null
            ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0' }}>
                <Skeleton w="100%" h={120} radius={8} />
              </div>
            : <>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <DonutChartSVG data={deviceStatusData} size={120} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  {[['Devices Up', upDevices, '#22c55e'], ['Devices Down', downDevices, '#ef4444'], ['Devices Warn', warnDevices, '#f59e0b']].map(([l, v, c]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#374151' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid #f0f2f5', paddingTop: 8, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[['Ports Up', portsUp, '#22c55e'], ['Ports Down', portsDown, '#ef4444'], ['Pollers', (pollers||[]).length, '#111827']].map(([l, v, c]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280' }}>
                        <span>{l}</span><span style={{ fontWeight: 600, color: c }}>{ports === null && l !== 'Pollers' ? '—' : v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
          }
        </div>
      </div>

      {/* Top Interfaces + Device CPU */}
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 3, background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Top Interfaces by Traffic</span>
            <span style={{ fontSize: 10, color: '#9ca3af' }}>
              {ports === null ? 'Loading...' : `${portsUp} up · ${portsDown} down · ${ports.length} total`}
            </span>
          </div>
          {ports === null
            ? <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1,2,3,4].map(i => <Skeleton key={i} h={20} />)}
              </div>
            : <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Interface','Alias','Speed','Status','In','Out','Util'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 600, color: '#6b7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topPorts.length === 0
                      ? <tr><td colSpan={7} style={{ padding: '20px 18px', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>No port data</td></tr>
                      : topPorts.map((p, i) => {
                          const total = (p.ifInOctets_rate || 0) + (p.ifOutOctets_rate || 0);
                          const util = p.ifSpeed ? Math.min(Math.round(total / p.ifSpeed * 100 / 2), 100) : 0;
                          const barColor = util > 70 ? '#ef4444' : util > 40 ? '#f59e0b' : accent;
                          return (
                            <tr key={p.port_id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                              <td style={{ padding: '9px 14px', fontSize: 11, fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>{p.ifName}</td>
                              <td style={{ padding: '9px 14px', fontSize: 11, color: '#6b7280' }}>{p.ifAlias || '—'}</td>
                              <td style={{ padding: '9px 14px', fontSize: 11, color: '#374151' }}>{p.ifSpeed ? Math.round(p.ifSpeed / 1e6) + 'M' : '—'}</td>
                              <td style={{ padding: '9px 14px' }}><Badge status={p.ifOperStatus === 'up' ? 'up' : 'down'} /></td>
                              <td style={{ padding: '9px 14px', fontSize: 11, fontFamily: 'monospace', color: '#374151' }}>{fmtBps(p.ifInOctets_rate)}</td>
                              <td style={{ padding: '9px 14px', fontSize: 11, fontFamily: 'monospace', color: '#374151' }}>{fmtBps(p.ifOutOctets_rate)}</td>
                              <td style={{ padding: '9px 14px', minWidth: 100 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ flex: 1, background: '#f0f2f5', borderRadius: 4, height: 5 }}>
                                    <div style={{ width: `${util}%`, height: '100%', borderRadius: 4, background: barColor, transition: 'width 0.4s' }} />
                                  </div>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: barColor, minWidth: 26 }}>{util}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>
          }
        </div>

        <div style={{ flex: 2, background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0f2f5' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Device CPU Usage</span>
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {topCpu === null
              ? [1,2,3].map(i => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Skeleton w="60%" h={10} /><Skeleton h={7} />
                  </div>
                ))
              : topCpu.length === 0
                ? <p style={{ color: '#9ca3af', fontSize: 12 }}>No CPU data</p>
                : topCpu.map((d, i) => {
                    const barColor = d.cpu >= 80 ? '#ef4444' : d.cpu >= 60 ? '#f59e0b' : '#22c55e';
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                          <span style={{ color: '#374151', fontWeight: 500 }}>{d.hostname}</span>
                          <span style={{ fontWeight: 700, color: barColor }}>{d.cpu}%</span>
                        </div>
                        <div style={{ background: '#f0f2f5', borderRadius: 4, height: 7 }}>
                          <div style={{ width: `${d.cpu}%`, height: '100%', borderRadius: 4, background: barColor, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    );
                  })
            }
          </div>
        </div>
      </div>

      {/* Recent Alerts + Event Log */}
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 3, background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Recent Alerts</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: activeAlerts.length > 0 ? '#ef4444' : '#9ca3af' }}>
              {alerts === null ? '...' : `${activeAlerts.length} active`}
            </span>
          </div>
          {alerts === null
            ? <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1,2,3].map(i => <Skeleton key={i} h={18} />)}
              </div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Device','Rule','Severity','State','Time'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 600, color: '#6b7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alerts.length === 0
                    ? <tr><td colSpan={5} style={{ padding: '20px 18px', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>No alerts</td></tr>
                    : alerts.slice(0, 6).map((a, i) => (
                        <tr key={a.id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '9px 14px', fontSize: 11, color: '#111827', fontWeight: 500 }}>{a.hostname || '—'}</td>
                          <td style={{ padding: '9px 14px', fontSize: 11, color: '#374151' }}>{a.rule?.name || a.rule || '—'}</td>
                          <td style={{ padding: '9px 14px' }}><Badge status={a.severity || 'warning'} /></td>
                          <td style={{ padding: '9px 14px' }}><Badge status={a.state === 1 ? 'active' : 'ok'} /></td>
                          <td style={{ padding: '9px 14px', fontSize: 10, color: '#9ca3af' }}>{a.timestamp || '—'}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
          }
        </div>

        <div style={{ flex: 2, background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Event Log</span>
            <span style={{ fontSize: 10, color: '#9ca3af' }}>
              {events === null ? 'Loading...' : `${events.length} recent`}
            </span>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {events === null
              ? <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[1,2,3,4].map(i => <Skeleton key={i} h={14} />)}
                </div>
              : events.length === 0
                ? <p style={{ padding: '12px 18px', color: '#9ca3af', fontSize: 12 }}>No events</p>
                : events.slice(0, 12).map((e, i) => (
                    <div key={e.event_id || i} style={{
                      padding: '8px 18px', borderBottom: '1px solid #f9fafb',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      background: i % 2 === 0 ? '#fff' : '#fafafa',
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0, marginTop: 4 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.message || e.text || '—'}
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                          {e.hostname && <span style={{ marginRight: 6 }}>{e.hostname}</span>}
                          {e.datetime || ''}
                        </div>
                      </div>
                    </div>
                  ))
            }
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
