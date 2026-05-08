import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/Charts';

const api = (path) => fetch(`/api/v0${path}`).then(r => r.json());

const urgencyColor = (days) => {
  if (days <= 3)  return '#ef4444';
  if (days <= 7)  return '#f97316';
  if (days <= 14) return '#f59e0b';
  if (days <= 30) return '#eab308';
  return '#22c55e';
};

const metricLabel = (type) => ({
  port_in:  'Traffic In',
  port_out: 'Traffic Out',
  cpu:      'CPU',
  mem:      'Memory',
}[type] || type);

const fmtBytes = (v, unit) => {
  if (unit === '%' || v === null || v === undefined) return v?.toFixed(1) + '%' ?? '—';
  const mb = v / 1024 / 1024;
  return mb >= 1 ? mb.toFixed(1) + ' MB/s' : (v / 1024).toFixed(1) + ' KB/s';
};

const StatCard = ({ label, value, color = '#6366f1', sub }) => (
  <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: '14px 18px', flex: 1, minWidth: 120 }}>
    <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginTop: 2 }}>{label}</div>
    {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
  </div>
);

const UsageBar = ({ pct, color }) => (
  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', width: '100%' }}>
    <div style={{ height: '100%', width: `${Math.min(100, pct || 0)}%`, background: color, borderRadius: 3, transition: 'width 0.3s' }} />
  </div>
);

