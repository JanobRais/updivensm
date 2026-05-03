import { useState, useEffect } from 'react';
import { Sidebar, TopBar } from './components/Layout';
import DashboardPage from './pages/Dashboard';
import { DevicesPage, PortsPage, LogsPage, ServicesPage, PollersPage, BgpPage, SystemPage, PlaceholderPage } from './pages/AllPages';
import AlertsPage from './pages/AlertsPage';
import AlertRulesPage from './pages/AlertRulesPage';
import DeviceDetailsPage from './pages/DeviceDetails';

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
      case 'dashboard':     return <DashboardPage accent={ACCENT} />;
      case 'devices':       return <DevicesPage accent={ACCENT} onSelectDevice={navigateToDevice} />;
      case 'device-details':return <DeviceDetailsPage hostname={selectedDevice} onBack={() => navigate('devices')} accent={ACCENT} />;
      case 'alerts':        return <AlertsPage accent={ACCENT} />;
      case 'alert_rules':   return <AlertRulesPage accent={ACCENT} />;
      case 'ports':         return <PortsPage accent={ACCENT} />;
      case 'logs':          return <LogsPage accent={ACCENT} />;
      case 'services':      return <ServicesPage accent={ACCENT} />;
      case 'pollers':       return <PollersPage accent={ACCENT} />;
      case 'bgp':           return <BgpPage accent={ACCENT} />;
      case 'system':        return <SystemPage accent={ACCENT} />;
      default:              return <PlaceholderPage title={activePage.charAt(0).toUpperCase() + activePage.slice(1)} desc="This module is under development." accent={ACCENT} />;
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

        <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
