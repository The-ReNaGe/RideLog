import React, { useEffect, useState, useCallback } from 'react';
import VehicleList from './pages/VehicleList';
import VehicleDetail from './pages/VehicleDetail';
import Settings from './pages/Settings';
import FuelStations from './components/FuelStations';
import Admin from './pages/Admin';
import AuthPage from './pages/AuthPage';
import Planning from './pages/Planning';
import Dashboard from './pages/Dashboard';
import version from './version';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[RideLog] Erreur React :', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-main)' }}>
          <div className="card p-8 max-w-md text-center">
            <h2 className="text-xl font-bold" style={{ color: 'var(--danger)' }}>Une erreur est survenue</h2>
            <p className="text-secondary mb-4 text-sm mt-2">{this.state.error?.message}</p>
            <button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }} className="btn btn-primary w-full">
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const NAV_ITEMS = [
  { key: 'vehicles',      icon: '🚗', label: 'Véhicules',  matchKeys: ['vehicles', 'vehicle-detail'] },
  { key: 'dashboard',     icon: '📊', label: 'Dashboard' },
  { key: 'fuel-stations', icon: '⛽', label: 'Stations' },
  { key: 'planning',      icon: '📅', label: 'Planning' },
  { key: 'settings',      icon: '⚙️', label: 'Paramètres' },
];

