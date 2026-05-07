import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v0',
  timeout: 30000,
  headers: { 'Accept': 'application/json' }
});

// Global response interceptor — normalize errors
api.interceptors.response.use(
  res => res,
  err => {
    const status  = err.response?.status;
    const message = err.response?.data?.message ?? err.response?.data?.error ?? err.message ?? 'Unknown error';
    if (status === 401 || status === 403) {
      console.error('[API] Auth error:', message);
    } else if (status >= 500) {
      console.error('[API] Server error:', message);
    } else if (!err.response) {
      console.error('[API] Network error:', err.message);
    }
    return Promise.reject(err);
  }
);

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
export const getPollerLog    = () => cached('pollerlog', () => api.get('/pollers/log').then(r => r.data?.log ?? []));
export const getPollerGroups = () => cached('pollergrp', () => api.get('/poller_group/').then(r => r.data?.get_poller_group ?? []));
export const getServices       = (params = {}) => api.get('/services', { params }).then(r => r.data);
export const createService     = (data)        => api.post('/services', data).then(r => r.data);
export const updateService     = (id, data)    => api.patch(`/services/${id}`, data).then(r => r.data);
export const deleteService     = (id)          => api.delete(`/services/${id}`).then(r => r.data);
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
export const getDeviceRelationships = () => cached('relationships', () => api.get('/device_relationships').then(r => r.data?.relationships ?? []));
export const getLogs         = (limit = 50) => cached(`logs:${limit}`, () => api.get('/logs/eventlog', { params: { limit } }).then(r => r.data?.logs ?? []));
export const getEventLog     = (params = {}) => api.get('/eventlog', { params }).then(r => r.data);
export const getSystemInfo   = () => api.get('/system').then(r => r.data || {});
export const getSystemStats  = () => api.get('/system/stats').then(r => r.data || {});
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
export const getDeviceLinks      = (hostname) => cached(`links:${hostname}`,       () => api.get(`/devices/${hostname}/links`).then(r => r.data?.links ?? []).catch(() => []));

// ─── Metrics history ─────────────────────────────────────────────
export const getMetrics        = (params = {}) => api.get('/metrics',         { params }).then(r => r.data);
export const getMetricObjects  = (params = {}) => api.get('/metrics/objects', { params }).then(r => r.data?.objects ?? []);

// ─── Config ──────────────────────────────────────────────────────
export const getConfig    = ()                  => api.get('/config').then(r => r.data?.config ?? []);
export const updateConfig = (config_name, config_value) => api.patch('/config', { config_name, config_value }).then(r => r.data);

// ─── Users ───────────────────────────────────────────────────────
export const getUsers       = ()           => api.get('/users').then(r => r.data?.users ?? []);
export const getUser        = (id)         => api.get(`/users/${id}`).then(r => r.data?.user ?? null);
export const createUser     = (data)       => api.post('/users', data).then(r => r.data);
export const updateUser     = (id, data)   => api.patch(`/users/${id}`, data).then(r => r.data);
export const deleteUser     = (id)         => api.delete(`/users/${id}`).then(r => r.data);
export const getUserTokens  = (id)         => api.get(`/users/${id}/tokens`).then(r => r.data?.tokens ?? []);
export const createToken    = (id, desc)   => api.post(`/users/${id}/tokens`, { description: desc }).then(r => r.data);
export const deleteToken    = (id, tid)    => api.delete(`/users/${id}/tokens/${tid}`).then(r => r.data);

// ─── Device Templates ─────────────────────────────────────────────
export const getTemplates       = (params = {}) => api.get('/device-templates',      { params }).then(r => r.data?.templates ?? []);
export const getTemplate        = (id)           => api.get(`/device-templates/${id}`).then(r => r.data?.template ?? null);
export const createTemplate     = (data)         => api.post('/device-templates',      data).then(r => r.data);
export const updateTemplate     = (id, data)     => api.put(`/device-templates/${id}`, data).then(r => r.data);
export const deleteTemplate     = (id)           => api.delete(`/device-templates/${id}`).then(r => r.data);

// ─── MIB Files ───────────────────────────────────────────────────
export const getMibFiles        = (params = {}) => api.get('/mib-files',              { params }).then(r => r.data?.mibs ?? []);
export const getMibFile         = (id)           => api.get(`/mib-files/${id}`).then(r => r.data?.mib ?? null);
export const uploadMib          = (data)         => api.post('/mib-files',             data).then(r => r.data);
export const validateMib        = (id)           => api.post(`/mib-files/${id}/validate`).then(r => r.data);
export const deleteMib          = (id)           => api.delete(`/mib-files/${id}`).then(r => r.data);

export default api;

