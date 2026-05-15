import { useState, useEffect, Component } from 'react';
import { Sidebar, TopBar } from './components/Layout';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>{this.state.error.message}</div>
          <button onClick={() => this.setState({ error: null })}
            style={{ fontSize: 12, padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import DashboardPage from './pages/Dashboard';
import { DevicesPage, PortsPage, LogsPage, PollersPage, PollerGroupsPage, BgpPage, SystemPage, PlaceholderPage } from './pages/AllPages';
import ServicesPage from './pages/ServicesPage';
import AlertsPage from './pages/AlertsPage';
import AlertRulesPage from './pages/AlertRulesPage';
import DeviceDetailsPage from './pages/DeviceDetails';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import MetricsPage from './pages/MetricsPage';
import TemplatesPage from './pages/TemplatesPage';
import TopologyPage from './pages/TopologyPage';
import RBACPage from './pages/RBACPage';
import DiscoveryPage from './pages/DiscoveryPage';
import ReportsPage from './pages/ReportsPage';
import AnomalyPage from './pages/AnomalyPage';
import {
  OspfPage, VrfPage, VlansPage, DeviceGroupsPage, PortGroupsPage,
  LocationsPage, BillsPage, PortSecurityPage, ArpPage,
} from './pages/NetworkPages';

const ACCENT = "#22c55e";

// Parse hash → { page, param }
// Examples:  #dashboard  →  { page:'dashboard' }
//            #device/myrouter  →  { page:'device-details', param:'myrouter' }
const parseHash = () => {
  const hash = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [page, ...rest] = hash.split('/');
  return { page, param: rest.join('/') || null };
};

// Write hash without triggering hashchange listener
const setHash = (page, param = null) => {
  const next = param ? `#${page}/${encodeURIComponent(param)}` : `#${page}`;
  window.history.pushState(null, '', next);
};

function App() {
  const [activePage, setActivePage] = useState(() => parseHash().page);
  const [selectedDevice, setSelectedDevice] = useState(() => {
    const { page, param } = parseHash();
    return page === 'device-details' ? (param ? decodeURIComponent(param) : null) : null;
  });
  const [collapsed, setCollapsed] = useState(false);

  // Sync URL → state on browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const { page, param } = parseHash();
      setActivePage(page);
      if (page === 'device-details' && param) setSelectedDevice(decodeURIComponent(param));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (page, param = null) => {
    setHash(page, param);
    setActivePage(page);
  };

  const navigateToDevice = (hostname) => {
    setSelectedDevice(hostname);
    navigate('device-details', hostname);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':     return <DashboardPage accent={ACCENT} onNav={navigate} onSelectDevice={navigateToDevice} />;
      case 'devices':       return <DevicesPage accent={ACCENT} onSelectDevice={navigateToDevice} />;
      case 'device-details':return <DeviceDetailsPage hostname={selectedDevice} onBack={() => navigate('devices')} accent={ACCENT} />;
      case 'alerts':        return <AlertsPage accent={ACCENT} />;
      case 'alert_rules':   return <AlertRulesPage accent={ACCENT} />;
      case 'ports':         return <PortsPage accent={ACCENT} />;
      case 'logs':          return <LogsPage accent={ACCENT} />;
      case 'services':      return <ServicesPage accent={ACCENT} />;
      case 'pollers':       return <PollersPage accent={ACCENT} />;
      case 'poller_groups': return <PollerGroupsPage accent={ACCENT} />;
      case 'bgp':           return <BgpPage accent={ACCENT} />;
      case 'system':        return <SystemPage accent={ACCENT} />;
      case 'users':         return <UsersPage accent={ACCENT} />;
      case 'settings':      return <SettingsPage accent={ACCENT} />;
      case 'templates':     return <TemplatesPage accent={ACCENT} />;
      case 'metrics':        return <MetricsPage accent={ACCENT} />;
      case 'ospf':           return <OspfPage />;
      case 'vrf':            return <VrfPage />;
      case 'vlans':          return <VlansPage />;
      case 'device_groups':  return <DeviceGroupsPage />;
      case 'port_groups':    return <PortGroupsPage />;
      case 'locations':      return <LocationsPage />;
      case 'bills':          return <BillsPage />;
      case 'port_security':  return <PortSecurityPage />;
      case 'arp':            return <ArpPage />;
      case 'topology':       return <TopologyPage accent={ACCENT} />;
      case 'rbac':           return <RBACPage accent={ACCENT} />;
      case 'discovery':      return <DiscoveryPage accent={ACCENT} />;
      case 'reports':        return <ReportsPage accent={ACCENT} />;
      case 'anomaly':        return <AnomalyPage accent={ACCENT} />;
      default:               return <PlaceholderPage title={activePage.charAt(0).toUpperCase() + activePage.slice(1)} desc="This module is under development." accent={ACCENT} />;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f0f2f5' }}>
      <Sidebar
        active={activePage}
        onNav={(page) => navigate(page)}
        collapsed={collapsed}
        accent={ACCENT}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar
          page={activePage}
          onToggle={() => setCollapsed(!collapsed)}
          accent={ACCENT}
        />

        <main style={{
          flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          ...(activePage !== 'topology' && { overflowY: 'auto', padding: '20px 24px' }),
        }}>
          <ErrorBoundary key={activePage}>
            {renderPage()}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default App;
