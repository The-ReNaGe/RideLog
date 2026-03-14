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

// Simple error boundary
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
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              className="btn btn-primary w-full"
            >
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  const handleSelectVehicle = (vehicleId) => {
    setSelectedVehicleId(vehicleId);
    setCurrentPage('vehicle-detail');
  };

  const handleBack = () => {
    setCurrentPage('vehicles');
    setSelectedVehicleId(null);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header className="card no-shadow" style={{ background: 'var(--bg-topbar)', borderRadius: '0', boxShadow: '0 1px 3px rgba(154, 161, 171, 0.1)' }}>
        <div className="container py-4 sm:py-5 flex items-center justify-between">
          <div
            className="cursor-pointer flex items-center gap-6 group transition-all"
            style={{ minHeight: '96px', minWidth: '220px' }}
            onClick={handleBack}
          >
            <div className="flex items-center justify-center bg-white/90 rounded-2xl shadow-md border border-gray-200 group-hover:scale-105 transition-transform duration-200"
                 style={{ width: '96px', height: '96px' }}>
              <img
                src="/RideLog.png"
                alt="RideLog logo"
                style={{ maxHeight: '80px', maxWidth: '80px', objectFit: 'contain', display: 'block' }}
                className="select-none pointer-events-none"
                draggable="false"
              />
            </div>
            <div className="flex flex-col justify-center h-full">
              <p className="text-lg sm:text-xl font-semibold" style={{ color: 'var(--text-2)', letterSpacing: '0.01em' }}>
                Suivi d'entretien véhicules
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-3)' }}>v{version}</span>
            {isAuthenticated && currentUser && (
              <button
                onClick={onLogout}
                className="btn btn-secondary text-xs"
                title={`Connecté en tant que ${currentUser.display_name}`}
              >
                👤 Déconnexion
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav style={{ background: 'var(--bg-topbar)', borderBottom: '1px solid var(--border)' }} className="sticky top-0 z-10">
        <div className="container flex gap-2 sm:gap-4 py-3 overflow-x-auto items-center">
          <button
            onClick={handleBack}
            className={`px-4 sm:px-6 py-2 rounded text-sm font-semibold transition-all whitespace-nowrap ${
              currentPage === 'vehicles' || currentPage === 'vehicle-detail'
                ? 'btn btn-primary'
                : 'btn btn-secondary'
            }`}
          >
            🚗 Véhicules
          </button>
          <button
            onClick={() => setCurrentPage('dashboard')}
            className={`px-4 sm:px-6 py-2 rounded text-sm font-semibold transition-all whitespace-nowrap ${
              currentPage === 'dashboard'
                ? 'btn btn-primary'
                : 'btn btn-secondary'
            }`}
          >
            📊 Dashboard
          </button>
          <button
            onClick={() => setCurrentPage('fuel-stations')}
            className={`px-4 sm:px-6 py-2 rounded text-sm font-semibold transition-all whitespace-nowrap ${
              currentPage === 'fuel-stations'
                ? 'btn btn-primary'
                : 'btn btn-secondary'
            }`}
          >
            ⛽ Stations
          </button>
          <button
            onClick={() => setCurrentPage('planning')}
            className={`px-4 sm:px-6 py-2 rounded text-sm font-semibold transition-all whitespace-nowrap ${
              currentPage === 'planning'
                ? 'btn btn-primary'
                : 'btn btn-secondary'
            }`}
          >
            📅 Planning
          </button>
          <button
            onClick={() => setCurrentPage('settings')}
            className={`px-4 sm:px-6 py-2 rounded text-sm font-semibold transition-all whitespace-nowrap ${
              currentPage === 'settings'
                ? 'btn btn-primary'
                : 'btn btn-secondary'
            }`}
          >
            ⚙️ Paramètres
          </button>
          {currentUser?.is_admin && (
            <button
              onClick={() => setCurrentPage('admin')}
              className={`px-4 sm:px-6 py-2 rounded text-sm font-semibold transition-all whitespace-nowrap ${
                currentPage === 'admin'
                  ? 'btn btn-primary'
                  : 'btn btn-secondary'
              }`}
            >
              🛡️ Admin
            </button>
          )}
          <div className="ml-auto">
            <button onClick={toggleTheme} className="theme-toggle" title={theme === 'light' ? 'Mode nuit' : 'Mode jour'}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container py-6 sm:py-8 flex-1">
        {currentPage === 'dashboard' && (
          <Dashboard onSelectVehicle={handleSelectVehicle} currentUser={currentUser} />
        )}
        {currentPage === 'vehicles' && (
          <VehicleList onSelectVehicle={handleSelectVehicle} currentUser={currentUser} />
        )}
        {currentPage === 'vehicle-detail' && selectedVehicleId && (
          <VehicleDetail vehicleId={selectedVehicleId} onBack={handleBack} />
        )}
        {currentPage === 'fuel-stations' && (
          <FuelStations />
        )}
        {currentPage === 'planning' && <Planning />}
        {currentPage === 'settings' && <Settings currentUser={currentUser} />}
        {currentPage === 'admin' && <Admin currentUser={currentUser} />}
      </main>

      {/* Footer */}
      <footer style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>
        <div className="container py-4 text-center text-xs" style={{ color: 'var(--text-3)' }}>
          RideLog v{version} — Suivi d'entretien open source • {currentUser?.username && `Utilisateur: ${currentUser.display_name}`}
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Vérifie si l'utilisateur est déjà connecté au démarrage
  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('access_token');
      const user = localStorage.getItem('user');

      if (token && user) {
        setIsAuthenticated(true);
        try {
          setCurrentUser(JSON.parse(user));
        } catch (e) {
          console.error('Erreur lors du parsing du user du localStorage:', e);
          localStorage.removeItem('user');
        }
      }
      setLoading(false);
    };

    checkAuth();

    // Écoute l'événement de token expiré
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
    // Récupère le token et l'utilisateur depuis le localStorage
    const token = localStorage.getItem('access_token');
    const user = localStorage.getItem('user');

    if (token && user) {
      setIsAuthenticated(true);
      try {
        setCurrentUser(JSON.parse(user));
      } catch (e) {
        console.error('Erreur au parsing user:', e);
      }
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
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-base)' }}
      >
        <div className="text-center">
          <div className="spinner mx-auto mb-4"></div>
          <p style={{ color: 'var(--text-2)' }}>Chargement...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <AuthPage onLoginSuccess={handleLoginSuccess} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppContent
        isAuthenticated={isAuthenticated}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    </ErrorBoundary>
  );
}
