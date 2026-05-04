import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Charts';
import { getDevices, getMetrics, getMetricObjects } from '../api';

const ACCENT = '#22c55e';

const METRIC_TYPES = [
  { value: 'port_in',  label: 'Port Traffic In',  unit: 'Bps', color: '#3b82f6' },
  { value: 'port_out', label: 'Port Traffic Out', unit: 'Bps', color: '#8b5cf6' },
  { value: 'cpu',      label: 'CPU Usage',         unit: '%',   color: '#f59e0b' },
  { value: 'mem',      label: 'Memory Usage',      unit: '%',   color: '#ef4444' },
  { value: 'uptime',   label: 'Uptime',            unit: 's',   color: ACCENT    },
];

const PRESETS = [
  { label: '1h',   from: () => ago(1,   'h') },
  { label: '6h',   from: () => ago(6,   'h') },
  { label: '24h',  from: () => ago(24,  'h') },
  { label: '7d',   from: () => ago(7,   'd') },
  { label: '30d',  from: () => ago(30,  'd') },
  { label: '90d',  from: () => ago(90,  'd') },
];

function ago(n, unit) {
  const d = new Date();
  if (unit === 'h') d.setHours(d.getHours() - n);
  if (unit === 'd') d.setDate(d.getDate() - n);
  return toLocal(d);
}

function toLocal(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtVal(v, unit) {
  if (unit === 'Bps') {
    if (v >= 1e9) return (v/1e9).toFixed(2) + ' GB/s';
    if (v >= 1e6) return (v/1e6).toFixed(2) + ' MB/s';
    if (v >= 1e3) return (v/1e3).toFixed(2) + ' KB/s';
    return v.toFixed(0) + ' B/s';
  }
  if (unit === 's') {
    const d = Math.floor(v/86400), h = Math.floor((v%86400)/3600), m = Math.floor((v%3600)/60);
    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  if (unit === '%') return Number(v).toFixed(1) + '%';
  return Number(v).toFixed(2);
}

function fmtDt(s) {
  if (!s) return '—';
  return new Date(s.replace(' ', 'T')).toLocaleString();
}

// ─── SVG Line Chart ───────────────────────────────────────────────
function LineChart({ data, unit, color }) {
  const W = 800, H = 180, PL = 62, PR = 16, PT = 12, PB = 28;
  const iW = W - PL - PR, iH = H - PT - PB;

  if (!data || data.length < 2) {
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block' }}>
        <text x={W/2} y={H/2} textAnchor="middle" fontSize={12} fill="#9ca3af">Not enough data</text>
      </svg>
    );
  }

  const vals  = data.map(d => Number(d.value));
  const times = data.map(d => new Date(d.collected_at.replace(' ','T')).getTime());
  const minV  = Math.min(...vals), maxV = Math.max(...vals);
  const minT  = Math.min(...times), maxT = Math.max(...times);
  const rangeV = maxV - minV || 1, rangeT = maxT - minT || 1;

  const px = t => PL + ((t - minT) / rangeT) * iW;
  const py = v => PT + iH - ((v - minV) / rangeV) * iH;

  const pts  = data.map((d, i) => `${px(times[i])},${py(vals[i])}`).join(' ');
  const area = `M${px(times[0])},${PT+iH} ` + data.map((d,i) => `L${px(times[i])},${py(vals[i])}`).join(' ') + ` L${px(times[times.length-1])},${PT+iH} Z`;

  // y-axis labels (5 ticks)
  const yTicks = Array.from({length: 5}, (_, i) => minV + (rangeV / 4) * i);
  // x-axis labels (5 ticks)
  const xTicks = Array.from({length: 5}, (_, i) => minT + (rangeT / 4) * i);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block' }}>
      <defs>
        <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.01"/>
        </linearGradient>
      </defs>
      {/* Grid */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PL} x2={W-PR} y1={py(v)} y2={py(v)} stroke="#f0f2f5" strokeWidth="1"/>
          <text x={PL-6} y={py(v)+4} textAnchor="end" fontSize={9} fill="#9ca3af">{fmtVal(v, unit)}</text>
        </g>
      ))}
      {xTicks.map((t, i) => {
        const d = new Date(t);
        const label = rangeT > 86400000 ? `${d.getMonth()+1}/${d.getDate()}` : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        return (
          <text key={i} x={px(t)} y={H-6} textAnchor="middle" fontSize={9} fill="#9ca3af">{label}</text>
        );
      })}
      {/* Area */}
      <path d={area} fill="url(#mg)"/>
      {/* Line */}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Dashboard mode ───────────────────────────────────────────────