function AppContent({ isAuthenticated, currentUser, onLogout }) {
  const [currentPage, setCurrentPage] = useState('vehicles');
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'light' ? 'dark' : 'light');
  }, []);

  // Initialiser l'historique une seule fois
  useEffect(() => {
    window.history.replaceState({ page: 'vehicles' }, '');
  }, []);

  // Listener popstate — sans dépendance sur currentPage pour éviter les sorties accidentelles
  useEffect(() => {
    const handlePopState = (e) => {
      const state = e.state;
      if (state?.page === 'vehicle-detail' && state?.vehicleId) {
        setSelectedVehicleId(state.vehicleId);
        setCurrentPage('vehicle-detail');
      } else if (state?.page) {
        setCurrentPage(state.page);
        setSelectedVehicleId(null);
      } else {
        // Pas d'état connu → revenir à vehicles et bloquer la sortie
        setCurrentPage('vehicles');
        setSelectedVehicleId(null);
        window.history.pushState({ page: 'vehicles' }, '');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectVehicle = (vehicleId) => {
    setSelectedVehicleId(vehicleId);
    setCurrentPage('vehicle-detail');
    window.history.pushState({ page: 'vehicle-detail', vehicleId }, '');
  };

  const handleBack = () => {
    setCurrentPage('vehicles');
    setSelectedVehicleId(null);
    window.history.pushState({ page: 'vehicles' }, '');
  };

  const navigateTo = (page) => {
    setCurrentPage(page);
    setSelectedVehicleId(null);
    window.history.pushState({ page }, '');
  };

  const isActive = (item) => {
    if (item.matchKeys) return item.matchKeys.includes(currentPage);
    return currentPage === item.key;
  };

  const navItems = currentUser?.is_admin
    ? [...NAV_ITEMS, { key: 'admin', icon: '🛡️', label: 'Admin' }]
    : NAV_ITEMS;

  return (
    <div className="min-h-screen flex flex-col pb-16 sm:pb-0" style={{ background: 'var(--bg-base)' }}>

      {/* Header */}
      <header style={{ background: 'var(--bg-topbar)', borderRadius: 0, boxShadow: '0 1px 3px rgba(154,161,171,0.1)' }}>
        <div className="flex items-center justify-between px-6 sm:px-10 lg:px-16" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
          <div className="cursor-pointer flex items-center gap-3 sm:gap-6 group" onClick={handleBack}
               style={{ minHeight: '60px' }}>

            {/* Logo : taille via CSS responsive, un seul élément */}
            {/* Logo mobile */}
            <div className="sm:hidden flex items-center justify-center bg-white/90 rounded-xl shadow-sm border border-gray-200 flex-shrink-0"
                 style={{ width: '44px', height: '44px' }}>
              <img src="/RideLog.png" alt="RideLog"
                   style={{ maxHeight: '34px', maxWidth: '34px', objectFit: 'contain', display: 'block' }}
                   className="select-none pointer-events-none" draggable="false" />
            </div>
            {/* Logo desktop */}
            <div className="hidden sm:flex items-center justify-center bg-white/90 rounded-2xl shadow-md border border-gray-200 group-hover:scale-105 transition-transform duration-200 flex-shrink-0"
                 style={{ width: '72px', height: '72px' }}>
              <img src="/RideLog.png" alt="RideLog"
                   style={{ maxHeight: '58px', maxWidth: '58px', objectFit: 'contain', display: 'block' }}
                   className="select-none pointer-events-none" draggable="false" />
            </div>

            <div className="flex flex-col justify-center">
              <span className="hidden sm:block font-semibold" style={{ color: 'var(--text-2)', fontSize: '1.2rem', letterSpacing: '0.01em' }}>
                Suivi d'entretien véhicules
              </span>
              <span className="sm:hidden font-bold" style={{ color: 'var(--text-1)', fontSize: '1.05rem' }}>
                RideLog
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-3)' }}>v{version}</span>
            <button
              onClick={toggleTheme}
              title={theme === 'light' ? 'Mode nuit' : 'Mode jour'}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: '0.5rem', width: '36px', height: '36px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: '1rem', flexShrink: 0,
              }}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            {isAuthenticated && currentUser && (
              <button
                onClick={onLogout}
                title={`Connecté en tant que ${currentUser.display_name} — Déconnexion`}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: '0.5rem', height: '36px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, padding: '0 10px', gap: '6px',
                  fontSize: '0.8rem', color: 'var(--text-2)',
                }}
              >
                <span>👤</span>
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Nav desktop */}
      <nav className="hidden sm:block sticky top-0 z-10" style={{ background: 'var(--bg-topbar)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex gap-2 sm:gap-4 py-3 overflow-x-auto items-center px-6 sm:px-10 lg:px-16">
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => item.key === 'vehicles' ? handleBack() : navigateTo(item.key)}
              className={`px-4 sm:px-6 py-2 rounded text-sm font-semibold transition-all whitespace-nowrap ${isActive(item) ? 'btn btn-primary' : 'btn btn-secondary'}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Contenu */}
      <main className="py-4 sm:py-8 flex-1 px-6 sm:px-10 lg:px-16">
        {currentPage === 'dashboard' && <Dashboard onSelectVehicle={handleSelectVehicle} currentUser={currentUser} />}
        {currentPage === 'vehicles' && <VehicleList onSelectVehicle={handleSelectVehicle} currentUser={currentUser} />}
        {currentPage === 'vehicle-detail' && selectedVehicleId && <VehicleDetail vehicleId={selectedVehicleId} onBack={handleBack} />}
        {currentPage === 'fuel-stations' && <FuelStations />}
        {currentPage === 'planning' && <Planning />}
        {currentPage === 'settings' && <Settings currentUser={currentUser} />}
        {currentPage === 'admin' && <Admin currentUser={currentUser} />}
      </main>

      {/* Footer desktop */}
      <footer className="hidden sm:block" style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>
        <div className="py-4 text-center text-xs px-4" style={{ color: 'var(--text-3)' }}>
          RideLog v{version} — Suivi d'entretien open source • {currentUser?.username && `Utilisateur: ${currentUser.display_name}`}
        </div>
      </footer>

      {/* Barre nav mobile — scrollable si beaucoup d'items */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{ background: 'var(--bg-topbar)', borderTop: '1px solid var(--border)', boxShadow: '0 -2px 10px rgba(0,0,0,0.08)' }}
      >
        <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 'env(safe-area-inset-bottom, 0px)', WebkitOverflowScrolling: 'touch' }}>
          {navItems.map(item => {
            const active = isActive(item);
            return (
              <button
                key={item.key}
                onClick={() => item.key === 'vehicles' ? handleBack() : navigateTo(item.key)}
                style={{
                  flex: '0 0 auto', minWidth: '64px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '8px 8px', border: 'none', background: 'none', cursor: 'pointer', gap: '2px', position: 'relative',
                }}
              >
                {active && (
                  <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '2px', background: 'var(--accent)', borderRadius: '0 0 2px 2px' }} />
                )}
                <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{item.icon}</span>
                <span style={{ fontSize: '0.6rem', fontWeight: active ? 700 : 500, color: active ? 'var(--accent)' : 'var(--text-3)' }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const user = localStorage.getItem('user');
    if (token && user) {
      setIsAuthenticated(true);
      try { setCurrentUser(JSON.parse(user)); } catch { localStorage.removeItem('user'); }
    }
    setLoading(false);

    const handleTokenExpired = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
    };
    window.addEventListener('tokenExpired', handleTokenExpired);
    return () => window.removeEventListener('tokenExpired', handleTokenExpired);
  }, []);

  const handleLoginSuccess = () => {
    const token = localStorage.getItem('access_token');
    const user = localStorage.getItem('user');
    if (token && user) {
      setIsAuthenticated(true);
      try { setCurrentUser(JSON.parse(user)); } catch {}
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-center"><div className="spinner mx-auto mb-4"></div><p style={{ color: 'var(--text-2)' }}>Chargement...</p></div>
      </div>
    );
  }

  if (!isAuthenticated) return <ErrorBoundary><AuthPage onLoginSuccess={handleLoginSuccess} /></ErrorBoundary>;

  return (
    <ErrorBoundary>
      <AppContent isAuthenticated={isAuthenticated} currentUser={currentUser} onLogout={handleLogout} />
    </ErrorBoundary>
  );
}