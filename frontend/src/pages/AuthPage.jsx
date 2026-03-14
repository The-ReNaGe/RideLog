import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';

export default function AuthPage({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const lockoutTimer = useRef(null);

  // Invitation state
  const [inviteToken, setInviteToken] = useState(null);
  const [registrationMode, setRegistrationMode] = useState(null); // null = loading, 'open'/'invite'/'closed'
  const [isFirstUser, setIsFirstUser] = useState(false);
  const [inviteValid, setInviteValid] = useState(null); // null = not checked, true/false

  // Form state - Login
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Form state - Register
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');

  // Extract invite token from URL on mount
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/invite\/(.+)$/);
    if (match) {
      const token = match[1];
      setInviteToken(token);
      setIsRegister(true);
      // Validate the token
      api.checkInvite(token)
        .then(() => setInviteValid(true))
        .catch((err) => {
          setInviteValid(false);
          setError(err.response?.data?.detail || "Lien d'invitation invalide");
        });
    }
    // Check registration mode
    api.getRegistrationStatus()
      .then((res) => {
        setRegistrationMode(res.data.mode);
        setIsFirstUser(res.data.is_first_user);
      })
      .catch(() => setRegistrationMode('closed'));
  }, []);
  const startLockoutTimer = (seconds) => {
    if (lockoutTimer.current) clearInterval(lockoutTimer.current);
    setLockoutSeconds(seconds);
    lockoutTimer.current = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(lockoutTimer.current);
          lockoutTimer.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => { if (lockoutTimer.current) clearInterval(lockoutTimer.current); };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    setError(null);
    setLoading(true);

    try {
      const response = await api.login(loginUsername, loginPassword);
      const { access_token, token_type } = response.data;

      // Stocke le token
      localStorage.setItem('access_token', access_token);

      // Récupère les infos de l'utilisateur
      const userResponse = await api.getCurrentUser();
      localStorage.setItem('user', JSON.stringify(userResponse.data));

      // Informe l'app parent
      onLoginSuccess();
    } catch (err) {
      if (err.response?.status === 429) {
        let retryAfter = parseInt(err.response.headers['retry-after'], 10);
        if (!retryAfter || isNaN(retryAfter)) {
          const match = err.response.data?.detail?.match(/(\d+)\s*secondes/);
          retryAfter = match ? parseInt(match[1], 10) : 30;
        }
        startLockoutTimer(retryAfter);
        setError(null);
      } else {
        setError(err.response?.data?.detail || 'Erreur de connexion');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await api.register(
        regUsername,
        regDisplayName,
        regPassword,
        regPasswordConfirm,
        inviteToken
      );

      setSuccess('Compte créé avec succès! Connectez-vous maintenant.');
      // Reset form
      setRegUsername('');
      setRegDisplayName('');
      setRegPassword('');
      setRegPasswordConfirm('');
      // Clean URL if invite link
      if (inviteToken) {
        window.history.replaceState(null, '', '/');
        setInviteToken(null);
      }
      // Auto-switch to login
      setTimeout(() => setIsRegister(false), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la création du compte');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg-base)' }}
    >
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center bg-white/90 rounded-2xl shadow-md border border-gray-200 mb-3"
               style={{ width: '88px', height: '88px' }}>
            <img
              src="/RideLog.png"
              alt="RideLog logo"
              style={{ maxHeight: '72px', maxWidth: '72px', objectFit: 'contain', display: 'block' }}
              className="select-none pointer-events-none"
              draggable="false"
            />
          </div>
          <p className="text-base font-medium text-center" style={{ color: 'var(--text-2)' }}>
            Suivi d'entretien véhicules
          </p>
        </div>

        {/* Card */}
        <div className="card p-8 gap-section">
          {/* Tabs — only show when registration is available */}
          {(isFirstUser || registrationMode === 'open' || (registrationMode === 'invite' && inviteToken)) && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => {
                  setIsRegister(false);
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-2 px-4 rounded font-semibold transition ${
                  !isRegister ? 'btn btn-primary' : 'btn btn-secondary'
                }`}
              >
                Connexion
              </button>
              <button
                onClick={() => {
                  setIsRegister(true);
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-2 px-4 rounded font-semibold transition ${
                  isRegister ? 'btn btn-primary' : 'btn btn-secondary'
                }`}
              >
                Créer un compte
              </button>
            </div>
          )}

          {/* Messages */}
          {error && (
            <div
              className="mb-4 p-3 rounded text-sm"
              style={{
                background: 'var(--danger-light)',
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {success && (
            <div
              className="mb-4 p-3 rounded text-sm"
              style={{
                background: 'var(--success)',
                color: 'white',
              }}
            >
              ✅ {success}
            </div>
          )}

          {/* Login Form */}
          {!isRegister ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {lockoutSeconds > 0 && (
                <div
                  className="p-4 rounded text-center"
                  style={{
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    color: '#92400e',
                  }}
                >
                  <div className="text-2xl font-bold mb-1">{lockoutSeconds}s</div>
                  <p className="text-sm">Trop de tentatives. Veuillez patienter.</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
                  Identifiant
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="toto"
                  className="input w-full"
                  disabled={loading || lockoutSeconds > 0}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input w-full"
                  disabled={loading || lockoutSeconds > 0}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full mt-6"
                disabled={loading || lockoutSeconds > 0}
                style={{ opacity: lockoutSeconds > 0 ? 0.5 : 1 }}
              >
                {lockoutSeconds > 0 ? `Bloqué (${lockoutSeconds}s)` : loading ? 'Chargement...' : 'Valider'}
              </button>

              <p className="text-xs text-center mt-4" style={{ color: 'var(--text-3)' }}>
                🔒 Votre mot de passe est haché avec bcrypt (sécurisé)
              </p>
            </form>
          ) : (
            /* Register Form */
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
                  Identifiant <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="toto"
                  className="input w-full"
                  minLength={3}
                  maxLength={50}
                  disabled={loading}
                  required
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  3-50 caractères, unique
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
                  Nom affiché <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={regDisplayName}
                  onChange={(e) => setRegDisplayName(e.target.value)}
                  placeholder="Toto Dupont"
                  className="input w-full"
                  disabled={loading}
                  required
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  Affiché comme "Garage de Toto Dupont"
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
                  Mot de passe <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input w-full"
                  minLength={6}
                  disabled={loading}
                  required
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  Minimum 6 caractères
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
                  Confirmer le mot de passe <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="password"
                  value={regPasswordConfirm}
                  onChange={(e) => setRegPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="input w-full"
                  disabled={loading}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full mt-6"
                disabled={loading}
              >
                {loading ? 'Création en cours...' : 'Créer un compte'}
              </button>

              <p className="text-xs text-center mt-4" style={{ color: 'var(--text-3)' }}>
                🔒 Données chiffrées &amp; stockées localement (SQLite)
              </p>

              <div
                className="mt-4 p-3 rounded text-xs"
                style={{
                  background: 'var(--info-light)',
                  border: '1px solid var(--info)',
                  color: 'var(--info)',
                }}
              >
                {isFirstUser ? (
                  <>
                    ⭐ <strong>Le premier compte créé sera automatiquement administrateur</strong>
                    <br />
                    L'admin pourra ensuite promouvoir/rétrograder d'autres utilisateurs
                  </>
                ) : registrationMode === 'invite' && inviteToken && inviteValid ? (
                  <>
                    ✅ <strong>Invitation valide</strong> — Créez votre compte ci-dessus
                  </>
                ) : registrationMode === 'invite' && inviteToken && inviteValid === false ? (
                  <>
                    ❌ <strong>Invitation invalide ou expirée</strong>
                  </>
                ) : registrationMode === 'open' ? (
                  <>
                    🌐 <strong>Inscription ouverte</strong> — Créez votre compte librement
                  </>
                ) : (
                  <>
                    🔒 <strong>Inscription sur invitation uniquement</strong>
                    <br />
                    Demandez un lien d'invitation à un administrateur
                  </>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Info */}
        <div className="mt-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>
          <p>
            🏛️ <strong>Sécurité locale</strong> - Aucune donnée n'est partagée
          </p>
          <p className="mt-2">
            1️⃣ Créez un compte • 2️⃣ Connectez-vous • 3️⃣ Gérez vos véhicules
          </p>
        </div>
      </div>
    </div>
  );
}
