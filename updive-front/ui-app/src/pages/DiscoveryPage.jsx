import { useState, useEffect } from 'react';
import { PageHeader, Badge, TableCard, TD } from '../components/Charts';
import { getDiscoveryCandidates, getCommunityPool, saveCommunityPool, cidrScan, addDevice, invalidateCache } from '../api';

// ─── helpers ──────────────────────────────────────────────────────
const fmtMac = (mac) => {
  if (!mac) return '—';
  const h = mac.replace(/[^0-9a-fA-F]/g, '');
  return h.length === 12 ? h.match(/.{2}/g).join(':') : mac;
};

const sourceBadge = (src) => {
  const colors = { arp: ['#0891b2', '#e0f2fe'], lldp: ['#7c3aed', '#ede9fe'], cdp: ['#d97706', '#fef3c7'] };
  const [c, bg] = colors[src] || ['#6b7280', '#f3f4f6'];
  return <span style={{ fontSize: 10, fontWeight: 700, color: c, background: bg, padding: '2px 8px', borderRadius: 12, border: `1px solid ${c}30` }}>{src?.toUpperCase()}</span>;
};

const Err = ({ msg }) => msg ? <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: '#dc2626', marginTop: 8 }}>{msg}</div> : null;
const Ok  = ({ msg }) => msg ? <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: '#16a34a', marginTop: 8 }}>{msg}</div> : null;

const Btn = ({ onClick, disabled, color = '#6366f1', children, style: s = {} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: '7px 16px', borderRadius: 8, border: 'none',
    background: disabled ? '#e5e7eb' : color,
    color: disabled ? '#9ca3af' : '#fff',
    fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', ...s,
  }}>{children}</button>
);

