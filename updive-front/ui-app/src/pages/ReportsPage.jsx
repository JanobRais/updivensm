import { useState } from 'react';
import { PageHeader } from '../components/Charts';

const REPORTS = [
  {
    id:    'devices',
    title: 'Qurilma holati',
    desc:  'Barcha qurilmalar: IP, OS, holat, uptime',
    icon:  '🖥',
    color: '#2563eb',
    hasFormat: true,
    hasDays:   false,
    hasLimit:  false,
  },
  {
    id:    'uptime',
    title: 'Uptime SLA',
    desc:  '30 kunlik uptime foizi (%) har qurilma uchun',
    icon:  '⏱',
    color: '#16a34a',
    hasFormat: true,
    hasDays:   false,
    hasLimit:  false,
  },
  {
    id:    'ports',
    title: 'Port Utilization',
    desc:  'Eng yuqori traffic portlari, Mbps va utilization %',
    icon:  '📡',
    color: '#0891b2',
    hasFormat: true,
    hasDays:   false,
    hasLimit:  true,
  },
  {
    id:    'top-traffic',
    title: 'Top Traffic',
    desc:  'Eng ko\'p traffic qurilmalar (In + Out Mbps)',
    icon:  '📊',
    color: '#7c3aed',
    hasFormat: true,
    hasDays:   false,
    hasLimit:  true,
  },
  {
    id:    'alerts',
    title: 'Alert tarixi',
    desc:  'So\'nggi N kunda yoqilgan/o\'chirilgan alertlar',
    icon:  '🔔',
    color: '#dc2626',
    hasFormat: true,
    hasDays:   true,
    hasLimit:  true,
  },
];

const fmtIcon = (fmt) => fmt === 'pdf' ? '📄' : '📊';

export const ReportsPage = ({ accent = '#6366f1' }) => {
  const [configs, setConfigs] = useState(() =>
    Object.fromEntries(REPORTS.map(r => [r.id, { format: 'excel', days: 30, limit: 50 }]))
  );
  const [loading, setLoading] = useState({});
  const [errors,  setErrors]  = useState({});

  const set = (id, key, val) =>
    setConfigs(c => ({ ...c, [id]: { ...c[id], [key]: val } }));

  const download = async (report) => {
    const cfg = configs[report.id];
    setLoading(l => ({ ...l, [report.id]: true }));
    setErrors(e => ({ ...e, [report.id]: '' }));

    const params = new URLSearchParams({ format: cfg.format });
    if (report.hasDays)  params.set('days',  cfg.days);
    if (report.hasLimit) params.set('limit', cfg.limit);

    try {
      const resp = await fetch(`/api/v0/reports/${report.id}?${params}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${resp.status}`);
      }

      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${report.id}_${new Date().toISOString().slice(0,10)}.${cfg.format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrors(err => ({ ...err, [report.id]: e.message || 'Yuklab bo\'lmadi' }));
    }

    setLoading(l => ({ ...l, [report.id]: false }));
  };

  const S = {
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 },
    card: (color) => ({
      background: '#fff', borderRadius: 12, border: '1px solid #e8ecf0',
      overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      borderTop: `3px solid ${color}`,
    }),
    cardHead: (color) => ({
      padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start',
    }),
    icon: (color) => ({
      width: 44, height: 44, borderRadius: 10,
      background: color + '15', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 22, flexShrink: 0,
    }),
    cardBody: { padding: '0 20px 16px' },
    label: { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' },
    input: { padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', color: '#111827', background: '#fff', width: '100%', boxSizing: 'border-box' },
    row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 },
    fmtBtn: (active, color) => ({
      flex: 1, padding: '7px 0', borderRadius: 7, border: `1px solid ${active ? color : '#e5e7eb'}`,
      background: active ? color : '#fff', color: active ? '#fff' : '#6b7280',
      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    }),
    dlBtn: (color, disabled) => ({
      width: '100%', padding: '9px 0', borderRadius: 8, border: 'none',
      background: disabled ? '#e5e7eb' : color, color: disabled ? '#9ca3af' : '#fff',
      fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }),
    errBox: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#dc2626', marginTop: 8 },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Hisobotlar"
        desc="PDF yoki Excel formatda hisobot yuklab olish."
      />

      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#166534', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 18 }}>💡</span>
        <span><strong>Excel</strong> — jadval, filtrlash, grafik uchun. &nbsp; <strong>PDF</strong> — chop etish, yuborish uchun.</span>
      </div>

      <div style={S.grid}>
        {REPORTS.map(report => {
          const cfg  = configs[report.id];
          const busy = loading[report.id];
          const err  = errors[report.id];

          return (
            <div key={report.id} style={S.card(report.color)}>
              {/* Header */}
              <div style={S.cardHead(report.color)}>
                <div style={S.icon(report.color)}>{report.icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{report.title}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, lineHeight: 1.4 }}>{report.desc}</div>
                </div>
              </div>

              <div style={S.cardBody}>
                {/* Format selector */}
                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>Format</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[['excel','📊 Excel'],['pdf','📄 PDF']].map(([fmt, lbl]) => (
                      <button key={fmt} style={S.fmtBtn(cfg.format === fmt, report.color)}
                        onClick={() => set(report.id, 'format', fmt)}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Days / Limit */}
                {(report.hasDays || report.hasLimit) && (
                  <div style={S.row}>
                    {report.hasDays && (
                      <div>
                        <label style={S.label}>Kun oralig'i</label>
                        <select style={S.input} value={cfg.days} onChange={e => set(report.id, 'days', e.target.value)}>
                          {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} kun</option>)}
                        </select>
                      </div>
                    )}
                    {report.hasLimit && (
                      <div>
                        <label style={S.label}>Qatorlar soni</label>
                        <select style={S.input} value={cfg.limit} onChange={e => set(report.id, 'limit', e.target.value)}>
                          {[25, 50, 100, 200, 500].map(l => <option key={l} value={l}>{l} ta</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Download button */}
                <button style={S.dlBtn(report.color, busy)} onClick={() => download(report)} disabled={busy}>
                  {busy
                    ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Tayyorlanmoqda...</>
                    : <>{fmtIcon(cfg.format)} {cfg.format.toUpperCase()} yuklab olish</>}
                </button>

                {err && <div style={S.errBox}>⚠ {err}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ReportsPage;
