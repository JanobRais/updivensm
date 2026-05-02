import React from 'react';
import { Icon } from './Charts';

// ─── NAV GROUPS (exact replica from prototype) ───────────────────
const navGroups = [
  { label: "Overview", items: [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "devices", label: "Devices", icon: "devices" },
    { id: "device_groups", label: "Device Groups", icon: "network" },
  ]},
  { label: "Monitoring", items: [
    { id: "alerts", label: "Alerts", icon: "alerts" },
    { id: "services", label: "Services", icon: "services" },
    { id: "logs", label: "Event Logs", icon: "logs" },
    { id: "pollers", label: "Pollers", icon: "pollers" },
    { id: "poller_groups", label: "Poller Groups", icon: "cpu" },
  ]},
  { label: "Interfaces", items: [
    { id: "ports", label: "Ports", icon: "wifi" },
    { id: "port_groups", label: "Port Groups", icon: "network" },
    { id: "arp", label: "ARP Table", icon: "map" },
  ]},
  { label: "Routing", items: [
    { id: "bgp", label: "BGP", icon: "bgp" },
    { id: "ospf", label: "OSPF", icon: "map" },
    { id: "vrf", label: "VRFs", icon: "eye" },
  ]},
  { label: "Switching", items: [
    { id: "vlans", label: "VLANs", icon: "network" },
    { id: "port_security", label: "Port Security", icon: "eye" },
  ]},
  { label: "Assets", items: [
    { id: "inventory", label: "Inventory", icon: "inventory" },
    { id: "bills", label: "Bills", icon: "download" },
    { id: "locations", label: "Locations", icon: "map" },
  ]},
  { label: "Settings", items: [
    { id: "system", label: "System", icon: "server" },
    { id: "users", label: "Users", icon: "users" },
    { id: "settings", label: "Settings", icon: "settings" },
  ]},
];

// ─── SIDEBAR ─────────────────────────────────────────────────────
export const Sidebar = ({ active, onNav, collapsed, accent }) => (
  <aside style={{
    width: collapsed ? 56 : 220, minWidth: collapsed ? 56 : 220,
    background: "#fff", borderRight: "1px solid #e8ecf0",
    display: "flex", flexDirection: "column", height: "100vh",
    transition: "width 0.2s ease, min-width 0.2s ease", overflow: "hidden",
    position: "relative", zIndex: 10
  }}>
    {/* Logo */}
    <div style={{ padding: collapsed ? "18px 14px" : "18px 20px", borderBottom: "1px solid #e8ecf0",
      display: "flex", alignItems: "center", gap: 10, minHeight: 62 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: accent,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      {!collapsed && (
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", letterSpacing: "-0.01em" }}>Updive</div>
          <div style={{ fontSize: 10, fontWeight: 600, color: accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>NSM</div>
        </div>
      )}
    </div>

    {/* Nav */}
    <nav style={{ flex: 1, overflowY: "auto", padding: "10px 0", overflowX: "hidden" }}>
      {navGroups.map(group => (
        <div key={group.label} style={{ marginBottom: 4 }}>
          {!collapsed && (
            <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase",
              letterSpacing: "0.1em", padding: "8px 20px 4px" }}>{group.label}</div>
          )}
          {group.items.map(item => {
            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => onNav(item.id)} style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: collapsed ? "9px 16px" : "8px 20px",
                background: isActive ? `${accent}15` : "transparent",
                border: "none", cursor: "pointer", textAlign: "left",
                color: isActive ? accent : "#4b5563",
                fontFamily: "inherit", fontSize: 12.5, fontWeight: isActive ? 600 : 400,
                borderLeft: `3px solid ${isActive ? accent : "transparent"}`,
                transition: "all 0.15s ease",
                borderRadius: "0 6px 6px 0",
                justifyContent: collapsed ? "center" : "flex-start",
              }}>
                <Icon name={item.icon} size={15} color={isActive ? accent : "#6b7280"} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>

    {/* Footer */}
    {!collapsed && (
      <div style={{ padding: "12px 16px", borderTop: "1px solid #e8ecf0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${accent}20`,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="users" size={13} color={accent} />
          </div>
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#111827" }}>admin</div>
            <div style={{ fontSize: 10, color: "#9ca3af" }}>admin@updive.net</div>
          </div>
        </div>
      </div>
    )}
  </aside>
);

// ─── TOP BAR ─────────────────────────────────────────────────────
const breadcrumbMap = {
  dashboard: ["Home", "Dashboard"], devices: ["Home", "Devices"], device_groups: ["Home", "Device Groups"],
  ports: ["Interfaces", "Ports"], port_groups: ["Interfaces", "Port Groups"], arp: ["Interfaces", "ARP Table"],
  alerts: ["Monitoring", "Alerts"], services: ["Monitoring", "Services"], logs: ["Monitoring", "Event Logs"],
  pollers: ["Monitoring", "Pollers"], poller_groups: ["Monitoring", "Poller Groups"],
  bgp: ["Routing", "BGP"], ospf: ["Routing", "OSPF"], vrf: ["Routing", "VRFs"],
  vlans: ["Switching", "VLANs"], port_security: ["Switching", "Port Security"],
  inventory: ["Assets", "Inventory"], bills: ["Assets", "Bills"], locations: ["Assets", "Locations"],
  system: ["Settings", "System"], users: ["Settings", "Users"], settings: ["Settings", "Settings"],
};

export const TopBar = ({ page, onToggle, accent }) => {
  const breadcrumbs = breadcrumbMap[page] || ["Home", page];
  return (
    <header style={{ height: 52, background: "#fff", borderBottom: "1px solid #e8ecf0",
      display: "flex", alignItems: "center", padding: "0 20px", gap: 12, flexShrink: 0 }}>
      <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer",
        color: "#6b7280", padding: 4, borderRadius: 6, display: "flex" }}>
        <Icon name="menu" size={16} />
      </button>
      <nav style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
        {breadcrumbs.map((b, i) => (
          <React.Fragment key={b}>
            {i > 0 && <Icon name="chevronRight" size={12} color="#d1d5db" />}
            <span style={{ fontSize: 12, color: i === breadcrumbs.length - 1 ? "#111827" : "#9ca3af",
              fontWeight: i === breadcrumbs.length - 1 ? 600 : 400 }}>{b}</span>
          </React.Fragment>
        ))}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f9fafb",
          border: "1px solid #e5e7eb", borderRadius: 7, padding: "5px 10px" }}>
          <Icon name="search" size={12} color="#9ca3af" />
          <input placeholder="Search devices..." style={{ border: "none", background: "transparent",
            fontSize: 11, color: "#374151", outline: "none", width: 130, fontFamily: "inherit" }} />
        </div>
        <button style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7,
          padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center", color: "#6b7280" }}>
          <Icon name="refresh" size={13} />
        </button>
        <div style={{ position: "relative" }}>
          <button style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7,
            padding: "5px 8px", cursor: "pointer", display: "flex", color: "#6b7280" }}>
            <Icon name="bell" size={13} />
          </button>
          <span style={{ position: "absolute", top: -3, right: -3, background: "#ef4444",
            color: "#fff", fontSize: 8, fontWeight: 700, borderRadius: 10, padding: "1px 4px", minWidth: 14, textAlign: "center" }}>3</span>
        </div>
        <button style={{ background: accent, border: "none", borderRadius: 7, padding: "5px 10px",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "#fff", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
          <Icon name="download" size={12} color="#fff" />
          Export
        </button>
      </div>
    </header>
  );
};