function DashChart({ uid, data, unit, color }) {
  const W = 500, H = 130, PL = 54, PR = 8, PT = 8, PB = 20;
  const iW = W-PL-PR, iH = H-PT-PB;
  if (!data || data.length < 2) return (
    <div style={{ height:130, display:'flex', alignItems:'center', justifyContent:'center',
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
        <linearGradient id={`dg-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.01"/>
        </linearGradient>
      </defs>
      {yTks.map((v,i) => (
        <g key={i}>
          <line x1={PL} x2={W-PR} y1={py(v)} y2={py(v)} stroke="#f0f2f5" strokeWidth="1"/>
          <text x={PL-4} y={py(v)+4} textAnchor="end" fontSize={8} fill="#9ca3af">{fmtVal(v,unit)}</text>
        </g>
      ))}
      {xTks.map((t,i) => {
        const d = new Date(t);
        const l = rt > 86400000 ? `${d.getMonth()+1}/${d.getDate()}` : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        return <text key={i} x={px(t)} y={H-3} textAnchor="middle" fontSize={8} fill="#9ca3af">{l}</text>;
      })}
      <path d={area} fill={`url(#dg-${uid})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function MetricsPage({ accent = ACCENT }) {
  const [devices,    setDevices]    = useState([]);
  const [objects,    setObjects]    = useState([]);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const [deviceId,   setDeviceId]   = useState('');
  const [metricType, setMetricType] = useState('port_in');
  const [objectId,   setObjectId]   = useState('');
  const [from,       setFrom]       = useState(() => ago(6, 'h'));
  const [to,         setTo]         = useState(() => toLocal(new Date()));
  const [preset,     setPreset]     = useState('6h');

  // Dashboard mode
  const [mode,       setMode]       = useState('single'); // 'single' | 'dashboard'
  const [dashData,   setDashData]   = useState({});
  const [dashPort,   setDashPort]   = useState('');
  const [dashPorts,  setDashPorts]  = useState([]);
  const [dashLoad,   setDashLoad]   = useState(false);
  const [dashTick,   setDashTick]   = useState(0);

  const needsObject = metricType === 'port_in' || metricType === 'port_out';
  const metaDef     = METRIC_TYPES.find(m => m.value === metricType);

  // load devices once
  useEffect(() => {
    getDevices().then(devs => {
      setDevices(devs);
      if (devs.length > 0) setDeviceId(String(devs[0].device_id));
    });
  }, []);

  // reload objects when device or metric type changes
  useEffect(() => {
    if (!deviceId || !needsObject) { setObjects([]); setObjectId(''); return; }
    getMetricObjects({ device_id: deviceId, metric_type: metricType }).then(obs => {
      setObjects(obs);
      setObjectId(obs[0]?.object_id ? String(obs[0].object_id) : '');
    });
  }, [deviceId, metricType]);

  const search = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true); setError('');
    try {
      const params = {
        device_id:   deviceId,
        metric_type: metricType,
        from:        from.replace('T', ' '),
        to:          to.replace('T', ' '),
        resolution:  'auto',
        limit:       2000,
      };
      if (needsObject && objectId) params.object_id = objectId;
      const res = await getMetrics(params);
      setData(res);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Request failed');
    }
    setLoading(false);
  }, [deviceId, metricType, objectId, from, to, needsObject]);

  // auto-search when device/metric/object changes
  useEffect(() => { if (deviceId && mode === 'single') search(); }, [deviceId, metricType, objectId]);

  // Dashboard: load port objects + all metrics when mode=dashboard
  useEffect(() => {
    if (mode !== 'dashboard' || !deviceId) return;
    // load port objects for traffic selector
    getMetricObjects({ device_id: deviceId, metric_type: 'port_in' }).then(obs => {
      setDashPorts(obs);
      if (!dashPort && obs.length) setDashPort(String(obs[0].object_id));
    });
  }, [mode, deviceId]);

  useEffect(() => {
    if (mode !== 'dashboard' || !deviceId) return;
    const presetDef = PRESETS.find(p => p.label === preset) || PRESETS[1];
    const fromStr   = presetDef.from().replace('T', ' ');
    const toStr     = toLocal(new Date()).replace('T', ' ');
    setDashLoad(true);
    Promise.all(METRIC_TYPES.map(mt => {
      const params = { device_id: deviceId, metric_type: mt.value, from: fromStr, to: toStr, resolution:'auto', limit:500 };
      if ((mt.value === 'port_in' || mt.value === 'port_out') && dashPort) params.object_id = dashPort;
      return getMetrics(params).then(r => ({ type: mt.value, rows: r.metrics ?? [] })).catch(() => ({ type: mt.value, rows: [] }));
    })).then(results => {
      const d = {};
      results.forEach(r => { d[r.type] = r.rows; });
      setDashData(d);
      setDashLoad(false);
    });
  }, [mode, deviceId, preset, dashPort, dashTick]);

  const applyPreset = (p) => {
    setPreset(p.label);
    setFrom(p.from());
    setTo(toLocal(new Date()));
  };

  const rows    = data?.metrics ?? [];
  const resCols = data?.resolution === 'raw' ? [] : ['value_min', 'value_max'];

  const F = {
    sel: { padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', color: '#111827', background: '#fff', cursor: 'pointer', outline: 'none' },
    inp: { padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', color: '#111827', background: '#fff', outline: 'none' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Metrics History</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Historical metric values — collected every 5 minutes, kept 90 days</div>
        </div>
        <div style={{ display:'flex', gap:4, background:'#f3f4f6', borderRadius:8, padding:3 }}>
          {[['single','Single Chart'],['dashboard','Dashboard']].map(([m,l]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding:'5px 14px', fontSize:11, fontWeight:600, border:'none', borderRadius:6,
              cursor:'pointer', fontFamily:'inherit',
              background: mode === m ? '#fff' : 'transparent',
              color:       mode === m ? '#111827' : '#9ca3af',
              boxShadow:   mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        {/* Device */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Device</label>
          <select style={F.sel} value={deviceId} onChange={e => setDeviceId(e.target.value)}>
            {devices.map(d => <option key={d.device_id} value={d.device_id}>{d.sysName || d.hostname}</option>)}
          </select>
        </div>

        {/* Single mode only: Metric + Interface + From/To + Search */}
        {mode === 'single' && <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Metric</label>
            <select style={F.sel} value={metricType} onChange={e => setMetricType(e.target.value)}>
              {METRIC_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {needsObject && objects.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Interface</label>
              <select style={F.sel} value={objectId} onChange={e => setObjectId(e.target.value)}>
                <option value="">— All —</option>
                {objects.map(o => <option key={o.object_id} value={o.object_id}>{o.object_name}</option>)}
              </select>
            </div>
          )}
        </>}

        {/* Dashboard mode: port selector for traffic charts */}
        {mode === 'dashboard' && dashPorts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Traffic Port</label>
            <select style={F.sel} value={dashPort} onChange={e => setDashPort(e.target.value)}>
              {dashPorts.map(o => <option key={o.object_id} value={o.object_id}>{o.object_name}</option>)}
            </select>
          </div>
        )}

        {/* Time presets — always shown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick range</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, border: `1px solid ${preset === p.label ? accent : '#e5e7eb'}`, borderRadius: 6, background: preset === p.label ? accent + '15' : '#fff', color: preset === p.label ? accent : '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'single' && <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>From</label>
            <input type="datetime-local" style={F.inp} value={from} onChange={e => { setFrom(e.target.value); setPreset(''); }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>To</label>
            <input type="datetime-local" style={F.inp} value={to} onChange={e => { setTo(e.target.value); setPreset(''); }} />
          </div>
          <button onClick={search} disabled={loading || !deviceId} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 7, background: accent, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1, alignSelf: 'flex-end' }}>
            {loading ? '…' : 'Search'}
          </button>
        </>}

        {mode === 'dashboard' && (
          <button onClick={() => setDashTick(t => t+1)} disabled={dashLoad} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 7, background: accent, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: dashLoad ? 0.6 : 1, alignSelf: 'flex-end' }}>
            {dashLoad ? '…' : 'Refresh'}
          </button>
        )}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#dc2626' }}>{error}</div>}

      {/* ─── Dashboard view ─── */}
      {mode === 'dashboard' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {METRIC_TYPES.map(mt => {
              const rows = dashData[mt.value] ?? [];
              const vals = rows.map(r => Number(r.value));
              const last = vals.length ? vals[vals.length-1] : null;
              const avg  = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
              const max  = vals.length ? Math.max(...vals) : null;
              return (
                <div key={mt.value} style={{ background:'#fff', borderRadius:10, border:'1px solid #e8ecf0', padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div>
                      <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{mt.label}</span>
                      <span style={{ fontSize:10, color:'#9ca3af', marginLeft:8 }}>{rows.length} pts · {data?.resolution ?? 'auto'}</span>
                    </div>
                    {last !== null && (
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:16, fontWeight:700, color:mt.color }}>{fmtVal(last, mt.unit)}</div>
                        <div style={{ fontSize:10, color:'#9ca3af' }}>avg {avg !== null ? fmtVal(avg, mt.unit) : '—'} · max {max !== null ? fmtVal(max, mt.unit) : '—'}</div>
                      </div>
                    )}
                  </div>
                  <DashChart uid={`dash-${mt.value}`} data={rows} unit={mt.unit} color={mt.color} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Single chart ─── */}
      {mode === 'single' && data && rows.length > 1 && (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
              {metaDef?.label}
              {objectId && objects.find(o => String(o.object_id) === objectId) && (
                <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
                  {objects.find(o => String(o.object_id) === objectId)?.object_name}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              {data.count} points · resolution: {data.resolution}
            </span>
          </div>
          <LineChart data={rows} unit={metaDef?.unit} color={metaDef?.color ?? accent} />
        </div>
      )}

      {/* Table — single mode only */}
      {mode === 'single' && (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
              Data Table
              {data && <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>{data.count} rows</span>}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f0f2f5' }}>
                  {['Timestamp', 'Device', 'Object', 'Value', ...(data?.resolution !== 'raw' ? ['Min', 'Max'] : [])].map(h => (
                    <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>Loading…</td></tr>
                ) : !data ? (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>Select filters and click Search</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>No data for this range</td></tr>
                ) : [...rows].reverse().map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '7px 14px', fontSize: 11, color: '#374151', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtDt(r.collected_at)}</td>
                    <td style={{ padding: '7px 14px', fontSize: 11, color: '#6b7280' }}>{deviceId}</td>
                    <td style={{ padding: '7px 14px', fontSize: 11, color: '#374151' }}>{r.object_name ?? '—'}</td>
                    <td style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, color: metaDef?.color ?? '#111827' }}>{fmtVal(r.value, metaDef?.unit)}</td>
                    {data.resolution !== 'raw' && <>
                      <td style={{ padding: '7px 14px', fontSize: 11, color: '#6b7280' }}>{fmtVal(r.value_min, metaDef?.unit)}</td>
                      <td style={{ padding: '7px 14px', fontSize: 11, color: '#6b7280' }}>{fmtVal(r.value_max, metaDef?.unit)}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