export const AnomalyPage = ({ accent = '#6366f1' }) => {
  const [tab,       setTab]       = useState('forecasts');
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('all'); // all | critical | warning

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/anomaly?limit=100');
      setData(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const forecasts = (data?.forecasts ?? []).filter(f => {
    if (filter === 'critical') return f.days_until_limit <= 7;
    if (filter === 'warning')  return f.days_until_limit > 7 && f.days_until_limit <= 30;
    return true;
  });

  const anomalies = data?.anomalies ?? [];
  const stats     = data?.stats ?? {};

  const S = {
    tab: (active) => ({
      padding: '7px 18px', borderRadius: 7, border: 'none', fontFamily: 'inherit',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
      background: active ? accent : 'transparent',
      color: active ? '#fff' : '#6b7280',
    }),
    card: { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' },
    th: { padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f8fafc', borderBottom: '1px solid #e8ecf0' },
    td: { padding: '10px 12px', fontSize: 12, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
    badge: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: color + '20', color }),
    filterBtn: (active) => ({
      padding: '5px 12px', borderRadius: 6, border: `1px solid ${active ? accent : '#e5e7eb'}`,
      background: active ? accent + '15' : '#fff', color: active ? accent : '#6b7280',
      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    }),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Anomaliya va Bashorat"
        desc="Trend tahlil va oldindan ogohlantirish tizimi"
      />

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Jami bashoratlar"   value={loading ? '…' : stats.forecasts_total ?? 0} color={accent} />
        <StatCard label="Kritik (7 kun)"     value={loading ? '…' : stats.critical_7d ?? 0}     color="#ef4444" sub="To'lib qolishiga yaqin" />
        <StatCard label="Ogohlantirish (30 kun)" value={loading ? '…' : stats.warning_30d ?? 0} color="#f59e0b" />
        <StatCard label="Anomaliya (24 soat)" value={loading ? '…' : stats.anomalies_24h ?? 0}  color="#7c3aed" />
        <StatCard label="Baseline yozuvlar"  value={loading ? '…' : stats.baselines_built ?? 0} color="#0891b2" sub="Soatlik pattern" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button style={S.tab(tab === 'forecasts')} onClick={() => setTab('forecasts')}>
          📈 Bashoratlar
        </button>
        <button style={S.tab(tab === 'anomalies')} onClick={() => setTab('anomalies')}>
          ⚠️ Anomaliyalar
        </button>
        <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 11, color: '#6b7280', fontFamily: 'inherit' }}>
          🔄 Yangilash
        </button>
      </div>

      {/* ── Forecasts tab ── */}
      {tab === 'forecasts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Info banner */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1d4ed8', display: 'flex', gap: 8 }}>
            <span>ℹ️</span>
            <span>Linear regression asosida hisoblangan. Kamida 6 soatlik tarix kerak. R² ≥ 0.3 bo'lgan natijalar ko'rsatiladi.</span>
          </div>

          {/* Filter */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[['all', 'Hammasi'], ['critical', '🔴 Kritik (≤7 kun)'], ['warning', '🟡 Ogohlantirish (≤30 kun)']].map(([v, l]) => (
              <button key={v} style={S.filterBtn(filter === v)} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>

          <div style={S.card}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Yuklanmoqda…</div>
            ) : forecasts.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                {stats.baselines_built === 0
                  ? 'Hali etarli ma\'lumot yo\'q. Tizim 1-2 kun ishlagandan keyin bashoratlar paydo bo\'ladi.'
                  : 'Bashorat uchun yaqinlashayotgan chegara topilmadi.'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Qurilma', 'Port / Metrik', 'Tur', 'Joriy foydalanish', 'Trend', 'Bashorat', 'Ishonch'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {forecasts.map((f, i) => {
                    const color = urgencyColor(f.days_until_limit);
                    const pct   = f.usage_pct ?? 0;
                    const trend = f.slope_per_hour > 0 ? `+${fmtBytes(f.slope_per_hour)}/soat` : `${fmtBytes(f.slope_per_hour)}/soat`;
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={S.td}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{f.device_label}</div>
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>{f.hostname}</div>
                        </td>
                        <td style={S.td}>
                          <span style={{ fontSize: 11, color: '#374151' }}>{f.object_name}</span>
                        </td>
                        <td style={S.td}>
                          <span style={S.badge('#6366f1')}>{metricLabel(f.metric_type)}</span>
                        </td>
                        <td style={{ ...S.td, minWidth: 140 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: pct > 80 ? '#ef4444' : '#374151' }}>
                              {pct.toFixed(1)}%
                            </span>
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>{fmtBytes(f.current_value)}</span>
                          </div>
                          <UsageBar pct={pct} color={pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#22c55e'} />
                        </td>
                        <td style={{ ...S.td, fontSize: 11, color: f.slope_per_hour > 0 ? '#ef4444' : '#22c55e' }}>
                          {trend}
                        </td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, color, fontSize: 12 }}>
                              {f.days_until_limit < 1
                                ? 'Bugun!'
                                : f.days_until_limit < 2
                                ? 'Ertaga'
                                : `${Math.round(f.days_until_limit)} kun`}
                            </span>
                          </div>
                        </td>
                        <td style={S.td}>
                          <div style={{ fontSize: 11, color: f.r_squared >= 0.7 ? '#22c55e' : f.r_squared >= 0.5 ? '#f59e0b' : '#9ca3af' }}>
                            R² = {f.r_squared?.toFixed(2)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Anomalies tab ── */}
      {tab === 'anomalies' && (
        <div style={S.card}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Yuklanmoqda…</div>
          ) : anomalies.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Oxirgi 24 soatda anomaliya aniqlanmadi</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Vaqt', 'Qurilma', 'Metrik', 'Xabar'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a, i) => (
                  <tr key={a.event_id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap', fontSize: 11, color: '#6b7280' }}>
                      {new Date(a.datetime).toLocaleString('uz-UZ', { hour12: false })}
                    </td>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{a.display || a.sysName || a.hostname}</div>
                    </td>
                    <td style={S.td}>
                      <span style={S.badge('#7c3aed')}>{metricLabel(a.reference)}</span>
                    </td>
                    <td style={{ ...S.td, maxWidth: 400 }}>
                      <span style={{ fontSize: 11, color: '#374151' }}>{a.message.replace('[Anomaly] ', '')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default AnomalyPage;