// ═══════════════════════════════════════════════════════════════════
// API v1 — Alert Rules create (production-grade Form Request endpoint)
// ═══════════════════════════════════════════════════════════════════
const apiV1 = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
});
apiV1.interceptors.response.use(res => res, err => {
  console.error('[API v1]', err.response?.data?.message ?? err.message);
  return Promise.reject(err);
});

/**
 * POST /api/v1/alert-rules
 *
 * Translates frontend form field names → V1 API field names:
 *   name       → rule_name
 *   disabled   → start_disabled
 *   invert_map → invert_device_map
 *
 * Returns the created rule with full detail on success (HTTP 201).
 * Throws on 400 (unsafe query) or 422 (validation error).
 */
export const createAlertRuleV1 = (form) => apiV1.post('/alert-rules', {
  rule_name:          form.name,
  severity:           form.severity,
  query:              form.query,
  notes:              form.notes              ?? '',
  start_disabled:     form.disabled           ?? false,
  invert_device_map:  form.invert_map         ?? false,
  alert_operation_id: form.alert_operation_id ?? null,
}).then(r => r.data);

// ═══════════════════════════════════════════════════════════════════
// API v2 — Alert endpoints
// ═══════════════════════════════════════════════════════════════════
const apiV2 = axios.create({
  baseURL: '/api/v2',
  timeout: 30000,
  headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
});
apiV2.interceptors.response.use(res => res, err => {
  console.error('[API v2]', err.response?.data?.message ?? err.message);
  return Promise.reject(err);
});

// Read
export const getAlertsV2      = (params = {})    => apiV2.get('/alerts',           { params }).then(r => r.data);
export const getAlertStatsV2  = (days = 7)       => apiV2.get('/alerts/stats',     { params: { days } }).then(r => r.data);
export const getAlertDetailV2 = (id)             => apiV2.get(`/alerts/${id}`).then(r => r.data);
export const getAlertsGrouped = (by = 'device', state = 'active') =>
  apiV2.get('/alerts/grouped', { params: { by, state } }).then(r => r.data);
export const getAlertLogV2    = (params = {})    => apiV2.get('/alert-log',        { params }).then(r => r.data);

// Single actions
export const ackAlertV2    = (id, note = '', until_clear = false) =>
  apiV2.post(`/alerts/${id}/ack`,    { note, until_clear }).then(r => r.data);
export const unackAlertV2  = (id, note = '') =>
  apiV2.post(`/alerts/${id}/unack`,  { note }).then(r => r.data);
export const muteAlertV2   = (id, note = '', muted_until = null) =>
  apiV2.post(`/alerts/${id}/mute`,   { note, muted_until }).then(r => r.data);
export const unmuteAlertV2 = (id, note = '') =>
  apiV2.post(`/alerts/${id}/unmute`, { note }).then(r => r.data);

// Bulk
export const bulkAckV2   = (ids, note = '', until_clear = false) =>
  apiV2.post('/alerts/bulk/ack',   { ids, note, until_clear }).then(r => r.data);
export const bulkUnackV2 = (ids, note = '') =>
  apiV2.post('/alerts/bulk/unack', { ids, note }).then(r => r.data);
export const bulkMuteV2  = (ids, note = '') =>
  apiV2.post('/alerts/bulk/mute',  { ids, note }).then(r => r.data);

// ─── Alert Rules ──────────────────────────────────────────────────
export const getAlertRulesV2   = (params = {}) => apiV2.get('/alert-rules',        { params }).then(r => r.data);
export const getAlertRuleV2    = (id)          => apiV2.get(`/alert-rules/${id}`).then(r => r.data);
export const createAlertRuleV2 = (data)        => apiV2.post('/alert-rules',        data).then(r => r.data);
export const updateAlertRuleV2 = (id, data)    => apiV2.put(`/alert-rules/${id}`,   data).then(r => r.data);
export const deleteAlertRuleV2 = (id)          => apiV2.delete(`/alert-rules/${id}`).then(r => r.data);
export const toggleAlertRuleV2 = (id)          => apiV2.patch(`/alert-rules/${id}/toggle`).then(r => r.data);

// ─── Alert Transports ─────────────────────────────────────────────
export const getTransportsV2    = ()            => apiV2.get('/alert-transports').then(r => r.data?.transports ?? []);
export const getTransportV2     = (id)          => apiV2.get(`/alert-transports/${id}`).then(r => r.data?.transport ?? null);
export const createTransportV2  = (data)        => apiV2.post('/alert-transports', data).then(r => r.data);
export const updateTransportV2  = (id, data)    => apiV2.put(`/alert-transports/${id}`, data).then(r => r.data);
export const deleteTransportV2  = (id)          => apiV2.delete(`/alert-transports/${id}`).then(r => r.data);
