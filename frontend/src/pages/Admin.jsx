import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

function ToggleSwitch({ checked, onChange, disabled, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      title={title}
      className="relative inline-flex items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        width: '48px',
        height: '26px',
        background: checked ? 'var(--success)' : 'var(--danger)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
      }}
    >
      <span
        className="inline-block rounded-full bg-white shadow transition-transform"
        style={{
          width: '20px',
          height: '20px',
          transform: checked ? 'translateX(25px)' : 'translateX(3px)',
          transition: 'transform 150ms ease',
        }}
      />
    </button>
  );
}

export default function Admin({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // ── Mode d'inscription (contrôle l'affichage de la création de compte) ──
  const [registrationMode, setRegistrationMode] = useState(null);

  // ── Création de compte par l'admin ──
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '',
    display_name: '',
    password: '',
    is_admin: false,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createdResult, setCreatedResult] = useState(null); // { username, generated_password }

  // ── Réinitialisation de mot de passe par l'admin ──
  const [resetting, setResetting] = useState(null);
  const [resetError, setResetError] = useState(null);
  const [resetResult, setResetResult] = useState(null); // { username, generated_password }
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(true);
  const [togglingReset, setTogglingReset] = useState(false);

  useEffect(() => {
    loadUsers();
    loadRegistrationMode();
    loadPasswordResetStatus();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getAllUsers();
      setUsers(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors du chargement des utilisateurs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadRegistrationMode = async () => {
    try {
      const res = await api.getRegistrationMode();
      setRegistrationMode(res.data.mode);
    } catch (err) {
      console.error('Failed to load registration mode', err);
    }
  };

  const loadPasswordResetStatus = async () => {
    try {
      const res = await api.getPasswordResetStatus();
      setPasswordResetEnabled(res.data.enabled);
    } catch (err) {
      console.error('Failed to load password reset status', err);
    }
  };

  const handleTogglePasswordReset = async () => {
    const next = !passwordResetEnabled;
    const msg = next
      ? 'Réactiver la réinitialisation de mot de passe par les admins ?'
      : 'Désactiver la réinitialisation de mot de passe ?\n\nAucun admin (y compris vous) ne pourra plus réinitialiser un mot de passe tant que ce n\'est pas réactivé ici.';
    if (!window.confirm(msg)) return;

    setTogglingReset(true);
    try {
      const res = await api.setPasswordResetStatus(next);
      setPasswordResetEnabled(res.data.enabled);
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Erreur lors du changement de statut');
      console.error(err);
    } finally {
      setTogglingReset(false);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur "${username}" ?\n\nSes véhicules et données seront supprimés.`)) {
      return;
    }

    setDeleting(userId);
    try {
      await api.deleteUser(userId);
      setUsers(users.filter(u => u.id !== userId));
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression');
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const handlePromoteUser = async (userId, username, isCurrentlyAdmin) => {
    const action = isCurrentlyAdmin ? 'rétrograder en utilisateur' : 'promouvoir administrateur';
    if (!window.confirm(`Êtes-vous sûr de vouloir ${action} "${username}" ?`)) {
      return;
    }

    setDeleting(userId);
    try {
      await api.promoteUser(userId);
      // Recharge la liste
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.detail || `Erreur lors de la ${action}`);
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const handleResetPassword = async (userId, username) => {
    if (!window.confirm(
      `Réinitialiser le mot de passe de "${username}" ?\n\nUn nouveau mot de passe aléatoire sera généré et affiché une seule fois. Toutes ses sessions en cours seront invalidées — l'utilisateur devra se reconnecter avec le nouveau mot de passe.`
    )) {
      return;
    }

    setResetting(userId);
    setResetError(null);
    setResetResult(null);
    try {
      const response = await api.adminResetPassword(userId);
      setResetResult({
        username: response.data.username,
        generated_password: response.data.generated_password,
      });
      loadUsers(); // rafraîchit le badge "demande de reset" / statut mdp temporaire
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Erreur lors de la réinitialisation du mot de passe');
      console.error(err);
    } finally {
      setResetting(null);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreatedResult(null);
    try {
      const payload = {
        username: createForm.username,
        display_name: createForm.display_name,
        is_admin: createForm.is_admin,
      };
      // On n'envoie le mot de passe que si l'admin en a saisi un —
      // sinon le backend en génère un fort automatiquement.
      if (createForm.password) {
        payload.password = createForm.password;
      }
      const response = await api.adminCreateUser(payload);
      setCreatedResult({
        username: response.data.username,
        generated_password: response.data.generated_password || null,
      });
      setCreateForm({ username: '', display_name: '', password: '', is_admin: false });
      loadUsers();
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Erreur lors de la création du compte');
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  if (!currentUser?.is_admin) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto mt-8">
        <h2 className="text-xl font-bold" style={{ color: 'var(--danger)' }}>🔒 Accès refusé</h2>
        <p className="text-secondary text-sm mt-2">Vous n'êtes pas administrateur</p>
      </div>
    );
  }

  // Création manuelle uniquement pertinente en mode "closed" (Privé) ou "open" (Ouvert).
  // En mode "invite", tous les comptes doivent passer par le flux d'invitation.
  const canCreateManually = registrationMode === 'closed' || registrationMode === 'open';

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-1)' }}>
        🛡️ Console Admin
      </h2>

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

      {/* ── Création de compte (Privé ou Ouvert uniquement) ── */}
      {registrationMode !== null && (
        <div className="card p-6 gap-section mb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>
              ➕ Créer un compte
            </h3>
            {canCreateManually && (
              <button
                onClick={() => { setShowCreateForm(!showCreateForm); setCreatedResult(null); setCreateError(null); }}
                className="btn btn-secondary text-xs"
              >
                {showCreateForm ? 'Fermer' : 'Nouveau compte'}
              </button>
            )}
          </div>

          {!canCreateManually && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
              🔒 Le mode d'inscription actuel est <strong>"Sur invitation"</strong>. Pour créer un compte,
              générez un lien d'invitation depuis Paramètres → Inscription, ou changez le mode d'inscription.
            </p>
          )}

          {canCreateManually && showCreateForm && (
            <form onSubmit={handleCreateUser} className="mt-4 space-y-3">
              {createError && (
                <div className="p-2 rounded text-xs" style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
                  ⚠️ {createError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Identifiant*</label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={50}
                    value={createForm.username}
                    onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm rounded input-field"
                    placeholder="ex: jdupont"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Nom affiché*</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={createForm.display_name}
                    onChange={e => setCreateForm({ ...createForm, display_name: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm rounded input-field"
                    placeholder="ex: Jean Dupont"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                    Mot de passe
                    <span className="ml-1 font-normal" style={{ color: 'var(--text-3)' }}>
                      (optionnel — généré automatiquement si laissé vide, affiché une seule fois pour que vous le transmettiez)
                    </span>
                  </label>
                  <input
                    type="password"
                    minLength={6}
                    value={createForm.password}
                    onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm rounded input-field"
                    placeholder="Laisser vide pour génération automatique"
                    autoComplete="new-password"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="create-is-admin"
                    checked={createForm.is_admin}
                    onChange={e => setCreateForm({ ...createForm, is_admin: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="create-is-admin" className="text-xs" style={{ color: 'var(--text-2)' }}>
                    Créer en tant qu'administrateur
                  </label>
                </div>
              </div>

              <button type="submit" disabled={creating} className="btn btn-primary text-sm">
                {creating ? 'Création...' : 'Créer le compte'}
              </button>
            </form>
          )}

          {createdResult && (
            <div className="mt-4 p-3 rounded text-sm" style={{ background: 'var(--success-light)', border: '1px solid var(--success)' }}>
              <p style={{ color: 'var(--text-1)' }}>
                ✅ Compte <strong>@{createdResult.username}</strong> créé avec succès.
              </p>
              {createdResult.generated_password && (
                <div className="mt-2">
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    Mot de passe généré — copiez-le maintenant et transmettez-le à l'utilisateur par un canal sécurisé (il ne sera plus jamais affiché) :
                  </p>
                  <code
                    className="block mt-1 px-2 py-1.5 rounded text-sm select-all"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  >
                    {createdResult.generated_password}
                  </code>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            🔑 Réinitialisation de mot de passe
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            {passwordResetEnabled
              ? 'Les admins peuvent réinitialiser le mot de passe d\'un utilisateur (pas de SMTP/lien par email disponible).'
              : 'Désactivée : aucun admin ne peut réinitialiser un mot de passe actuellement.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold whitespace-nowrap"
            style={{ color: passwordResetEnabled ? 'var(--success)' : 'var(--danger)' }}
          >
            {togglingReset ? '⏳...' : passwordResetEnabled ? 'Activé' : 'Désactivé'}
          </span>
          <ToggleSwitch
            checked={passwordResetEnabled}
            onChange={handleTogglePasswordReset}
            disabled={togglingReset}
            title={passwordResetEnabled ? 'Cliquer pour désactiver' : 'Cliquer pour activer'}
          />
        </div>
      </div>

      {resetError && (
        <div
          className="mb-4 p-3 rounded text-sm"
          style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', color: 'var(--danger)' }}
        >
          ⚠️ {resetError}
        </div>
      )}

      {resetResult && (
        <div className="card p-4 mb-6 text-sm" style={{ background: 'var(--success-light)', border: '1px solid var(--success)' }}>
          <p style={{ color: 'var(--text-1)' }}>
            ✅ Mot de passe de <strong>@{resetResult.username}</strong> réinitialisé.
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>
            Copiez-le maintenant et transmettez-le à l'utilisateur par un canal sécurisé (il ne sera plus jamais affiché) :
          </p>
          <code
            className="block mt-1 px-2 py-1.5 rounded text-sm select-all"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          >
            {resetResult.generated_password}
          </code>
        </div>
      )}

      <div className="card p-6 gap-section">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>
          Gestion des utilisateurs
        </h3>

        {loading ? (
          <div className="text-center py-6">
            <div className="spinner mx-auto mb-2"></div>
            <p style={{ color: 'var(--text-2)' }}>Chargement...</p>
          </div>
        ) : users.length === 0 ? (
          <p style={{ color: 'var(--text-3)' }}>Aucun utilisateur</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>Utilisateur</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>Nom affiché</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>Rôle</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>Créé le</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isServiceAccount = user.username === 'homeassistant';
                  return (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-3 px-3">
                      <span style={{ color: 'var(--text-1)' }}>@{user.username}</span>
                      {user.id === currentUser.id && (
                        <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>(Vous)</span>
                      )}
                      {isServiceAccount && (
                        <span className="text-xs ml-2" style={{ color: '#9333ea' }}>🤖 Service</span>
                      )}
                      {user.password_reset_requested_at && (
                        <span
                          className="text-xs ml-2 px-1.5 py-0.5 rounded font-semibold"
                          style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}
                          title={`Demande de réinitialisation le ${new Date(user.password_reset_requested_at).toLocaleString('fr-FR')}`}
                        >
                          🔔 Demande de reset
                        </span>
                      )}
                      {user.must_change_password && (
                        <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }} title="Doit encore choisir son propre mot de passe">
                          ⏳ mdp temporaire
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3" style={{ color: 'var(--text-2)' }}>
                      {user.display_name}
                    </td>
                    <td className="py-3 px-3">
                      {isServiceAccount ? (
                        <span
                          className="inline-block px-2 py-1 rounded text-xs font-semibold"
                          style={{
                            background: '#ddd6fe',
                            color: '#5b21b6'
                          }}
                        >
                          🤖 SERVICE
                        </span>
                      ) : user.is_admin ? (
                        <span
                          className="inline-block px-2 py-1 rounded text-xs font-semibold"
                          style={{
                            background: 'var(--success)',
                            color: 'white'
                          }}
                        >
                          ADMIN
                        </span>
                      ) : (
                        <span
                          className="text-xs"
                          style={{ color: 'var(--text-3)' }}
                        >
                          Utilisateur
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs" style={{ color: 'var(--text-3)' }}>
                      {new Date(user.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex gap-2">
                        {user.id !== currentUser.id && !isServiceAccount && (
                          <button
                            onClick={() => handlePromoteUser(user.id, user.username, user.is_admin)}
                            disabled={deleting === user.id}
                            className={`text-xs ${user.is_admin ? 'btn btn-secondary' : 'btn btn-primary'}`}
                            title={user.is_admin ? 'Rétrograder en utilisateur' : 'Promouvoir administrateur'}
                          >
                            {user.is_admin ? '👤 Rétrograder' : '🛡️ Promouvoir'}
                          </button>
                        )}
                        {isServiceAccount && (
                          <span className="text-xs px-2 py-1" style={{ color: 'var(--text-3)' }}>
                            ⛔ Compte protégé
                          </span>
                        )}
                        {!isServiceAccount && passwordResetEnabled && user.id !== currentUser.id && (
                          <button
                            onClick={() => handleResetPassword(user.id, user.username)}
                            disabled={resetting === user.id}
                            className={`btn text-xs ${user.password_reset_requested_at ? 'btn-primary' : 'btn-secondary'}`}
                            title="Réinitialiser le mot de passe (utile en l'absence d'email, ex: mot de passe oublié)"
                          >
                            {resetting === user.id ? '...' : '🔑 Réinitialiser MDP'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          disabled={user.id === currentUser.id || deleting === user.id || user.is_admin || isServiceAccount}
                          className="btn btn-danger text-xs"
                          style={{
                            opacity: (user.id === currentUser.id || user.is_admin || isServiceAccount) ? 0.5 : 1,
                            cursor: (user.id === currentUser.id || user.is_admin || isServiceAccount) ? 'not-allowed' : 'pointer'
                          }}
                          title={isServiceAccount ? "Impossible : compte de service protégé" : (user.is_admin ? "Impossible : rétrogradez-le d'abord" : 'Supprimer cet utilisateur')}
                        >
                          {deleting === user.id ? '...' : '🗑️ Supprimer'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-6 gap-section mt-6 bg-blue-50 dark:bg-blue-900/20" style={{ background: 'var(--info-light)' }}>
        <h4 className="font-semibold" style={{ color: 'var(--text-1)' }}>ℹ️ Informations</h4>
        <ul className="text-xs space-y-1" style={{ color: 'var(--text-2)' }}>
          <li>✅ Le premier utilisateur créé est automatiquement administrateur</li>
          <li>✅ Seul un admin peut accéder à cette console</li>
          <li>✅ Un admin peut promouvoir/rétrograder d'autres utilisateurs</li>
          <li>✅ Un admin peut créer un compte directement en mode "Privé" ou "Ouvert"</li>
          <li>✅ Un admin peut réinitialiser le mot de passe d'un utilisateur (pas d'email/SMTP disponible en self-hosted) — ça déconnecte immédiatement toutes ses sessions en cours</li>
          <li>🔑 Un mot de passe créé ou réinitialisé par un admin est temporaire : l'utilisateur est forcé d'en choisir un nouveau à sa prochaine connexion</li>
          <li>🔔 Un utilisateur peut signaler un mot de passe oublié depuis l'écran de connexion — ça fait apparaître un badge ici, à traiter avec "Réinitialiser MDP"</li>
          <li>🔒 Un admin ne peut pas réinitialiser son propre mot de passe ici (risque de se déconnecter sans pouvoir revenir) — utilisez Paramètres → Compte</li>
          <li>⚙️ La réinitialisation de mot de passe peut être désactivée globalement (bouton ci-dessus)</li>
          <li>🔒 En mode "Sur invitation", passez par les liens d'invitation (Paramètres → Inscription)</li>
          <li>🔒 Un admin ne peut pas modifier son propre statut</li>
          <li>🔒 <strong>Les administrateurs ne peuvent PAS être supprimés</strong> (rétrogradez-le d'abord)</li>
          <li>⚠️ Supprimer un utilisateur supprime aussi tous ses véhicules</li>
        </ul>
      </div>
    </div>
  );
}