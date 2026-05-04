import React from 'react';

// ─── ICONS (inline SVG - exact replica from prototype) ──────────
const iconPaths = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  devices: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  alerts: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  ports: <><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></>,
  logs: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
  pollers:  <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
  activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
  bgp: <><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
  services: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
  inventory: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  chevronRight: <><polyline points="9 18 15 12 9 6"/></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
  search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  refresh: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
  arrowUp: <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>,
  arrowDown: <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>,
  menu: <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>,
  close: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  cpu: <><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="15" x2="4" y2="15"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="15" x2="22" y2="15"/></>,
  wifi: <><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>,
  server: <><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>,
  network: <><rect x="9" y="2" width="6" height="4" rx="1"/><rect x="2" y="16" width="6" height="4" rx="1"/><rect x="16" y="16" width="6" height="4" rx="1"/><path d="M12 6v4M5 16v-2a7 7 0 0 1 14 0v2"/></>,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
  checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
  xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
  clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  map: <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></>,
  edit:   <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
  plus:   <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  trash:  <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
  eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>,
  x:      <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
};

export const Icon = ({ name, size = 16, color = "currentColor", strokeWidth = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {iconPaths[name] || null}
  </svg>
);

// ─── SVG CHARTS ──────────────────────────────────────────────────
export const AreaChartSVG = ({ data, keys, colors, height = 180, showGrid = true }) => {
  if (!data || data.length < 2) return null;
  const W = 600, H = height, PAD = { top: 10, right: 10, bottom: 24, left: 32 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const allVals = data.flatMap(d => keys.map(k => d[k] || 0));
  const maxVal = Math.max(...allVals, 1);
  const xStep = innerW / (data.length - 1);
  const scaleY = v => innerH - (v / maxVal) * innerH;
  const pts = (key) => data.map((d, i) => [i * xStep, scaleY(d[key] || 0)]);
  const polyline = (key) => pts(key).map(([x, y]) => `${x},${y}`).join(" ");
  const area = (key) => {
    const p = pts(key);
    return `M${p[0][0]},${innerH} ` + p.map(([x,y]) => `L${x},${y}`).join(" ") + ` L${p[p.length-1][0]},${innerH} Z`;
  };
  const ticks = 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {showGrid && Array.from({ length: ticks + 1 }, (_, i) => {
          const y = (innerH / ticks) * i;
          return <line key={i} x1={0} y1={y} x2={innerW} y2={y} stroke="#f0f0f0" strokeWidth={1} />;
        })}
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = Math.round(maxVal - (maxVal / ticks) * i);
          const y = (innerH / ticks) * i;
          return <text key={`t${i}`} x={-4} y={y + 3} fontSize={8} fill="#9ca3af" textAnchor="end">{v}</text>;
        })}
        {data.filter((_, i) => i % Math.ceil(data.length / 8) === 0).map((d, idx) => {
          const origIdx = data.indexOf(d);
          return <text key={`l${idx}`} x={origIdx * xStep} y={innerH + 16} fontSize={8} fill="#9ca3af" textAnchor="middle">{d.time || d.name || ""}</text>;
        })}
        {keys.map((key, ki) => (
          <g key={key}>
            <defs>
              <linearGradient id={`ag${ki}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors[ki]} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colors[ki]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={area(key)} fill={`url(#ag${ki})`} />
            <polyline points={polyline(key)} fill="none" stroke={colors[ki]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
      </g>
    </svg>
  );
};

export const BarChartSVG = ({ data, dataKey, colorFn, height = 160 }) => {
  if (!data || !data.length) return null;
  const W = 600, H = height, PAD = { top: 10, right: 10, bottom: 24, left: 32 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...data.map(d => d[dataKey] || 0), 1);
  const barW = Math.max(4, (innerW / data.length) * 0.6);
  const gap = innerW / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {[0,25,50,75,100].map(v => {
          const y = innerH - (v / 100) * innerH;
          return <line key={v} x1={0} y1={y} x2={innerW} y2={y} stroke="#f0f0f0" strokeWidth={1} />;
        })}
        {data.map((d, i) => {
          const val = d[dataKey] || 0;
          const bH = (val / maxVal) * innerH;
          const x = gap * i + gap / 2 - barW / 2;
          const y = innerH - bH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={bH} rx={3} fill={colorFn ? colorFn(d) : "#22c55e"} />
              <text x={gap * i + gap / 2} y={innerH + 16} fontSize={8} fill="#9ca3af" textAnchor="middle">{d.name || d.port || ""}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export const DonutChartSVG = ({ data, size = 140 }) => {
  if (!data || !data.length) return null;
  const cx = size / 2, cy = size / 2;
  const R = size * 0.38, r = size * 0.24;
  const total = data.reduce((s, d) => s + d.value, 0);
  let angle = -Math.PI / 2;
  const slices = data.map(d => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
    angle += sweep;
    const x2 = cx + R * Math.cos(angle), y2 = cy + R * Math.sin(angle);
    const xi1 = cx + r * Math.cos(angle - sweep), yi1 = cy + r * Math.sin(angle - sweep);
    const xi2 = cx + r * Math.cos(angle), yi2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return { ...d, path: `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${xi2},${yi2} A${r},${r} 0 ${large},0 ${xi1},${yi1} Z` };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={2} />)}
    </svg>
  );
};

export const MiniAreaSVG = ({ data, color, height = 80 }) => {
  if (!data || data.length < 2) return null;
  const W = 400, H = height;
  const maxV = Math.max(...data.map(d => d.value), 1);
  const pts = data.map((d, i) => [i * (W / (data.length - 1)), H - (d.value / maxV) * (H - 10) - 5]);
  const polyline = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const areaPath = `M${pts[0][0]},${H} ` + pts.map(([x, y]) => `L${x},${y}`).join(" ") + ` L${pts[pts.length - 1][0]},${H} Z`;
  const gradId = `mg${color.replace("#","")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f, i) => (
        <line key={i} x1={0} y1={H * f} x2={W} y2={H * f} stroke="#f0f0f0" strokeWidth={1} />
      ))}
      <path d={areaPath} fill={`url(#${gradId})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

// ─── STAT CARD ───────────────────────────────────────────────────
export const StatCard = ({ label, value, icon, color, subtext, trend }) => (
  <div style={{
    background: "#fff", borderRadius: 10, padding: "16px 18px",
    border: "1px solid #e8ecf0", display: "flex", flexDirection: "column", gap: 8,
    flex: "1 1 130px", minWidth: 120, position: "relative", overflow: "hidden"
  }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <div style={{ background: `${color}18`, borderRadius: 7, padding: 6, display: "flex" }}>
        <Icon name={icon} size={14} color={color} />
      </div>
    </div>
    <div style={{ fontSize: 26, fontWeight: 700, color: "#111827", lineHeight: 1 }}>{value}</div>
    {subtext && (
      <div style={{ fontSize: 11, color: "#9ca3af", display: "flex", alignItems: "center", gap: 4 }}>
        {trend && <Icon name={trend === "up" ? "arrowUp" : "arrowDown"} size={10} color={trend === "up" ? "#22c55e" : "#ef4444"} />}
        {subtext}
      </div>
    )}
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: `${color}30`, borderRadius: "0 0 10px 10px" }}>
      <div style={{ width: "60%", height: "100%", background: color, borderRadius: "0 0 10px 10px" }} />
    </div>
  </div>
);

// ─── STATUS BADGE ────────────────────────────────────────────────
export const Badge = ({ status }) => {
  const cfg = {
    up:          { bg: "#dcfce7", color: "#16a34a", label: "Up" },
    down:        { bg: "#fee2e2", color: "#dc2626", label: "Down" },
    warning:     { bg: "#fef9c3", color: "#ca8a04", label: "Warning" },
    ok:          { bg: "#dcfce7", color: "#16a34a", label: "OK" },
    active:      { bg: "#fee2e2", color: "#dc2626", label: "Active" },
    acknowledged:{ bg: "#fef9c3", color: "#ca8a04", label: "Ack'd" },
    critical:    { bg: "#fee2e2", color: "#dc2626", label: "Critical" },
    info:        { bg: "#dbeafe", color: "#2563eb", label: "Info" },
  }[status] || { bg: "#f3f4f6", color: "#6b7280", label: status };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 600,
      padding: "2px 8px", borderRadius: 20, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: cfg.color, marginRight: 4, verticalAlign: "middle", marginBottom: 1 }}></span>
      {cfg.label}
    </span>
  );
};

// ─── SHARED TABLE & HELPERS ──────────────────────────────────────
export const TableCard = ({ headers, rows, renderRow }) => (
  <div style={{ background:"#fff", borderRadius:10, border:"1px solid #e8ecf0", overflow:"hidden" }}>
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr style={{ background:"#f9fafb" }}>
            {headers.map(h => (
              <th key={h} style={{ padding:"9px 14px", fontSize:10, fontWeight:600, color:"#6b7280",
                textAlign:"left", textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => renderRow(r, i))}
        </tbody>
      </table>
    </div>
  </div>
);

export const PageHeader = ({ title, desc, action }) => (
  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
    <div>
      <h1 style={{ fontSize:18, fontWeight:700, color:"#111827", marginBottom:2 }}>{title}</h1>
      {desc && <p style={{ fontSize:12, color:"#6b7280" }}>{desc}</p>}
    </div>
    {action}
  </div>
);

export const TD = ({ children, mono, bold }) => (
  <td style={{ padding:"10px 14px", fontSize:11,
    color: bold ? "#111827" : "#374151",
    fontWeight: bold ? 600 : 400,
    fontFamily: mono ? "monospace" : "inherit" }}>
    {children}
  </td>
);
