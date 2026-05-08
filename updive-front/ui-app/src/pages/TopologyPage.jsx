import { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
import { getTopology } from '../api';

// ─── Helpers ──────────────────────────────────────────────────────
const fmtBps = (bps) => {
  if (!bps || bps === 0) return '0 bps';
  if (bps >= 1e9) return (bps / 1e9).toFixed(2) + ' Gbps';
  if (bps >= 1e6) return (bps / 1e6).toFixed(2) + ' Mbps';
  if (bps >= 1e3) return (bps / 1e3).toFixed(1) + ' Kbps';
  return bps + ' bps';
};

const nodeColor = (status, os) => {
  if (status !== 1) return '#ef4444';
  return '#22c55e';
};

const nodeShape = (type, os) => {
  if (os === 'windows' || os === 'linux') return 'round-rectangle';
  if (type === 'network' || type === 'switch') return 'diamond';
  if (type === 'firewall') return 'pentagon';
  if (type === 'router') return 'triangle';
  if (type === 'server') return 'round-rectangle';
  if (type === 'wireless-ap') return 'ellipse';
  return 'ellipse';
};

const osIcon = (os, type) => {
  if (os === 'windows') return '🖥';
  if (os === 'linux') return '🐧';
  if (type === 'switch' || os?.includes('ios') || os?.includes('eos') || os?.includes('junos')) return '⬡';
  if (type === 'router') return '⭕';
  if (type === 'firewall') return '🛡';
  if (type === 'server') return '🖥';
  if (type === 'wireless-ap') return '📡';
  return '●';
};

const POSITIONS_KEY = 'topology_positions_v1';

const savePositions = (cy) => {
  const pos = {};
  cy.nodes().forEach(n => { pos[n.id()] = n.position(); });
  try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(pos)); } catch {}
};

const loadPositions = () => {
  try { return JSON.parse(localStorage.getItem(POSITIONS_KEY) || '{}'); } catch { return {}; }
};

