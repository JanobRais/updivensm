import { useState, useEffect } from 'react';
import { Badge, Icon, TableCard, PageHeader, TD } from '../components/Charts';
import {
  getOspf, getVrf, getVlans, getDeviceGroups, getPortGroups,
  getLocations, getBills, getPortSecurity, getArp,
} from '../api';

const Wrap = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
);

const Empty = ({ label }) => (
  <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', padding: 40, textAlign: 'center' }}>
    <Icon name="server" size={36} color="#d1d5db" />
    <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 10 }}>{label}</p>
  </div>
);

// ─── OSPF ─────────────────────────────────────────────────────────
export const OspfPage = () => {
  const [rows, setRows] = useState([]);
  useEffect(() => { getOspf().then(setRows).catch(() => {}); }, []);
  return (
    <Wrap>
      <PageHeader title="OSPF Sessions" desc="Open Shortest Path First neighbour sessions." />
      {rows.length === 0
        ? <Empty label="No OSPF sessions found." />
        : <TableCard headers={['Device', 'Area', 'Neighbour IP', 'Priority', 'State', 'Events']} rows={rows}
            renderRow={(r, i) => (
              <tr key={r.ospf_nbr_id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <TD bold>{r.hostname || r.device_id}</TD>
                <TD mono>{r.ospf_area_id ?? r.ospfNbrAddressLessIndex ?? '—'}</TD>
                <TD mono>{r.ospfNbrIpAddr || '—'}</TD>
                <TD>{r.ospfNbrPriority ?? '—'}</TD>
                <td style={{ padding: '10px 14px' }}>
                  <Badge status={r.ospfNbrState === 'full' ? 'up' : 'down'} />
                </td>
                <TD>{r.ospfNbrEvents ?? '—'}</TD>
              </tr>
            )} />}
    </Wrap>
  );
};

// ─── VRF ──────────────────────────────────────────────────────────
export const VrfPage = () => {
  const [rows, setRows] = useState([]);
  useEffect(() => { getVrf().then(setRows).catch(() => {}); }, []);
  return (
    <Wrap>
      <PageHeader title="VRFs" desc="Virtual Routing and Forwarding instances." />
      {rows.length === 0
        ? <Empty label="No VRF instances found." />
        : <TableCard headers={['Device', 'VRF Name', 'Route Distinguisher', 'Description']} rows={rows}
            renderRow={(r, i) => (
              <tr key={r.vrf_id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <TD bold>{r.hostname || r.device_id}</TD>
                <TD mono>{r.vrf_name || '—'}</TD>
                <TD mono>{r.rd || r.mplsVpnVrfRouteDistinguisher || '—'}</TD>
                <TD>{r.mplsVpnVrfDescription || r.vrf_desc || '—'}</TD>
              </tr>
            )} />}
    </Wrap>
  );
};

// ─── VLANs ────────────────────────────────────────────────────────
export const VlansPage = () => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  useEffect(() => { getVlans().then(setRows).catch(() => {}); }, []);
  const filtered = rows.filter(r =>
    !search ||
    String(r.vlan_id).includes(search) ||
    (r.vlan_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.hostname || '').toLowerCase().includes(search.toLowerCase())
  );
  return (
    <Wrap>
      <PageHeader title="VLANs" desc="Virtual LAN assignments across all devices." />
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="Search VLAN ID, name or device…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '7px 12px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, outline: 'none' }}
        />
      </div>
      {filtered.length === 0
        ? <Empty label="No VLANs found." />
        : <TableCard headers={['VLAN ID', 'Name', 'Type', 'MTU', 'Device']} rows={filtered}
            renderRow={(r, i) => (
              <tr key={`${r.vlan_id}-${r.device_id}-${i}`} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <TD mono bold>{r.vlan_id}</TD>
                <TD>{r.vlan_name || '—'}</TD>
                <TD>{r.vlan_type || '—'}</TD>
                <TD>{r.vlan_mtu || '—'}</TD>
                <TD>{r.hostname || r.device_id || '—'}</TD>
              </tr>
            )} />}
    </Wrap>
  );
};

// ─── DEVICE GROUPS ────────────────────────────────────────────────
export const DeviceGroupsPage = () => {
  const [rows, setRows] = useState([]);
  useEffect(() => { getDeviceGroups().then(setRows).catch(() => {}); }, []);
  return (
    <Wrap>
      <PageHeader title="Device Groups" desc="Logical groupings of managed devices." />
      {rows.length === 0
        ? <Empty label="No device groups defined." />
        : <TableCard headers={['ID', 'Name', 'Type', 'Description']} rows={rows}
            renderRow={(r, i) => (
              <tr key={r.id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <TD mono>{r.id}</TD>
                <TD bold>{r.name}</TD>
                <TD>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: r.type === 'dynamic' ? '#eff6ff' : '#f0fdf4', color: r.type === 'dynamic' ? '#2563eb' : '#16a34a', fontWeight: 600 }}>
                    {r.type || 'static'}
                  </span>
                </TD>
                <TD>{r.desc || r.description || '—'}</TD>
              </tr>
            )} />}
    </Wrap>
  );
};