// ─── Quick Add modal ──────────────────────────────────────────────
const QuickAddModal = ({ ip, community, accent, onClose, onAdded }) => {
  const [form, setForm]     = useState({ hostname: ip, community: community || 'public', snmpver: 'v2c', port: '161', transport: 'udp' });
  const [loading, setLoad]  = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoad(true); setError('');
    try {
      const res = await addDevice({ hostname: form.hostname.trim(), community: form.community, snmpver: form.snmpver, port: Number(form.port) || 161, transport: form.transport });
      if (res.status === 'ok') { invalidateCache('devices'); onAdded(form.hostname.trim()); onClose(); }
      else setError(res.message || 'Qo\'shib bo\'lmadi');
    } catch (e) { setError(e.response?.data?.message || e.message || 'Xato'); }
    setLoad(false);
  };

  const F = { label: { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3, display: 'block' }, input: { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fff' } };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Qurilma qo'shish</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 10 }}>
            <label style={F.label}>IP / Hostname</label>
            <input style={F.input} value={form.hostname} onChange={e => set('hostname', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label style={F.label}>Community</label><input style={F.input} value={form.community} onChange={e => set('community', e.target.value)} /></div>
            <div><label style={F.label}>Port</label><input style={F.input} value={form.port} onChange={e => set('port', e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={F.label}>SNMP Version</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {['v1','v2c','v3'].map(v => (
                <button key={v} onClick={() => set('snmpver', v)} style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: form.snmpver === v ? accent : '#fff', color: form.snmpver === v ? '#fff' : '#6b7280', borderColor: form.snmpver === v ? accent : '#e5e7eb' }}>SNMP {v}</button>
              ))}
            </div>
          </div>
          <Err msg={error} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>Bekor</button>
            <Btn onClick={submit} disabled={loading} color={accent}>{loading ? 'Qo\'shilmoqda...' : 'Qo\'shish'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── DiscoveryPage ────────────────────────────────────────────────
export const DiscoveryPage = ({ accent = '#6366f1' }) => {
  const [tab, setTab] = useState('candidates');

  // Candidates
  const [candidates, setCandidates] = useState([]);
  const [cLoading,   setCLoading]   = useState(true);
  const [cFilter,    setCFilter]    = useState('');
  const [addModal,   setAddModal]   = useState(null);
  const [ok,         setOk]         = useState('');

  // CIDR Scan
  const [cidr,       setCidr]       = useState('');
  const [scanLimit,  setScanLimit]  = useState('254');
  const [scanning,   setScanning]   = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError,  setScanError]  = useState('');

  // Community Pool
  const [pool,       setPool]       = useState([]);
  const [newComm,    setNewComm]    = useState('');
  const [poolSaving, setPoolSaving] = useState(false);
  const [poolOk,     setPoolOk]     = useState('');

  useEffect(() => {
    getDiscoveryCandidates()
      .then(d => { setCandidates(d.candidates || []); setCLoading(false); })
      .catch(() => setCLoading(false));
    getCommunityPool().then(setPool);
  }, []);

  const refresh = () => {
    setCLoading(true);
    getDiscoveryCandidates().then(d => { setCandidates(d.candidates || []); setCLoading(false); });
  };

  const runScan = async () => {
    if (!cidr.trim()) { setScanError('CIDR kiritilmagan'); return; }
    setScanning(true); setScanResult(null); setScanError('');
    try {
      const r = await cidrScan({ cidr: cidr.trim(), limit: Number(scanLimit) || 254 });
      setScanResult(r);
    } catch (e) { setScanError(e.response?.data?.message || e.message || 'Scan xato'); }
    setScanning(false);
  };

  const addPool = () => {
    if (!newComm.trim() || pool.includes(newComm.trim())) return;
    setPool(p => [...p, newComm.trim()]); setNewComm('');
  };
  const removePool = (c) => setPool(p => p.filter(x => x !== c));
  const savePool = async () => {
    setPoolSaving(true);
    await saveCommunityPool(pool);
    setPoolOk('Saqlandi'); setTimeout(() => setPoolOk(''), 2000);
    setPoolSaving(false);
  };

  const filtered = candidates.filter(c => !cFilter || c.ip?.includes(cFilter) || c.seen_on?.includes(cFilter));

  const S = {
    tab: (active) => ({
      padding: '8px 18px', border: 'none', borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
      background: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 500,
      color: active ? accent : '#6b7280', cursor: 'pointer', marginBottom: -1,
    }),
    card: { background: '#fff', borderRadius: 12, border: '1px solid #e8ecf0', overflow: 'hidden' },
    cardHead: { padding: '14px 20px', borderBottom: '1px solid #f0f2f5' },
    cardBody: { padding: 20 },
    inputRow: { display: 'flex', gap: 8, alignItems: 'center' },
    input: { flex: 1, padding: '8px 12px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'inherit', outline: 'none', color: '#111827', background: '#fff' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader title="Auto-Discovery" desc="Tarmoqdagi yangi qurilmalarni avtomatik topish." />
      <Ok msg={ok} />

      {/* Tab bar */}
      <div style={{ borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 0 }}>
        <button style={S.tab(tab === 'candidates')} onClick={() => setTab('candidates')}>
          Kandidatlar {candidates.length > 0 && <span style={{ marginLeft: 6, background: accent, color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{candidates.length}</span>}
        </button>
        <button style={S.tab(tab === 'scan')} onClick={() => setTab('scan')}>CIDR Scan</button>
        <button style={S.tab(tab === 'pool')} onClick={() => setTab('pool')}>Community Pool</button>
      </div>

      {/* ── Candidates tab ── */}
      {tab === 'candidates' && (
        <div style={S.card}>
          <div style={{ ...S.cardHead, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Topilgan kandidatlar</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>ARP jadvali va LLDP qo'shnilaridan monitoring da yo'q qurilmalar</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input style={{ ...S.input, flex: 'none', width: 180 }} placeholder="IP yoki qurilma qidirish..." value={cFilter} onChange={e => setCFilter(e.target.value)} />
              <Btn onClick={refresh} disabled={cLoading} color='#6b7280' style={{ padding: '6px 12px' }}>↺ Yangilash</Btn>
            </div>
          </div>

          {cLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Yuklanmoqda...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Yangi qurilmalar topilmadi</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Monitoring qurilmalarining ARP va LLDP jadvallari skanerlandi</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['IP Manzil', 'MAC', 'Manba', 'Ko\'rindi', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#374151' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.ip} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <TD mono bold>{c.ip}</TD>
                    <TD mono>{fmtMac(c.mac)}</TD>
                    <td style={{ padding: '10px 14px' }}>{sourceBadge(c.source)}</td>
                    <TD>{c.seen_on || '—'}</TD>
                    <td style={{ padding: '10px 14px' }}>
                      <Btn onClick={() => setAddModal({ ip: c.ip })} color={accent} style={{ padding: '4px 12px', fontSize: 11 }}>+ Monitoring ga qo'sh</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── CIDR Scan tab ── */}
      {tab === 'scan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={S.card}>
            <div style={S.cardHead}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>CIDR Scan</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>fping + SNMP community pool bilan tarmoqni skanerlash</div>
            </div>
            <div style={S.cardBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'end', marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>CIDR tarmoq</label>
                  <input style={S.input} placeholder="masalan: 192.168.1.0/24" value={cidr} onChange={e => setCidr(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runScan()} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Limit</label>
                  <input style={{ ...S.input, flex: 'none', width: 80 }} value={scanLimit} onChange={e => setScanLimit(e.target.value)} />
                </div>
                <Btn onClick={runScan} disabled={scanning} color={accent} style={{ height: 36 }}>
                  {scanning ? '⏳ Skanerlanmoqda...' : '🔍 Scan qilish'}
                </Btn>
              </div>

              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>
                Ishlatiladigan community-lar: <strong style={{ color: '#374151' }}>{pool.join(', ') || '—'}</strong>
                <span style={{ marginLeft: 8, cursor: 'pointer', color: accent }} onClick={() => setTab('pool')}>o'zgartirish →</span>
              </div>

              <Err msg={scanError} />
            </div>
          </div>

          {scanning && (
            <div style={{ ...S.card, padding: 40, textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ width: 32, height: 32, border: `3px solid #e5e7eb`, borderTopColor: accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13 }}>Tarmoq skanerlanmoqda, bu bir necha daqiqa olishi mumkin...</div>
            </div>
          )}

          {scanResult && !scanning && (
            <div style={S.card}>
              <div style={{ ...S.cardHead, display: 'flex', gap: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Scan natijalari</div>
                <div style={{ display: 'flex', gap: 16, marginLeft: 16 }}>
                  <span style={{ fontSize: 12 }}>📡 <strong>{scanResult.alive}</strong> jonli host</span>
                  <span style={{ fontSize: 12 }}>✅ <strong>{scanResult.snmp}</strong> SNMP javob berdi</span>
                  <span style={{ fontSize: 12 }}>🔍 <strong>{scanResult.scanned}</strong> ta skanerlandi</span>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['IP', 'Ping', 'SNMP', 'Community', 'sysDescr', 'Holat', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scanResult.results.map((r, i) => (
                    <tr key={r.ip} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <TD mono bold>{r.ip}</TD>
                      <td style={{ padding: '10px 14px' }}><span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span></td>
                      <td style={{ padding: '10px 14px' }}>
                        {r.snmp ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span> : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                      <TD mono>{r.community || '—'}</TD>
                      <td style={{ padding: '10px 14px', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: '#374151' }}>{r.sysdescr || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {r.monitored
                          ? <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', padding: '2px 8px', borderRadius: 12 }}>Monitoring da</span>
                          : <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 12 }}>Yangi</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {!r.monitored && (
                          <Btn onClick={() => setAddModal({ ip: r.ip, community: r.community })} color={accent} style={{ padding: '4px 12px', fontSize: 11 }}>+ Qo'sh</Btn>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Community Pool tab ── */}
      {tab === 'pool' && (
        <div style={S.card}>
          <div style={S.cardHead}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>SNMP Community Pool</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>CIDR scan paytida har bir host uchun bu community-lar ketma-ket sinab ko'riladi</div>
          </div>
          <div style={S.cardBody}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, minHeight: 40 }}>
              {pool.map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 12px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#111827' }}>{c}</span>
                  <button onClick={() => removePool(c)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ))}
              {pool.length === 0 && <span style={{ color: '#9ca3af', fontSize: 12 }}>Community pool bo'sh</span>}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 360 }}>
              <input style={S.input} placeholder="Yangi community qo'shish..." value={newComm}
                onChange={e => setNewComm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPool()} />
              <Btn onClick={addPool} color='#6b7280' style={{ whiteSpace: 'nowrap', padding: '7px 14px' }}>+ Qo'sh</Btn>
            </div>

            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16, background: '#f9fafb', borderRadius: 8, padding: '10px 14px', border: '1px solid #f0f2f5' }}>
              💡 Eng ko'p ishlatiladigan community-lar: <code>public</code>, <code>private</code>, <code>community</code>, <code>snmp</code>
            </div>

            <Ok msg={poolOk} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={savePool} disabled={poolSaving} color={accent}>{poolSaving ? 'Saqlanmoqda...' : 'Saqlash'}</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Modal */}
      {addModal && (
        <QuickAddModal
          ip={addModal.ip}
          community={addModal.community}
          accent={accent}
          onClose={() => setAddModal(null)}
          onAdded={(h) => { setOk(`${h} monitoring ga qo'shildi`); setTimeout(() => setOk(''), 3000); refresh(); }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default DiscoveryPage;
