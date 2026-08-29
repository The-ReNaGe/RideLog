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
import Icon from './components/Icon';
import { PreferencesProvider, useT } from './lib/preferencesContext';
import { api } from './lib/api';

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
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-base)' }}>
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
  { key: 'vehicles',      icon: 'car',      label: 'Véhicules',  matchKeys: ['vehicles', 'vehicle-detail'] },
  { key: 'dashboard',     icon: 'chart',    label: 'Tableau de bord', shortLabel: 'Bilan' },
  { key: 'fuel-stations', icon: 'fuel',     label: 'Stations' },
  { key: 'planning',      icon: 'calendar', label: 'Planning' },
  { key: 'settings',      icon: 'settings', label: 'Paramètres', shortLabel: 'Réglages' },
];

function AppContent({ isAuthenticated, currentUser, onLogout }) {
  const t = useT();
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
    ? [...NAV_ITEMS, { key: 'admin', icon: 'shield', label: 'Admin' }]
    : NAV_ITEMS;

  return (
    <div className="min-h-screen flex flex-col pb-16 sm:pb-0">

      {/* En-tête + navigation : une seule barre collante, pour ne pas empiler
          deux bandeaux blancs de hauteur différente en haut de chaque page. */}
      <header className="app-bar sticky top-0 z-20">
        <div className="app-bar-inner px-4 sm:px-8 lg:px-12">
          {/* Marque */}
          <button
            onClick={handleBack}
            className="flex items-center gap-2.5 min-w-0 justify-self-start"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
          >
            <span className="logo-plate">
              <img
                src="/RideLog.png" alt=""
                style={{ maxHeight: 24, maxWidth: 24, objectFit: 'contain', display: 'block' }}
                className="select-none pointer-events-none" draggable="false"
              />
            </span>
            <span style={{ color: 'var(--text-1)', fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              RideLog
            </span>
          </button>

          {/* Sélecteur de section, centré sur la fenêtre */}
          <nav className="hidden sm:block min-w-0">
            <div className="segmented">
              {navItems.map(item => (
                <button
                  key={item.key}
                  onClick={() => item.key === 'vehicles' ? handleBack() : navigateTo(item.key)}
                  className={`segment ${isActive(item) ? 'active' : ''}`}
                  aria-current={isActive(item) ? 'page' : undefined}
                >
                  <Icon name={item.icon} size={15} />
                  {t(item.label)}
                </button>
              ))}
            </div>
          </nav>

          {/* Session */}
          <div className="flex items-center justify-end gap-2 min-w-0">
            <span className="badge badge-neutral hidden lg:inline-flex">v{version}</span>
            <button
              onClick={toggleTheme}
              className="btn-icon"
              title={theme === 'light' ? t('Passer en mode nuit') : t('Passer en mode jour')}
              aria-label={theme === 'light' ? t('Passer en mode nuit') : t('Passer en mode jour')}
            >
              <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
            </button>
            {isAuthenticated && currentUser && (
              <>
                {/* L'initiale dit à qui appartient la session : c'est la seule
                    information personnelle de la barre. */}
                <span
                  className="avatar"
                  style={{ width: 30, minWidth: 30, height: 30, fontSize: 13 }}
                  title={t('Connecté en tant que {name}', { name: currentUser.display_name })}
                >
                  {(currentUser.display_name || currentUser.username || '?').charAt(0)}
                </span>
                <span className="hidden xl:inline text-ellipsis" style={{ color: 'var(--text-2)', fontSize: 13.5, fontWeight: 600, maxWidth: 120 }}>
                  {currentUser.display_name}
                </span>
                <button
                  onClick={onLogout}
                  className="btn-icon"
                  title={t('Se déconnecter')}
                  aria-label={t('Se déconnecter')}
                >
                  <Icon name="logout" size={17} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Contenu */}
      <main className="py-5 sm:py-8 flex-1 w-full px-4 sm:px-8 lg:px-12" style={{ maxWidth: 1440, marginInline: 'auto' }}>
        {currentPage === 'dashboard' && <Dashboard onSelectVehicle={handleSelectVehicle} currentUser={currentUser} />}
        {currentPage === 'vehicles' && <VehicleList onSelectVehicle={handleSelectVehicle} currentUser={currentUser} />}
        {currentPage === 'vehicle-detail' && selectedVehicleId && <VehicleDetail vehicleId={selectedVehicleId} onBack={handleBack} currentUser={currentUser} />}
        {currentPage === 'fuel-stations' && <FuelStations />}
        {currentPage === 'planning' && <Planning />}
        {currentPage === 'settings' && <Settings currentUser={currentUser} />}
        {currentPage === 'admin' && <Admin currentUser={currentUser} />}
      </main>

      {/* Footer desktop */}
      <footer className="hidden sm:block" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="py-4 text-center px-4" style={{ color: 'var(--text-3)', fontSize: 12 }}>
          RideLog v{version} — {t('suivi d\'entretien open source')}
          {currentUser?.display_name && <> · {t('connecté en tant que {name}', { name: currentUser.display_name })}</>}
        </div>
      </footer>

      {/* Barre nav mobile — scrollable si beaucoup d'items */}
      <nav
        className="app-bar sm:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 'env(safe-area-inset-bottom, 0px)', WebkitOverflowScrolling: 'touch' }}>
          {navItems.map(item => {
            const active = isActive(item);
            return (
              <button
                key={item.key}
                onClick={() => item.key === 'vehicles' ? handleBack() : navigateTo(item.key)}
                className={`nav-bottom-item ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon name={item.icon} size={20} />
                <span className="nav-bottom-label">
                  {t(item.shortLabel || item.label)}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function ForcePasswordChange({ currentUser, onDone, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== newPasswordConfirm) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    if (newPassword.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères');
      return;
    }

    setSaving(true);
    try {
      const response = await api.changeMyPassword(currentPassword, newPassword);
      localStorage.setItem('access_token', response.data.access_token);
      const updatedUser = { ...currentUser, must_change_password: false };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      onDone(updatedUser);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors du changement de mot de passe');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-md card p-8 gap-section">
        <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
          <div className="icon-box"><Icon name="key" size={18} /></div>
          <h2 style={{ fontSize: '1.15rem' }}>Mot de passe temporaire</h2>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          Un administrateur vous a attribué un mot de passe temporaire. Choisissez votre propre mot de passe pour continuer — l'administrateur ne le connaîtra pas.
        </p>

        {error && (
          <div className="p-2 rounded text-xs" style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
            <span className="flex items-center gap-2"><Icon name="alertCircle" size={14} />{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 mt-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Mot de passe temporaire (reçu de l'admin)</label>
            <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full" autoComplete="current-password" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Nouveau mot de passe</label>
            <input type="password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full" autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Confirmer le nouveau mot de passe</label>
            <input type="password" required minLength={6} value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} className="w-full" autoComplete="new-password" />
          </div>
          <button type="submit" disabled={saving} className="btn btn-primary w-full mt-4">
            {saving ? 'Enregistrement...' : 'Définir mon mot de passe'}
          </button>
        </form>

        <button onClick={onLogout} className="text-xs w-full text-center mt-4 underline" style={{ color: 'var(--text-3)' }}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

/**
 * Lien de rattachement à un groupe famille : /rejoindre/<token>.
 *
 * Distinct de /invite/<token>, qui crée un compte : celui-ci n'en crée jamais,
 * il rattache un compte existant. Le jeton est mis de côté dans sessionStorage
 * pour survivre à la connexion — l'invité arrive souvent déconnecté, et lui
 * redemander le lien après login serait une façon sûre de le perdre.
 */
const PENDING_FAMILY_TOKEN = 'ridelog.pendingFamilyToken';

function readFamilyTokenFromUrl() {
  const match = window.location.pathname.match(/^\/rejoindre\/(.+)$/);
  if (!match) return null;
  const token = match[1];
  try { sessionStorage.setItem(PENDING_FAMILY_TOKEN, token); } catch { /* navigation privée */ }
  window.history.replaceState({}, '', '/');
  return token;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [familyJoin, setFamilyJoin] = useState(null); // { status, name?, message? }

  useEffect(() => {
    readFamilyTokenFromUrl();

    const token = localStorage.getItem('access_token');
    const user = localStorage.getItem('user');
    if (token && user) {
      setIsAuthenticated(true);
      try { setCurrentUser(JSON.parse(user)); } catch { localStorage.removeItem('user'); }
    }
    setLoading(false);

    // Le compte gardé en localStorage vient d'une session antérieure et peut
    // ne pas porter `effective` (préférences résolues côté serveur). On le
    // relit une fois au démarrage, sinon une session déjà ouverte resterait
    // sur les valeurs en cache jusqu'à la prochaine reconnexion.
    if (token && user) {
      api.getCurrentUser()
        .then((res) => {
          setCurrentUser(res.data);
          localStorage.setItem('user', JSON.stringify(res.data));
        })
        .catch(() => { /* hors ligne ou token expiré : le cache reste valable */ });
    }

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

  // Jeton de groupe en attente : consommé dès que l'utilisateur est connecté,
  // qu'il l'ait ouvert déjà connecté ou qu'il vienne de se connecter pour lui.
  const pendingFamilyToken = (() => {
    try { return sessionStorage.getItem(PENDING_FAMILY_TOKEN); } catch { return null; }
  })();

  useEffect(() => {
    if (!isAuthenticated || !pendingFamilyToken) return;

    let cancelled = false;
    setFamilyJoin({ status: 'pending' });
    api.joinFamily(pendingFamilyToken)
      .then((res) => {
        if (!cancelled) setFamilyJoin({ status: 'ok', name: res.data?.family?.name });
      })
      .catch((err) => {
        if (!cancelled) {
          setFamilyJoin({
            status: 'error',
            message: err.response?.data?.detail || 'Impossible de rejoindre ce groupe',
          });
        }
      })
      .finally(() => {
        // Consommé dans tous les cas : réessayer en boucle un jeton expiré
        // afficherait la même erreur à chaque rechargement.
        try { sessionStorage.removeItem(PENDING_FAMILY_TOKEN); } catch { /* ignore */ }
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, pendingFamilyToken]);

  // Le provider de langue enveloppe les quatre états de l'application. Rendre
  // le contenu par une fonction interne évite de répéter la balise à chaque
  // sortie anticipée — et d'en oublier une, ce qui ferait retomber cet écran-là
  // en français sans que rien ne le signale.
  const renderContent = () => {
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-center"><div className="spinner mx-auto mb-4"></div><p style={{ color: 'var(--text-2)' }}>Chargement...</p></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <AuthPage onLoginSuccess={handleLoginSuccess} pendingFamilyToken={pendingFamilyToken} />
      </ErrorBoundary>
    );
  }

  if (currentUser?.must_change_password) {
    return (
      <ErrorBoundary>
        <ForcePasswordChange currentUser={currentUser} onDone={setCurrentUser} onLogout={handleLogout} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {familyJoin && familyJoin.status !== 'pending' && (
        <div
          className="fixed top-2 left-1/2 z-50 px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-3"
          style={{
            transform: 'translateX(-50%)',
            maxWidth: 'calc(100vw - 1rem)',
            background: familyJoin.status === 'ok' ? 'var(--success)' : 'var(--danger)',
            color: '#fff',
          }}
        >
          <Icon name={familyJoin.status === 'ok' ? 'checkCircle' : 'alertCircle'} size={17} />
          <span>
            {familyJoin.status === 'ok'
              ? `Vous avez rejoint le groupe ${familyJoin.name || ''}`.trim()
              : familyJoin.message}
          </span>
          <button
            onClick={() => setFamilyJoin(null)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
            aria-label="Fermer"
          >
            <Icon name="close" size={15} strokeWidth={2.2} />
          </button>
        </div>
      )}
      <AppContent isAuthenticated={isAuthenticated} currentUser={currentUser} onLogout={handleLogout} />
    </ErrorBoundary>
  );
  };

  return <PreferencesProvider user={currentUser}>{renderContent()}</PreferencesProvider>;
}