// ─── PORT GROUPS ──────────────────────────────────────────────────
export const PortGroupsPage = () => {
  const [rows, setRows] = useState([]);
  useEffect(() => { getPortGroups().then(setRows).catch(() => {}); }, []);
  return (
    <Wrap>
      <PageHeader title="Port Groups" desc="Logical groupings of interfaces." />
      {rows.length === 0
        ? <Empty label="No port groups defined." />
        : <TableCard headers={['ID', 'Name', 'Description']} rows={rows}
            renderRow={(r, i) => (
              <tr key={r.port_group_id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <TD mono>{r.port_group_id || r.id}</TD>
                <TD bold>{r.name}</TD>
                <TD>{r.description || r.desc || '—'}</TD>
              </tr>
            )} />}
    </Wrap>
  );
};

// ─── LOCATIONS ────────────────────────────────────────────────────
export const LocationsPage = () => {
  const [rows, setRows] = useState([]);
  useEffect(() => { getLocations().then(setRows).catch(() => {}); }, []);
  return (
    <Wrap>
      <PageHeader title="Locations" desc="Physical site locations for managed devices." />
      {rows.length === 0
        ? <Empty label="No locations defined." />
        : <TableCard headers={['Location', 'Latitude', 'Longitude', 'Devices']} rows={rows}
            renderRow={(r, i) => (
              <tr key={r.id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <TD bold>{r.location}</TD>
                <TD mono>{r.lat != null ? Number(r.lat).toFixed(5) : '—'}</TD>
                <TD mono>{r.lng != null ? Number(r.lng).toFixed(5) : '—'}</TD>
                <TD>{r.devices ?? '—'}</TD>
              </tr>
            )} />}
    </Wrap>
  );
};

// ─── BILLS ────────────────────────────────────────────────────────
const fmtBps = (bps) => {
  if (bps == null) return '—';
  const n = Number(bps);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' Gbps';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' Mbps';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + ' Kbps';
  return n + ' bps';
};

export const BillsPage = () => {
  const [rows, setRows] = useState([]);
  useEffect(() => { getBills().then(setRows).catch(() => {}); }, []);
  return (
    <Wrap>
      <PageHeader title="Bills" desc="Traffic billing records." />
      {rows.length === 0
        ? <Empty label="No bills found." />
        : <TableCard headers={['Name', 'Type', 'In (95th)', 'Out (95th)', 'Total In', 'Total Out', 'Status']} rows={rows}
            renderRow={(r, i) => (
              <tr key={r.bill_id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <TD bold>{r.bill_name}</TD>
                <TD>{r.bill_type || '—'}</TD>
                <TD mono>{fmtBps(r.rate_95th_in)}</TD>
                <TD mono>{fmtBps(r.rate_95th_out)}</TD>
                <TD mono>{fmtBps(r.total_in)}</TD>
                <TD mono>{fmtBps(r.total_out)}</TD>
                <td style={{ padding: '10px 14px' }}>
                  <Badge status={r.bill_allowed >= (r.rate_95th_in || 0) ? 'up' : 'down'} />
                </td>
              </tr>
            )} />}
    </Wrap>
  );
};

// ─── PORT SECURITY ────────────────────────────────────────────────
export const PortSecurityPage = () => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  useEffect(() => { getPortSecurity().then(setRows).catch(() => {}); }, []);
  const filtered = rows.filter(r =>
    !search ||
    (r.mac_address || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.ip_address || '').includes(search) ||
    (r.hostname || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.ifName || '').toLowerCase().includes(search.toLowerCase())
  );
  return (
    <Wrap>
      <PageHeader title="Port Security" desc="MAC address security bindings per port." />
      <input
        placeholder="Search MAC, IP, device or interface…"
        value={search} onChange={e => setSearch(e.target.value)}
        style={{ padding: '7px 12px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, outline: 'none', width: 320 }}
      />
      {filtered.length === 0
        ? <Empty label="No port security entries found." />
        : <TableCard headers={['Device', 'Interface', 'MAC Address', 'VLAN', 'IP Address']} rows={filtered}
            renderRow={(r, i) => (
              <tr key={r.port_security_id || i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <TD bold>{r.hostname || r.device_id || '—'}</TD>
                <TD mono>{r.ifName || r.port_id || '—'}</TD>
                <TD mono>{r.mac_address || '—'}</TD>
                <TD>{r.vlan ?? '—'}</TD>
                <TD mono>{r.ip_address || '—'}</TD>
              </tr>
            )} />}
    </Wrap>
  );
};

// ─── ARP TABLE ────────────────────────────────────────────────────
export const ArpPage = () => {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = () => {
    const q = input.trim() || '0.0.0.0';
    setQuery(q);
    setLoading(true);
    setError('');
    getArp(q)
      .then(data => { setRows(Array.isArray(data) ? data : []); })
      .catch(() => setError('ARP lookup failed.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { search(); }, []);

  return (
    <Wrap>
      <PageHeader title="ARP Table" desc="Address Resolution Protocol cache — search by IP or subnet." />
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="IP address or subnet (e.g. 192.168.1.0)"
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          style={{ flex: 1, padding: '7px 12px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, outline: 'none' }}
        />
        <button
          onClick={search}
          style={{ padding: '7px 18px', fontSize: 12, fontWeight: 600, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
          {loading ? '…' : 'Search'}
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: '#ef4444' }}>{error}</p>}
      {!error && rows.length === 0 && !loading && <Empty label={`No ARP entries for "${query}".`} />}
      {rows.length > 0 &&
        <TableCard headers={['IP Address', 'MAC Address', 'Interface', 'Device']} rows={rows}
          renderRow={(r, i) => (
            <tr key={i} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <TD mono bold>{r.ip_address || r.ipv4_address || '—'}</TD>
              <TD mono>{r.mac_address || r.mac || '—'}</TD>
              <TD mono>{r.interface || r.ifName || r.port_id || '—'}</TD>
              <TD>{r.hostname || r.device_id || '—'}</TD>
            </tr>
          )} />}
    </Wrap>
  );
};
