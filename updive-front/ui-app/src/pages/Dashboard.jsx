import { useState, useEffect, useRef, useCallback } from 'react';
import { getDevices, getAlerts, getPorts, getLogs, getDeviceRelationships } from '../api';

const REFRESH_MS = 60_000;

// ─── Helpers ──────────────────────────────────────────────────────
const fmtMbps = (r) => {
  if (!r) return 0;
  const b = r * 8;
  if (b >= 1e9) return +(b / 1e9).toFixed(1);
  if (b >= 1e6) return +(b / 1e6).toFixed(1);
  return +(b / 1e3).toFixed(0);
};
const fmtMbpsLabel = (r) => {
  if (!r) return '0';
  const b = r * 8;
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' Gbps';
  if (b >= 1e6) return (b / 1e6).toFixed(0) + ' Mbps';
  return (b / 1e3).toFixed(0) + ' Kbps';
};
const timeAgo = (ts) => {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};
const nowLabel = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};

// ─── Shimmer skeleton ──────────────────────────────────────────────
const Sk = ({ w = '100%', h = 14, r = 5 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg,#f0f2f5 25%,#e8ecf0 50%,#f0f2f5 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
);

// ─── Severity badge ────────────────────────────────────────────────
const SevBadge = ({ sev }) => {
  const cfg = {
    critical: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    warning:  { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
    info:     { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
    ok:       { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  }[sev] ?? { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' };
  return (
    <span style={{ padding: '1px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {sev}
    </span>
  );
};

// ─── Stat Card ─────────────────────────────────────────────────────
const StatCard = ({ label, value, subtitle, subtitleColor = '#6b7280', icon, topColor, loading }) => (
  <div style={{ flex: '1 1 160px', minWidth: 140, background: '#fff', borderRadius: 12,
    border: '1px solid #e8ecf0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <div style={{ height: 3, background: topColor }} />
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: topColor + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
      </div>
      {loading ? <Sk w="55%" h={28} r={6} /> : (
        <div style={{ fontSize: 28, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{value}</div>
      )}
      {loading ? <Sk w="70%" h={11} /> : (
        <div style={{ fontSize: 11, color: subtitleColor, fontWeight: 500 }}>{subtitle}</div>
      )}
    </div>
  </div>
);

// ─── SVG icon shortcuts ────────────────────────────────────────────
const Ico = ({ d, size = 15, color = '#6b7280', sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const IcoCheck   = ({ c, s }) => <Ico color={c} size={s} d={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>} />;
const IcoX       = ({ c, s }) => <Ico color={c} size={s} d={<><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>} />;
const IcoWarn    = ({ c, s }) => <Ico color={c} size={s} d={<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></>} />;
const IcoTool    = ({ c, s }) => <Ico color={c} size={s} d={<><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></>} />;
const IcoServer  = ({ c, s }) => <Ico color={c} size={s} d={<><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>} />;
const IcoTraffic = ({ c, s }) => <Ico color={c} size={s} d={<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>} />;
const IcoAlert   = ({ c, s }) => <Ico color={c} size={s} d={<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>} />;
const IcoUptime  = ({ c, s }) => <Ico color={c} size={s} d={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>} />;

// ─── Traffic Line Chart (SVG) ──────────────────────────────────────
const TrafficChart = ({ history, accent }) => {
  if (!history || history.length < 2) return (
    <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>
      Collecting traffic samples…
    </div>
  );

  const W = 620, H = 180, PL = 44, PR = 12, PT = 10, PB = 28;
  const iW = W - PL - PR, iH = H - PT - PB;
  const allVals = history.flatMap(d => [d.in, d.out]);
  const maxV = Math.max(...allVals, 100);
  const sx = (i) => PL + (i / (history.length - 1)) * iW;
  const sy = (v) => PT + iH - (v / maxV) * iH;
  const line = (key) => history.map((d, i) => `${sx(i)},${sy(d[key] || 0)}`).join(' ');
  const area = (key) => {
    const pts = history.map((d, i) => `${sx(i)},${sy(d[key] || 0)}`).join(' ');
    return `${PL},${PT + iH} ${pts} ${sx(history.length - 1)},${PT + iH}`;
  };
  const gridLines = 4;
  const yLabels = Array.from({ length: gridLines + 1 }, (_, i) => {
    const v = Math.round((maxV / gridLines) * (gridLines - i));
    return { v, y: PT + iH - (v / maxV) * iH };
  });

  const step = Math.max(1, Math.floor(history.length / 6));
  const xLabels = history.filter((_, i) => i % step === 0 || i === history.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      {/* Grid */}
      {yLabels.map((g, i) => (
        <g key={i}>
          <line x1={PL} y1={g.y} x2={W - PR} y2={g.y} stroke="#f0f2f5" strokeWidth={1} />
          <text x={PL - 5} y={g.y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
            {g.v >= 1000 ? (g.v / 1000).toFixed(1) + 'K' : g.v}
          </text>
        </g>
      ))}
      {/* Area fills */}
      <polygon points={area('in')}  fill={accent + '20'} />
      <polygon points={area('out')} fill="#3b82f620" />
      {/* Lines */}
      <polyline points={line('in')}  fill="none" stroke={accent}   strokeWidth={1.8} strokeLinejoin="round" />
      <polyline points={line('out')} fill="none" stroke="#3b82f6" strokeWidth={1.5} strokeLinejoin="round" />
      {/* X labels */}
      {xLabels.map((d, i) => {
        const idx = history.indexOf(d);
        return (
          <text key={i} x={sx(idx)} y={H - 6} textAnchor="middle" fontSize={9} fill="#9ca3af">{d.time}</text>
        );
      })}
    </svg>
  );
};

// ─── Donut chart (SVG) ────────────────────────────────────────────
const Donut = ({ total, up, down, warn, unknown }) => {
  const r = 52, cx = 70, cy = 70, stroke = 14;
  const circ = 2 * Math.PI * r;
  const safeTotal = total || 1;
  const seg = (v) => (v / safeTotal) * circ;

  const segments = [
    { v: up,      color: '#22c55e' },
    { v: warn,    color: '#f59e0b' },
    { v: down,    color: '#ef4444' },
    { v: unknown, color: '#d1d5db' },
  ];

  let offset = 0;
  const paths = segments.map((s, i) => {
    const dashArray = `${seg(s.v)} ${circ - seg(s.v)}`;
    const dashOffset = -offset;
    offset += seg(s.v);
    return (
      <circle key={i} cx={cx} cy={cy} r={r}
        fill="none" stroke={s.color} strokeWidth={stroke}
        strokeDasharray={dashArray} strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
    );
  });

  return (
    <svg viewBox="0 0 140 140" style={{ width: 140, height: 140, display: 'block' }}>
      {paths}
      <text x={cx} y={cy - 8}  textAnchor="middle" fontSize={9}  fill="#9ca3af" fontWeight={600}>Total</text>
      <text x={cx} y={cy + 8}  textAnchor="middle" fontSize={20} fill="#111827" fontWeight={800}>{total?.toLocaleString()}</text>
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize={8}  fill="#9ca3af">Devices</text>
    </svg>
  );
};

// ─── Circular health gauge ─────────────────────────────────────────
const HealthGauge = ({ pct, label, name }) => {
  const r = 28, cx = 34, cy = 34, stroke = 6;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const color = pct >= 80 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#22c55e';
  const status = pct >= 80 ? 'HIGH' : pct >= 60 ? 'MED' : 'OK';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg viewBox="0 0 68 68" style={{ width: 68, height: 68 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f2f5" strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: 'stroke-dasharray 0.6s' }} />
        <text x={cx} y={cy - 5}  textAnchor="middle" fontSize={12} fontWeight={800} fill={color}>{pct}%</text>
        <text x={cx} y={cy + 8}  textAnchor="middle" fontSize={7}  fontWeight={700} fill={color}>{status}</text>
      </svg>
      <span style={{ fontSize: 10, color: '#374151', fontWeight: 600, textAlign: 'center', maxWidth: 70,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </div>
  );
};

// ─── Network Topology SVG (real devices + real hierarchy) ────────
const Topology = ({ devices, relationships }) => {
  const devList = devices || [];
  const rels    = relationships || [];

  // Build parent→children map
  const childrenOf = {};
  const hasParent  = new Set();
  rels.forEach(({ parent, child }) => {
    if (!childrenOf[parent]) childrenOf[parent] = [];
    childrenOf[parent].push(child);
    hasParent.add(child);
  });

  const devById    = Object.fromEntries(devList.map(d => [d.hostname, d]));
  const level1list = devList.filter(d => !hasParent.has(d.hostname)).map(d => d.hostname);
  const level2list = devList.filter(d =>  hasParent.has(d.hostname)).map(d => d.hostname);
  const hasL2      = level2list.length > 0;

  // Fixed viewBox — wide enough for any realistic count
  const W = 480, CX = 240;
  const vbH = hasL2 ? 270 : 190;
  const M   = 50; // side margin

  const spreadX = (list, y, r, fs, isSmall) => {
    const n = list.length;
    return list.map((h, i) => {
      const x = n === 1 ? CX : M + i * ((W - 2 * M) / (n - 1));
      const d = devById[h];
      const isUp = d ? (d.status === 1 || d.status === true) : true;
      return {
        id: h,
        label: (d ? (d.sysName || h) : h).replace(/^sw-/i, 'SW-'),
        x, y, r,
        bg: isUp ? '#22c55e' : '#ef4444',
        fg: '#fff', fs,
      };
    });
  };

  const nodes1 = spreadX(level1list, hasL2 ? 130 : 145, 18, 6,  false);
  const nodes2 = spreadX(level2list, 220,              15, 5.5, true);

  const byId = {};
  [...nodes1, ...nodes2].forEach(n => { byId[n.id] = n; });

  const internet = { id: '__internet', label: 'Internet', x: CX, y: 22, r: 22, bg: '#3b82f6', fg: '#fff', fs: 8 };
  const core     = { id: '__core',     label: 'CORE',     x: CX, y: 80, r: 20, bg: '#f59e0b', fg: '#fff', fs: 7 };

  const edges = [
    [internet, core],
    ...nodes1.map(n => [core, n]),
    ...nodes2.map(n => {
      const parentId = rels.find(r => r.child === n.id)?.parent;
      return [byId[parentId] ?? core, n];
    }),
  ];

  const allNodes = [internet, core, ...nodes1, ...nodes2];

  return (
    <svg viewBox={`0 0 ${W} ${vbH}`} style={{ width: '100%', height: '100%', display: 'block', maxHeight: vbH }}>
      {edges.map(([a, b], i) => (
        a && b
          ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d1d5db" strokeWidth={1.2} />
          : null
      ))}
      {allNodes.map(n => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.bg} />
          <text x={n.x} y={n.y + n.fs * 0.4} textAnchor="middle" fontSize={n.fs} fill={n.fg} fontWeight={700}>
            {n.id === '__internet' ? 'NET' : n.id === '__core' ? 'CORE' : n.label.split('-')[0]}
          </text>
          <text x={n.x} y={n.y + n.r + 10} textAnchor="middle" fontSize={7.5} fill="#374151" fontWeight={600}>
            {n.label.length > 15 ? n.label.slice(0, 14) + '…' : n.label}
          </text>
        </g>
      ))}
    </svg>
  );
};

// ─── Traffic Heatmap ──────────────────────────────────────────────
const heatColor = (v) => {
  if (v > 0.85) return '#dc2626';
  if (v > 0.70) return '#ef4444';
  if (v > 0.55) return '#f97316';
  if (v > 0.40) return '#fb923c';
  if (v > 0.25) return '#fbbf24';
  if (v > 0.12) return '#86efac';
  return '#bbf7d0';
};

// Typical day traffic pattern by hour (relative multiplier 0–1)
const DAY_PATTERN = [0.08,0.05,0.04,0.06,0.15,0.40,0.75,0.90,
                     0.88,0.85,0.82,0.86,0.92,0.89,0.84,0.80,
                     0.76,0.70,0.63,0.55,0.45,0.35,0.22,0.12];

const Heatmap = ({ devices, ports }) => {
  const hours = ['00:00','03:00','06:00','09:00','12:00','15:00','18:00','21:00','23:00'];
  const slots  = [0, 3, 6, 9, 12, 15, 18, 21, 23];
  const curH   = new Date().getHours();
  const curMult = DAY_PATTERN[curH] || 0.5;

  // Build per-device utilization from real ports data
  const portsByDev = {};
  (ports || []).forEach(p => {
    const k = p.device_id;
    if (!portsByDev[k]) portsByDev[k] = [];
    portsByDev[k].push(p);
  });

  const devList = (devices || []).slice(0, 5);
  const rows = devList.length > 0
    ? devList.map(d => {
        const dp = portsByDev[d.device_id] || [];
        const cap  = dp.filter(p => p.ifOperStatus === 'up').reduce((s, p) => s + (p.ifSpeed || 1e9), 0);
        const rate = dp.reduce((s, p) => s + (p.ifInOctets_rate || 0) + (p.ifOutOctets_rate || 0), 0);
        const curUtil = cap > 0 ? Math.min(1, (rate * 8) / cap) : 0;
        return {
          name: (d.sysName || d.hostname).replace(/^sw-/, 'SW-'),
          cells: slots.map(h => {
            const hMult = DAY_PATTERN[h] ?? 0.5;
            const scaled = curMult > 0 ? curUtil * (hMult / curMult) : hMult * 0.5;
            return Math.min(1, Math.max(0, scaled));
          }),
        };
      })
    // Fallback: no devices loaded yet
    : ['Loading…'].map(() => ({ name: '…', cells: slots.map(() => 0) }));

  const cellW = 28, cellH = 20, pad = 6;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 300 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 72, fontSize: 10, color: '#374151', fontWeight: 600, textAlign: 'right',
              whiteSpace: 'nowrap', flexShrink: 0 }}>{row.name}</div>
            <div style={{ display: 'flex', gap: 2 }}>
              {row.cells.map((v, ci) => (
                <div key={ci} title={`${hours[ci]} — ${Math.round(v * 100)}%`}
                  style={{ width: cellW, height: cellH, borderRadius: 3, background: heatColor(v),
                    transition: 'background 0.3s' }} />
              ))}
            </div>
          </div>
        ))}
        {/* X labels */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <div style={{ width: 72 }} />
          <div style={{ display: 'flex', gap: 2 }}>
            {hours.map((h, i) => (
              <div key={i} style={{ width: cellW, fontSize: 8, color: '#9ca3af', textAlign: 'center' }}>{h}</div>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, marginLeft: 78 }}>
          <span style={{ fontSize: 9, color: '#9ca3af' }}>Low</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {['#bbf7d0','#86efac','#fbbf24','#fb923c','#f97316','#ef4444','#dc2626'].map((c, i) => (
              <div key={i} style={{ width: 16, height: 8, background: c, borderRadius: 2 }} />
            ))}
          </div>
          <span style={{ fontSize: 9, color: '#9ca3af' }}>High</span>
        </div>
      </div>
    </div>
  );
};

// ─── Event icon ───────────────────────────────────────────────────
const EventIcon = ({ type }) => {
  const cfg = {
    up:     { bg: '#f0fdf4', icon: <IcoCheck c="#16a34a" s={13} /> },
    down:   { bg: '#fef2f2', icon: <IcoX    c="#dc2626" s={13} /> },
    warn:   { bg: '#fffbeb', icon: <IcoWarn  c="#d97706" s={13} /> },
    system: { bg: '#eff6ff', icon: <IcoTool  c="#2563eb" s={13} /> },
  }[type] ?? { bg: '#f9fafb', icon: <IcoServer c="#6b7280" s={13} /> };
  return (
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: cfg.bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cfg.icon}</div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────
const DashboardPage = ({ accent = '#22c55e' }) => {
  const [devices,       setDevices]       = useState(null);
  const [alerts,        setAlerts]        = useState(null);
  const [ports,         setPorts]         = useState(null);
  const [events,        setEvents]        = useState(null);
  const [relationships, setRelationships] = useState([]);
  const [traffic,       setTraffic]       = useState([]);
  const [updatedAt,     setUpdatedAt]     = useState(nowLabel());
  const trafficRef = useRef([]);

  const fetch = useCallback(() => {
    setUpdatedAt(nowLabel());

    getDevices().then(setDevices).catch(() => setDevices([]));
    getAlerts().then(setAlerts).catch(() => setAlerts([]));
    getLogs(20).then(setEvents).catch(() => setEvents([]));
    getDeviceRelationships().then(setRelationships).catch(() => setRelationships([]));

    getPorts().then(pts => {
      setPorts(pts);
      const totalIn  = pts.reduce((s, p) => s + (p.ifInOctets_rate  || 0), 0);
      const totalOut = pts.reduce((s, p) => s + (p.ifOutOctets_rate || 0), 0);
      const now = new Date();
      const lbl = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      trafficRef.current = [...trafficRef.current.slice(-29),
        { time: lbl, in: fmtMbps(totalIn), out: fmtMbps(totalOut) }];
      setTraffic([...trafficRef.current]);
    }).catch(() => setPorts([]));
  }, []);

  useEffect(() => {
    fetch();
    const t = setInterval(fetch, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetch]);

  // ── Derived ────────────────────────────────────────────────────
  const totalDev  = (devices || []).length;
  const upDev     = (devices || []).filter(d => d.status === 1 || d.status === 'up').length;
  const downDev   = (devices || []).filter(d => d.status === 0 || d.status === 'down').length;
  const warnDev   = (devices || []).filter(d => d.status === 'warning').length;
  const unknownDev= Math.max(0, totalDev - upDev - downDev - warnDev);

  const activeAlerts = (alerts || []).filter(a => a.state === 1 || a.state === 'active');
  const critAlerts   = activeAlerts.filter(a => a.severity === 'critical');

  const lastT = traffic[traffic.length - 1];
  const totalGbps = lastT ? ((lastT.in + lastT.out) / 1000).toFixed(1) : '0.0';

  const topPorts = [...(ports || [])]
    .sort((a, b) => ((b.ifInOctets_rate || 0) + (b.ifOutOctets_rate || 0)) - ((a.ifInOctets_rate || 0) + (a.ifOutOctets_rate || 0)))
    .slice(0, 5);

  // Health: real link utilization per device (uplink traffic / total capacity)
  const portsByDev = {};
  (ports || []).forEach(p => {
    const k = p.device_id;
    if (!portsByDev[k]) portsByDev[k] = [];
    portsByDev[k].push(p);
  });

  const healthDevs = (devices || []).slice(0, 5).map(d => {
    const dp   = portsByDev[d.device_id] || [];
    const cap  = dp.filter(p => p.ifOperStatus === 'up').reduce((s, p) => s + (p.ifSpeed || 1e9), 0);
    const rate = dp.reduce((s, p) => s + (p.ifInOctets_rate || 0) + (p.ifOutOctets_rate || 0), 0);
    const pct  = cap > 0 ? Math.min(100, Math.round((rate * 8 / cap) * 100)) : 0;
    return { name: d.sysName || d.hostname, pct };
  });

  // Sites: built from real devices, city extracted from sysName pattern
  const CITY_MAP = { tas: 'Toshkent', sam: 'Samarqand', nam: 'Namangan', far: "Farg'ona", ber: 'Beruniy' };
  const sites = (devices || []).map(d => {
    const m = (d.sysName || d.hostname).match(/[^a-z]?(tas|sam|nam|far|ber)[^a-z]?/i);
    const city  = m ? (CITY_MAP[m[1].toLowerCase()] || m[1].toUpperCase()) : d.hostname;
    const isUp  = d.status === 1 || d.status === true;
    const upPct = isUp ? 100.0 : 0.0;
    return { name: (d.sysName || d.hostname).toUpperCase(), city, devs: 1, pct: upPct, color: isUp ? '#22c55e' : '#ef4444' };
  });

  // Network Uptime: average device uptime vs 30 days
  const thirtyDays = 30 * 24 * 3600;
  const uptimePct = (devices || []).length > 0
    ? Math.round((devices || []).reduce((s, d) => s + Math.min(1, ((d.uptime || 0) / thirtyDays)), 0)
        / (devices || []).length * 1000) / 10
    : null;

  // Event icon type
  const evType = (e) => {
    const msg = (e.message || e.text || '').toLowerCase();
    if (msg.includes('up') || msg.includes('restor') || msg.includes('back online') || msg.includes('completed')) return 'up';
    if (msg.includes('down') || msg.includes('went') || msg.includes('unreachable')) return 'down';
    if (msg.includes('spike') || msg.includes('warn') || msg.includes('high') || msg.includes('alert')) return 'warn';
    return 'system';
  };

  const card = { background: '#fff', borderRadius: 12, border: '1px solid #e8ecf0', overflow: 'hidden' };
  const sectionTitle = { fontSize: 13, fontWeight: 700, color: '#111827' };
  const linkStyle = { fontSize: 11, color: accent, fontWeight: 600, cursor: 'pointer',
    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @keyframes shimmer { to { background-position: -200% 0; } }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      {/* ── Top stat cards ───────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard
          label="Devices Up" loading={devices === null}
          value={upDev}
          subtitle={`↑ ${totalDev ? ((upDev / totalDev) * 100).toFixed(1) : 0}% of total`}
          subtitleColor="#22c55e" topColor="#22c55e"
          icon={<IcoCheck c="#22c55e" s={14} />}
        />
        <StatCard
          label="Devices Down" loading={devices === null}
          value={downDev}
          subtitle={downDev > 0 ? 'Needs attention' : 'All reachable'}
          subtitleColor={downDev > 0 ? '#ef4444' : '#6b7280'} topColor="#ef4444"
          icon={<IcoX c="#ef4444" s={14} />}
        />
        <StatCard
          label="Warnings" loading={devices === null}
          value={warnDev || (alerts === null ? '—' : activeAlerts.length)}
          subtitle="High resource usage"
          subtitleColor="#f59e0b" topColor="#f59e0b"
          icon={<IcoWarn c="#f59e0b" s={14} />}
        />
        <StatCard
          label="Total Traffic" loading={ports === null}
          value={`${totalGbps} Gbps`}
          subtitle={lastT ? `↑ ${lastT.in} Mbps in · ${lastT.out} Mbps out` : 'Collecting…'}
          subtitleColor="#3b82f6" topColor="#3b82f6"
          icon={<IcoTraffic c="#3b82f6" s={14} />}
        />
        <StatCard
          label="Active Alerts" loading={alerts === null}
          value={activeAlerts.length}
          subtitle={critAlerts.length > 0 ? `${critAlerts.length} critical` : 'No critical'}
          subtitleColor={critAlerts.length > 0 ? '#ef4444' : '#22c55e'} topColor="#1e293b"
          icon={<IcoAlert c="#1e293b" s={14} />}
        />
        <StatCard
          label="Network Uptime" loading={devices === null}
          value={uptimePct !== null ? `${uptimePct}%` : '—'}
          subtitle="↑ Last 30 days"
          subtitleColor="#0d9488" topColor="#0d9488"
          icon={<IcoUptime c="#0d9488" s={14} />}
        />
      </div>

      {/* ── Row 2: Traffic chart + Active Alerts ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 14 }}>
        {/* Traffic chart */}
        <div style={card}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f5f5f5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e',
                animation: 'pulse 2s infinite' }} />
              <span style={sectionTitle}>Network Traffic (Mbps)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {[['Inbound', accent], ['Outbound', '#3b82f6']].map(([l, c]) => (
                <span key={l} style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 18, height: 2, background: c, display: 'inline-block', borderRadius: 1 }} />{l}
                </span>
              ))}
              <a style={linkStyle}>Full report →</a>
            </div>
          </div>
          <div style={{ padding: '14px 8px 8px' }}>
            <TrafficChart history={traffic} accent={accent} />
          </div>
        </div>

        {/* Active Alerts */}
        <div style={card}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f5f5f5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
                animation: 'pulse 1.5s infinite' }} />
              <span style={sectionTitle}>Active Alerts</span>
            </div>
            <a style={linkStyle}>View all →</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {alerts === null
              ? [1,2,3,4].map(i => (
                  <div key={i} style={{ padding: '12px 18px', borderBottom: '1px solid #f9fafb',
                    display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Sk w={30} h={10} r={4} /><div style={{ flex: 1 }}><Sk h={12} /></div>
                  </div>
                ))
              : activeAlerts.length === 0
                ? <div style={{ padding: '28px 18px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                    No active alerts
                  </div>
                : activeAlerts.slice(0, 7).map((a, i) => {
                    const sev = a.severity || 'warning';
                    const dotColor = sev === 'critical' ? '#ef4444' : sev === 'warning' ? '#f59e0b' : '#3b82f6';
                    return (
                      <div key={a.id || i} style={{ padding: '10px 18px', borderBottom: '1px solid #f9fafb',
                        display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontSize: 10, color: '#9ca3af', minWidth: 42, paddingTop: 2 }}>
                          {timeAgo(a.timestamp)}
                        </span>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor,
                          flexShrink: 0, marginTop: 3, boxShadow: `0 0 0 3px ${dotColor}20` }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{a.hostname}</div>
                          <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                            {a.rule?.name || a.name || '—'}
                          </div>
                        </div>
                        <SevBadge sev={sev} />
                      </div>
                    );
                  })
            }
          </div>
        </div>
      </div>

      {/* ── Row 3: Device Status + Topology + Device Health ─────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 260px', gap: 14 }}>
        {/* Device Status */}
        <div style={card}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f5f5f5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
              <span style={sectionTitle}>Device Status</span>
            </div>
            <a style={linkStyle}>Details →</a>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            {devices === null
              ? <Sk w={140} h={140} r={70} />
              : <Donut total={totalDev} up={upDev} down={downDev} warn={warnDev} unknown={unknownDev} />
            }
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[['Up', upDev, '#22c55e'], ['Down', downDev, '#ef4444'],
                ['Warning', warnDev, '#f59e0b'], ['Unknown', unknownDev, '#d1d5db']].map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                    <span style={{ fontSize: 12, color: '#374151' }}>{l}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                    {devices === null ? '—' : v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Network Topology */}
        <div style={card}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f5f5f5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
              <span style={sectionTitle}>Network Topology</span>
            </div>
            <a style={linkStyle}>Full map →</a>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 290 }}>
            <Topology devices={devices} relationships={relationships} />
          </div>
        </div>

        {/* Device Health */}
        <div style={card}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f5f5f5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
              <span style={sectionTitle}>Device Health</span>
            </div>
          </div>
          <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {devices === null
              ? [1,2,3,4,5].map(i => <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}><Sk w={68} h={68} r={34} /><Sk w={60} h={10} /></div>)
              : healthDevs.map((d, i) => <HealthGauge key={i} pct={d.pct} name={d.name} />)
            }
          </div>
        </div>
      </div>

      {/* ── Row 4: Heatmap + Event Log + Sites + Top Ifaces ──────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px 260px', gap: 14 }}>
        {/* Traffic Heatmap */}
        <div style={card}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f5f5f5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} />
              <span style={sectionTitle}>Traffic Heatmap · 24h</span>
            </div>
            <a style={linkStyle}>View all →</a>
          </div>
          <div style={{ padding: '16px' }}>
            <Heatmap devices={devices} ports={ports} />
          </div>
        </div>

        {/* Event Log */}
        <div style={card}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f5f5f5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} />
              <span style={sectionTitle}>Event Log</span>
            </div>
            <a style={linkStyle}>All events →</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {events === null
              ? [1,2,3,4].map(i => (
                  <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid #f9fafb',
                    display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Sk w={26} h={26} r={13} /><div style={{ flex: 1 }}><Sk h={11} /></div>
                  </div>
                ))
              : events.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No events</div>
                : events.slice(0, 7).map((e, i) => (
                    <div key={e.event_id || i} style={{ padding: '9px 16px',
                      borderBottom: '1px solid #f9fafb', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <EventIcon type={evType(e)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, color: '#111827', fontWeight: 500,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.message || e.text || '—'}
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2,
                          display: 'flex', justifyContent: 'space-between' }}>
                          <span>{e.hostname} · {e.type || 'system'}</span>
                          <span>{timeAgo(e.datetime)}</span>
                        </div>
                      </div>
                    </div>
                  ))
            }
          </div>
        </div>

        {/* Sites + Top Interfaces */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Sites Overview */}
          <div style={card}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f5f5f5',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                <span style={sectionTitle}>Sites Overview</span>
              </div>
              <a style={linkStyle}>Map →</a>
            </div>
            <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {sites.map((s, i) => (
                <div key={i} style={{ padding: '10px 10px', background: '#fafafa', borderRadius: 8,
                  border: '1px solid #f0f2f5' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                    Devices: <strong style={{ color: s.color }}>{s.pct}%</strong>
                    <br />{s.devs}
                  </div>
                  <div style={{ height: 4, background: '#e8ecf0', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${s.pct}%`, height: '100%', background: s.color, borderRadius: 2, transition: 'width 0.6s' }} />
                  </div>
                  <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>{s.city}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Interfaces */}
          <div style={card}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
                <span style={sectionTitle}>Top Interfaces</span>
              </div>
            </div>
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ports === null
                ? [1,2,3].map(i => <div key={i} style={{ display:'flex', flexDirection:'column', gap:4 }}><Sk w="70%" h={10} /><Sk h={6} /></div>)
                : topPorts.length === 0
                  ? <div style={{ color: '#9ca3af', fontSize: 12 }}>No port data</div>
                  : topPorts.map((p, i) => {
                      const inMbps  = fmtMbps(p.ifInOctets_rate);
                      const outMbps = fmtMbps(p.ifOutOctets_rate);
                      const maxMbps = p.ifSpeed ? p.ifSpeed / 1e6 : Math.max(inMbps, outMbps, 1);
                      const inPct   = Math.min(100, Math.round((inMbps / maxMbps) * 100));
                      const outPct  = Math.min(100, Math.round((outMbps / maxMbps) * 100));
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between',
                            fontSize: 11, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                            <span style={{ fontFamily: 'monospace' }}>{p.hostname ? `${p.hostname.split('.')[0]} ` : ''}{p.ifName}</span>
                            <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 10 }}>
                              ↓{inMbps} ↑{outMbps} Mbps
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ height: 4, background: '#f0f2f5', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${inPct}%`, height: '100%', background: '#22c55e', borderRadius: 2 }} />
                            </div>
                            <div style={{ height: 4, background: '#f0f2f5', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${outPct}%`, height: '100%', background: '#3b82f6', borderRadius: 2 }} />
                            </div>
                          </div>
                        </div>
                      );
                    })
              }
              {topPorts.length > 0 && (
                <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                  {[['#22c55e','In'],['#3b82f6','Out']].map(([c, l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9ca3af' }}>
                      <div style={{ width: 10, height: 3, background: c, borderRadius: 2 }} />{l}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Updated timestamp */}
      <div style={{ textAlign: 'right', fontSize: 10, color: '#9ca3af', paddingBottom: 4 }}>
        Updated {updatedAt}
      </div>
    </div>
  );
};

export default DashboardPage;
