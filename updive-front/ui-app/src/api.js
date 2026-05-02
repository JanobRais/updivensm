import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v0',
  timeout: 15000,
  headers: { 'Accept': 'application/json' }
});

// ─── 30-second in-memory cache ───────────────────────────────────
const CACHE = new Map();
const TTL = 30_000;

const cached = (key, fn) => {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.t < TTL) return Promise.resolve(hit.v);
  return fn().then(v => { CACHE.set(key, { v, t: Date.now() }); return v; });
};

export const invalidateCache = (prefix) => {
  if (!prefix) { CACHE.clear(); return; }
  for (const key of CACHE.keys()) { if (key.startsWith(prefix)) CACHE.delete(key); }
};
// ─────────────────────────────────────────────────────────────────

const PORT_COLUMNS = 'port_id,device_id,ifIndex,ifName,ifAlias,ifOperStatus,ifAdminStatus,ifSpeed,ifPhysAddress,ifInOctets_rate,ifOutOctets_rate,ifInUcastPkts_rate,ifOutUcastPkts_rate,ifMtu,ifType';

// Global (cached)
export const getDevices      = () => cached('devices',   () => api.get('/devices').then(r => r.data?.devices ?? []));
export const getAlerts       = () => cached('alerts',    () => api.get('/alerts').then(r => r.data?.alerts ?? []));
export const getPollers      = () => cached('pollers',   () => api.get('/pollers').then(r => r.data?.pollers ?? []));
export const getServices     = () => cached('services',  () => api.get('/services').then(r => r.data?.services ?? []));
export const getBgp          = () => cached('bgp',       () => api.get('/bgp').then(r => r.data?.bgp ?? []));
export const getOspf         = () => cached('ospf',      () => api.get('/ospf').then(r => r.data?.ospf ?? []));
export const getVrf          = () => cached('vrf',       () => api.get('/routing/vrf').then(r => r.data?.vrfs ?? []));
export const getVlans        = () => cached('vlans',     () => api.get('/resources/vlans').then(r => r.data?.vlans ?? []));
export const getDeviceGroups = () => cached('devgroups', () => api.get('/devicegroups').then(r => r.data?.groups ?? []));
export const getPortGroups   = () => cached('portgroups',() => api.get('/port_groups').then(r => r.data?.groups ?? []));
export const getLocations    = () => cached('locations', () => api.get('/resources/locations').then(r => r.data?.locations ?? []));
export const getBills        = () => cached('bills',     () => api.get('/bills').then(r => r.data?.bills ?? []));
export const getPortSecurity = () => cached('portsec',   () => api.get('/port_security').then(r => r.data?.port_security ?? []));
export const getPorts        = () => cached('ports',     () => api.get('/ports', { params: { columns: PORT_COLUMNS } }).then(r => r.data?.ports ?? []));
export const getLogs         = (limit = 50) => cached(`logs:${limit}`, () => api.get('/logs/eventlog', { params: { limit } }).then(r => r.data?.logs ?? []));
export const getSystemInfo   = () => api.get('/system').then(r => r.data || {});
export const getArp          = (query = '0.0.0.0') => api.get(`/resources/ip/arp/${query}`).then(r => r.data?.arp ?? []);

// ─── Write operations (admin) ─────────────────────────────────────
export const addDevice    = (data) => api.post('/devices', data).then(r => r.data);
export const deleteDevice = (hostname) => api.delete(`/devices/${hostname}`).then(r => r.data);
export const updateDevice = (hostname, field, data) => api.patch(`/devices/${hostname}`, { field, data }).then(r => r.data);

// Per-device (cached by hostname)
export const getDeviceDetails    = (hostname) => cached(`dev:${hostname}`,       () => api.get(`/devices/${hostname}`).then(r => r.data?.devices?.[0] ?? null));
export const getDeviceProcessors = (hostname) => cached(`procs:${hostname}`,     () => api.get(`/devices/${hostname}/processors`).then(r => r.data?.processors ?? []));
export const getDeviceMempools   = (hostname) => cached(`mems:${hostname}`,      () => api.get(`/devices/${hostname}/mempools`).then(r => r.data?.mempools ?? []));
export const getDevicePorts      = (hostname) => cached(`devports:${hostname}`,  () => api.get(`/devices/${hostname}/ports`, { params: { columns: PORT_COLUMNS } }).then(r => r.data?.ports ?? []));
export const getDeviceEventlog   = (hostname) => cached(`evlog:${hostname}`,     () => api.get(`/logs/eventlog/${hostname}`).then(r => r.data?.logs ?? []));
export const getDeviceHealth     = (hostname) =>                                        api.get(`/devices/${hostname}/health`).then(r => r.data || {});
export const getDeviceAlerts     = (hostname) => cached(`alts:${hostname}`,      () => api.get('/alerts').then(r => (r.data?.alerts ?? []).filter(a => a.hostname === hostname)));
export const getInventory        = (hostname) =>                                        api.get(`/inventory/${hostname}/all`).then(r => r.data?.inventory ?? []);

export default api;