// ─── Tooltip ──────────────────────────────────────────────────────
const Tooltip = ({ node, pos, accent }) => {
  if (!node) return null;
  const d = node.data();
  const isUp = d.status === 1;
  return (
    <div style={{
      position: 'fixed', left: pos.x + 16, top: pos.y - 10,
      background: '#1f2937', color: '#f9fafb', borderRadius: 10,
      padding: '10px 14px', fontSize: 12, zIndex: 2000,
      boxShadow: '0 8px 30px rgba(0,0,0,0.4)', minWidth: 200, maxWidth: 280,
      pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#fff' }}>
        {d.label || d.hostname}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', color: '#d1d5db' }}>
        <span style={{ color: '#9ca3af' }}>Status</span>
        <span style={{ color: isUp ? '#4ade80' : '#f87171', fontWeight: 600 }}>{isUp ? 'UP' : 'DOWN'}</span>
        <span style={{ color: '#9ca3af' }}>OS</span>
        <span>{d.os || '—'}</span>
        <span style={{ color: '#9ca3af' }}>Type</span>
        <span>{d.type || '—'}</span>
        {d.traffic_in > 0 && <>
          <span style={{ color: '#9ca3af' }}>↓ In</span>
          <span style={{ color: '#60a5fa' }}>{fmtBps(d.traffic_in * 8)}</span>
        </>}
        {d.traffic_out > 0 && <>
          <span style={{ color: '#9ca3af' }}>↑ Out</span>
          <span style={{ color: '#a78bfa' }}>{fmtBps(d.traffic_out * 8)}</span>
        </>}
        {d.ports_total > 0 && <>
          <span style={{ color: '#9ca3af' }}>Ports</span>
          <span>{d.ports_up}/{d.ports_total} up</span>
        </>}
        <span style={{ color: '#9ca3af' }}>IP</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{d.hostname}</span>
      </div>
    </div>
  );
};

// ─── TopologyPage ─────────────────────────────────────────────────
export const TopologyPage = ({ accent = '#6366f1' }) => {
  const containerRef = useRef(null);
  const cyRef        = useRef(null);
  const [loading, setLoading]     = useState(true);
  const [error,   setError]       = useState('');
  const [stats,   setStats]       = useState({ nodes: 0, edges: 0, up: 0, down: 0 });
  const [tooltip, setTooltip]     = useState({ node: null, pos: { x: 0, y: 0 } });
  const [layout,  setLayout]      = useState('cose');
  const [filter,  setFilter]      = useState('all');

  const buildCy = useCallback((nodes, edges) => {
    if (!containerRef.current) return;
    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

    const saved = loadPositions();

    const cyNodes = nodes
      .filter(n => filter === 'all' || (filter === 'up' && n.status === 1) || (filter === 'down' && n.status !== 1))
      .map(n => ({
        data: { ...n, id: n.id },
        position: saved[n.id] || undefined,
      }));

    const nodeIds = new Set(cyNodes.map(n => n.data.id));
    const cyEdges = edges
      .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map(e => ({
        data: {
          id:       e.id,
          source:   e.source,
          target:   e.target,
          protocol: e.protocol,
          port:     e.port,
          count:    e.count || 1,
        },
      }));

    const cy = cytoscape({
      container: containerRef.current,
      elements:  { nodes: cyNodes, edges: cyEdges },
      style: [
        {
          selector: 'node',
          style: {
            'label':              'data(label)',
            'text-valign':        'bottom',
            'text-halign':        'center',
            'text-margin-y':      4,
            'font-size':          10,
            'font-family':        'Inter, system-ui, sans-serif',
            'color':              '#374151',
            'text-background-color': '#fff',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'background-color':   (n) => nodeColor(n.data('status'), n.data('os')),
            'border-width':       2,
            'border-color':       '#fff',
            'width':              36,
            'height':             36,
            'shape':              (n) => nodeShape(n.data('type'), n.data('os')),
            'overlay-padding':    6,
          },
        },
        {
          selector: 'node[status != 1]',
          style: {
            'border-color': '#fca5a5',
            'border-width': 2,
            'opacity':      0.75,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': accent,
            'border-width': 3,
            'overlay-color': accent,
            'overlay-opacity': 0.1,
          },
        },
        {
          selector: 'edge',
          style: {
            'width':            (e) => Math.min(6, 1 + (e.data('count') - 1) * 1.5),
            'line-color':       '#94a3b8',
            'target-arrow-shape': 'none',
            'curve-style':      'bezier',
            'opacity':          0.7,
          },
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': accent,
            'opacity':    1,
          },
        },
        {
          selector: 'edge[protocol = "hierarchy"]',
          style: {
            'line-style':          'dashed',
            'line-dash-pattern':   [6, 3],
            'line-color':          '#c4b5fd',
          },
        },
      ],
      layout: Object.keys(saved).length > 0
        ? { name: 'preset' }
        : { name: layout, animate: true, animationDuration: 500, padding: 60,
            nodeRepulsion: 8000, idealEdgeLength: 120, edgeElasticity: 0.45,
            gravity: 0.25, numIter: 1000, randomize: false },
      minZoom: 0.1,
      maxZoom: 4,
      wheelSensitivity: 0.2,
    });

    // Hover tooltip
    cy.on('mouseover', 'node', (evt) => {
      setTooltip({ node: evt.target, pos: { x: evt.originalEvent.clientX, y: evt.originalEvent.clientY } });
    });
    cy.on('mouseout', 'node', () => {
      setTooltip({ node: null, pos: { x: 0, y: 0 } });
    });
    cy.on('mousemove', 'node', (evt) => {
      setTooltip(t => ({ ...t, pos: { x: evt.originalEvent.clientX, y: evt.originalEvent.clientY } }));
    });

    // Save positions on drag end
    cy.on('free', 'node', () => savePositions(cy));

    cyRef.current = cy;
  }, [layout, filter, accent]);

  useEffect(() => {
    setLoading(true);
    getTopology()
      .then(({ nodes = [], edges = [] }) => {
        setStats({
          nodes: nodes.length,
          edges: edges.length,
          up:    nodes.filter(n => n.status === 1).length,
          down:  nodes.filter(n => n.status !== 1).length,
        });
        buildCy(nodes, edges);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message || 'Failed to load topology');
        setLoading(false);
      });
    return () => { if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; } };
  }, [buildCy]);

  const fitView  = () => cyRef.current?.fit(undefined, 40);
  const zoomIn   = () => cyRef.current?.zoom({ level: cyRef.current.zoom() * 1.3, renderedPosition: { x: containerRef.current.clientWidth / 2, y: containerRef.current.clientHeight / 2 } });
  const zoomOut  = () => cyRef.current?.zoom({ level: cyRef.current.zoom() * 0.77, renderedPosition: { x: containerRef.current.clientWidth / 2, y: containerRef.current.clientHeight / 2 } });
  const resetPos = () => { localStorage.removeItem(POSITIONS_KEY); if (cyRef.current) { cyRef.current.layout({ name: layout, animate: true, animationDuration: 500, padding: 60, nodeRepulsion: 8000, idealEdgeLength: 120, edgeElasticity: 0.45, gravity: 0.25, numIter: 1000 }).run(); } };

  const S = {
    page:    { display: 'flex', flexDirection: 'column', height: '100%', gap: 0, background: '#f8fafc' },
    header:  { padding: '14px 20px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
    title:   { fontSize: 16, fontWeight: 700, color: '#111827' },
    desc:    { fontSize: 11, color: '#9ca3af', marginTop: 2 },
    toolbar: { display: 'flex', gap: 8, alignItems: 'center' },
    btn:     (active) => ({ padding: '5px 12px', borderRadius: 7, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', background: active ? accent : '#fff', color: active ? '#fff' : '#374151', borderColor: active ? accent : '#d1d5db' }),
    iconBtn: { width: 30, height: 30, borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#374151' },
    stats:   { display: 'flex', gap: 16, alignItems: 'center' },
    stat:    (c) => ({ fontSize: 11, fontWeight: 700, color: c }),
    sep:     { width: 1, height: 16, background: '#e5e7eb' },
    canvas:  { flex: 1, position: 'relative', background: '#f1f5f9' },
    empty:   { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', gap: 12 },
    legend:  { position: 'absolute', bottom: 16, left: 16, background: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', fontSize: 11, display: 'flex', gap: 14 },
    ldot:    (c) => ({ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block', marginRight: 4 }),
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.title}>Network Topology</div>
          <div style={S.desc}>LLDP/CDP asosidagi tarmoq xaritasi · drag & drop · joylashuv saqlanadi</div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Stats */}
          <div style={S.stats}>
            <span style={S.stat('#111827')}>{stats.nodes} node</span>
            <div style={S.sep} />
            <span style={S.stat('#22c55e')}>▲ {stats.up} up</span>
            <div style={S.sep} />
            <span style={S.stat('#ef4444')}>▼ {stats.down} down</span>
            {stats.edges > 0 && <><div style={S.sep} /><span style={S.stat('#6b7280')}>{stats.edges} links</span></>}
          </div>

          <div style={S.sep} />

          {/* Filter */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[['all','All'],['up','Up only'],['down','Down only']].map(([v,l]) => (
              <button key={v} style={S.btn(filter === v)} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>

          <div style={S.sep} />

          {/* Layout */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[['cose','Auto'],['circle','Circle'],['grid','Grid']].map(([v,l]) => (
              <button key={v} style={S.btn(layout === v)} onClick={() => setLayout(v)}>{l}</button>
            ))}
          </div>

          <div style={S.sep} />

          {/* Zoom controls */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={S.iconBtn} onClick={zoomIn}  title="Zoom in">+</button>
            <button style={S.iconBtn} onClick={zoomOut} title="Zoom out">−</button>
            <button style={{ ...S.iconBtn, fontSize: 12 }} onClick={fitView} title="Fit view">⊡</button>
            <button style={{ ...S.iconBtn, fontSize: 10 }} onClick={resetPos} title="Reset layout">↺</button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div style={S.canvas}>
        {loading && (
          <div style={S.empty}>
            <div style={{ width: 32, height: 32, border: `3px solid #e5e7eb`, borderTopColor: accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: 13 }}>Topologiya yuklanmoqda...</span>
          </div>
        )}
        {error && (
          <div style={S.empty}>
            <span style={{ fontSize: 24 }}>⚠</span>
            <span style={{ color: '#ef4444', fontSize: 13 }}>{error}</span>
          </div>
        )}

        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {/* Empty state (no LLDP) */}
        {!loading && !error && stats.edges === 0 && stats.nodes > 0 && (
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
            padding: '8px 16px', fontSize: 11, color: '#92400e', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>ℹ</span>
            <span>LLDP/CDP ulanishlar hali yo'q — qurilmalar SNMP orqali topilganda chiziqlar avtomatik paydo bo'ladi</span>
          </div>
        )}

        {!loading && !error && stats.nodes === 0 && (
          <div style={S.empty}>
            <span style={{ fontSize: 40 }}>🌐</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Qurilmalar yo'q</span>
            <span style={{ fontSize: 12 }}>Avval qurilma qo'shing</span>
          </div>
        )}

        {/* Legend */}
        {!loading && stats.nodes > 0 && (
          <div style={S.legend}>
            <span><span style={S.ldot('#22c55e')} />UP</span>
            <span><span style={S.ldot('#ef4444')} />DOWN</span>
            <span style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: 14, color: '#6b7280' }}>⬡ Switch</span>
            <span style={{ color: '#6b7280' }}>⭕ Router</span>
            <span style={{ color: '#6b7280' }}>🖥 Server</span>
            <span style={{ color: '#6b7280', fontSize: 10 }}>Qalin chiziq = ko'p ulanish</span>
          </div>
        )}
      </div>

      <Tooltip node={tooltip.node} pos={tooltip.pos} accent={accent} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default TopologyPage;
