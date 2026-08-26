import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import Icon from '../components/Icon';
import Notice from '../components/Notice';

export default function AuthPage({ onLoginSuccess, pendingFamilyToken = null }) {
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
  // Groupe famille à rejoindre après connexion (lien /rejoindre/<token>).
  // Le rattachement lui-même a lieu dans App.jsx une fois authentifié ; ici on
  // se contente de dire à l'invité pourquoi on lui demande de se connecter.
  const [pendingFamily, setPendingFamily] = useState(null);

  // Form state - Login
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Mot de passe oublié
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotMessage, setForgotMessage] = useState(null);

  // Form state - Register
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');

  // Lien de groupe famille ouvert sans être connecté : on récupère le nom du
  // foyer pour expliquer la demande de connexion. Un « connectez-vous » sans
  // motif, après avoir cliqué sur un lien reçu d'un proche, passerait pour une
  // erreur.
  useEffect(() => {
    if (!pendingFamilyToken) return;
    api.checkInvite(pendingFamilyToken)
      .then((res) => setPendingFamily(res.data?.family || null))
      .catch(() => setPendingFamily(null));
  }, [pendingFamilyToken]);

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

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotSubmitting(true);
    setForgotMessage(null);
    try {
      const res = await api.requestPasswordReset(forgotUsername);
      setForgotMessage(res.data.message);
      setForgotUsername('');
    } catch (err) {
      // Réponse générique même en cas d'erreur réseau/serveur — on ne veut
      // pas laisser deviner si un identifiant existe ou non.
      setForgotMessage("Si ce compte existe, un administrateur a été notifié de votre demande.");
    } finally {
      setForgotSubmitting(false);
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
          <div
            className="flex items-center justify-center mb-3"
            style={{
              width: 88, height: 88,
              // Voir App.jsx : le logo est un tracé sombre sur transparent.
              background: '#ffffff',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
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

        {/* Lien de rattachement à un groupe famille ouvert sans être connecté */}
        {pendingFamilyToken && (
          <Notice tone="info" icon="users" className="mb-4">
            {pendingFamily ? (
              <>
                Connectez-vous pour rejoindre le groupe <strong>{pendingFamily.name}</strong> et
                consulter les véhicules de ses membres.
              </>
            ) : (
              <>Connectez-vous pour rejoindre le groupe famille auquel vous avez été invité.</>
            )}
            <span className="block text-xs mt-2" style={{ color: 'var(--text-3)' }}>
              Ce lien ne crée pas de compte. Si vous n'en avez pas encore, demandez-en un à
              l'administrateur de cette instance.
            </span>
          </Notice>
        )}

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
          {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
          {success && <Notice tone="success" className="mb-4">{success}</Notice>}

          {/* Login Form */}
          {!isRegister ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {lockoutSeconds > 0 && (
                <div
                  className="text-center"
                  style={{
                    background: 'var(--warning-light)',
                    border: '1px solid var(--warning)',
                    borderRadius: 'var(--radius)',
                    padding: 16,
                    color: 'var(--text-1)',
                  }}
                >
                  <div className="tabular" style={{ fontSize: 24, fontWeight: 800, color: 'var(--warning)' }}>{lockoutSeconds}s</div>
                  <p className="text-sm" style={{ color: 'var(--text-2)' }}>Trop de tentatives. Veuillez patienter.</p>
                </div>
              )}
              <div>
                <label className="field-label">
                  Identifiant
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="toto"
                  className="w-full"
                  disabled={loading || lockoutSeconds > 0}
                  required
                />
              </div>

              <div>
                <label className="field-label">
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full"
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
            </form>
          ) : null}

          {/* Hors du <form> de login : un <form> imbriqué dans un autre est invalide en HTML
              (le navigateur ferme le form parent, ce qui empêche la soumission de partir). */}
          {!isRegister && (
            <>
              <button
                type="button"
                onClick={() => { setShowForgotPassword(!showForgotPassword); setForgotMessage(null); }}
                className="text-xs w-full text-center mt-2 underline"
                style={{ color: 'var(--text-3)' }}
              >
                Mot de passe oublié ?
              </button>

              {showForgotPassword && (
                <div className="inset mt-3" style={{ padding: 12 }}>
                  {forgotMessage ? (
                    <p className="text-xs flex items-start gap-2" style={{ color: 'var(--text-2)' }}>
                      <Icon name="checkCircle" size={14} style={{ color: 'var(--success)', marginTop: 1 }} />
                      {forgotMessage}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>
                        Pas d'email de reset ici (application self-hosted) — votre identifiant sera signalé aux administrateurs, qui pourront réinitialiser votre mot de passe depuis la console admin.
                      </p>
                      <form onSubmit={handleForgotPassword} className="flex gap-2">
                        <input
                          type="text"
                          value={forgotUsername}
                          onChange={(e) => setForgotUsername(e.target.value)}
                          placeholder="Votre identifiant"
                          className="flex-1"
                          required
                          disabled={forgotSubmitting}
                        />
                        <button type="submit" className="btn btn-secondary btn-sm" disabled={forgotSubmitting}>
                          {forgotSubmitting ? '...' : 'Envoyer'}
                        </button>
                      </form>
                    </>
                  )}
                </div>
              )}

              <p className="text-xs flex items-center justify-center gap-1.5 mt-4" style={{ color: 'var(--text-3)' }}>
                <Icon name="lock" size={12} />
                Mot de passe haché avec bcrypt
              </p>
            </>
          )}

          {isRegister && (
            /* Register Form */
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="field-label">
                  Identifiant <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="toto"
                  className="w-full"
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
                <label className="field-label">
                  Nom affiché <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={regDisplayName}
                  onChange={(e) => setRegDisplayName(e.target.value)}
                  placeholder="Toto Dupont"
                  className="w-full"
                  disabled={loading}
                  required
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  Affiché comme "Garage de Toto Dupont"
                </p>
              </div>

              <div>
                <label className="field-label">
                  Mot de passe <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full"
                  minLength={6}
                  disabled={loading}
                  required
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  Minimum 6 caractères
                </p>
              </div>

              <div>
                <label className="field-label">
                  Confirmer le mot de passe <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="password"
                  value={regPasswordConfirm}
                  onChange={(e) => setRegPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full"
                  disabled={loading}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full mt-6"
                disabled={loading}
              >
                {loading ? 'Création…' : 'Créer un compte'}
              </button>

              <p className="text-xs flex items-center justify-center gap-1.5 mt-4" style={{ color: 'var(--text-3)' }}>
                <Icon name="lock" size={12} />
                Données stockées localement (SQLite)
              </p>

              {/* Les jetons --info / --info-light n'ont jamais existé : ce
                  bandeau s'affichait sans fond et avec une couleur héritée. */}
              {isFirstUser ? (
                <Notice tone="success" icon="star" title="Le premier compte créé sera administrateur" className="mt-4">
                  Il pourra ensuite promouvoir ou rétrograder les suivants.
                </Notice>
              ) : registrationMode === 'invite' && inviteToken && inviteValid ? (
                <Notice tone="success" className="mt-4">
                  <strong>Invitation valide</strong> — créez votre compte ci-dessus.
                </Notice>
              ) : registrationMode === 'invite' && inviteToken && inviteValid === false ? (
                <Notice tone="danger" className="mt-4">
                  <strong>Invitation invalide ou expirée.</strong>
                </Notice>
              ) : registrationMode === 'open' ? (
                <Notice tone="info" icon="globe" className="mt-4">
                  <strong>Inscription ouverte</strong> — créez votre compte librement.
                </Notice>
              ) : (
                <Notice tone="info" icon="lock" title="Inscription sur invitation uniquement" className="mt-4">
                  Demandez un lien d'invitation à un administrateur.
                </Notice>
              )}
            </form>
          )}
        </div>

        {/* Info */}
        <p className="mt-6 text-center text-xs flex items-center justify-center gap-1.5" style={{ color: 'var(--text-3)' }}>
          <Icon name="shield" size={12} />
          Instance auto-hébergée — aucune donnée n'est partagée à l'extérieur.
        </p>
      </div>
    </div>
  );
}
