import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Icon from '../components/Icon';
import Notice from '../components/Notice';
import PageHeader from '../components/PageHeader';
import { useFormat, useT } from '../lib/preferencesContext';

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
        // Un interrupteur « éteint » en rouge se lit comme une erreur : gris.
        background: checked ? 'var(--success)' : 'var(--border-strong)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
      }}
    >
      <span
        className="inline-block rounded-full transition-transform"
        // Le curseur reste blanc dans les deux thèmes : il se pose toujours sur
        // une piste colorée, jamais sur le fond de la page.

        style={{
          width: '20px',
          height: '20px',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          transform: checked ? 'translateX(25px)' : 'translateX(3px)',
          transition: 'transform 150ms ease',
        }}
      />
    </button>
  );
}

export default function Admin({ currentUser }) {
  const t = useT();
  // Le format d'une date suit la LANGUE, comme les séparateurs de milliers
  // (§20.6) — d'où fmt.date() plutôt qu'une locale en dur.
  const fmt = useFormat();
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
      setError(err.response?.data?.detail || t('Erreur lors du chargement des utilisateurs'));
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
      ? t('Réactiver la réinitialisation de mot de passe par les admins ?')
      : t('Désactiver la réinitialisation de mot de passe ?\n\nAucun admin (y compris vous) ne pourra plus réinitialiser un mot de passe tant que ce n\'est pas réactivé ici.');
    if (!window.confirm(msg)) return;

    setTogglingReset(true);
    try {
      const res = await api.setPasswordResetStatus(next);
      setPasswordResetEnabled(res.data.enabled);
    } catch (err) {
      setResetError(err.response?.data?.detail || t('Erreur lors du changement de statut'));
      console.error(err);
    } finally {
      setTogglingReset(false);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(t('Êtes-vous sûr de vouloir supprimer l\'utilisateur « {name} » ?\n\nSes véhicules et données seront supprimés.', { name: username }))) {
      return;
    }

    setDeleting(userId);
    try {
      await api.deleteUser(userId);
      setUsers(users.filter(u => u.id !== userId));
    } catch (err) {
      setError(err.response?.data?.detail || t('Erreur lors de la suppression'));
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const handlePromoteUser = async (userId, username, isCurrentlyAdmin) => {
    // Deux phrases entières plutôt qu'un verbe injecté dans une trame : la
    // place du complément change d'une langue à l'autre, et « voulez-vous
    // {verbe} X » ne se traduit pas.
    const question = isCurrentlyAdmin
      ? t('Rétrograder « {name} » en simple utilisateur ?', { name: username })
      : t('Promouvoir « {name} » administrateur ?', { name: username });
    if (!window.confirm(question)) {
      return;
    }

    setDeleting(userId);
    try {
      await api.promoteUser(userId);
      // Recharge la liste
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.detail || t('Le changement de rôle a échoué.'));
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const handleResetPassword = async (userId, username) => {
    if (!window.confirm(
      t('Réinitialiser le mot de passe de « {name} » ?\n\nUn nouveau mot de passe aléatoire sera généré et affiché une seule fois. Toutes ses sessions en cours seront invalidées — l\'utilisateur devra se reconnecter avec le nouveau mot de passe.', { name: username })
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
      setResetError(err.response?.data?.detail || t('Erreur lors de la réinitialisation du mot de passe'));
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
      setCreateError(err.response?.data?.detail || t('Erreur lors de la création du compte'));
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  if (!currentUser?.is_admin) {
    return (
      <div className="card text-center max-w-md mx-auto mt-8" style={{ padding: '40px 24px' }}>
        <div className="icon-box lg danger mx-auto" style={{ marginBottom: 12 }}>
          <Icon name="lock" size={20} />
        </div>
        <h2 style={{ fontSize: '1.15rem' }}>{t('Accès refusé')}</h2>
        <p className="text-secondary text-sm mt-1">{t('Cette console est réservée aux administrateurs.')}</p>
      </div>
    );
  }

  // Création manuelle uniquement pertinente en mode "closed" (Privé) ou "open" (Ouvert).
  // En mode "invite", tous les comptes doivent passer par le flux d'invitation.
  const canCreateManually = registrationMode === 'closed' || registrationMode === 'open';

  return (
    <div>
      <PageHeader
        title={t('Administration')}
        subtitle={t('Comptes, rôles et mots de passe de cette instance.')}
      />

      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}

      {/* ── Création de compte (Privé ou Ouvert uniquement) ── */}
      {registrationMode !== null && (
        <div className="card mb-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="section-title">{t('Créer un compte')}</h3>
            {canCreateManually && (
              <button
                onClick={() => { setShowCreateForm(!showCreateForm); setCreatedResult(null); setCreateError(null); }}
                className={`btn btn-sm ${showCreateForm ? 'btn-secondary' : 'btn-primary'}`}
              >
                <Icon name={showCreateForm ? 'close' : 'plus'} size={15} strokeWidth={2} />
                {showCreateForm ? t('Fermer') : t('Nouveau compte')}
              </button>
            )}
          </div>

          {!canCreateManually && (
            <Notice tone="neutral" icon="lock" className="mt-3">
              {t("Le mode d'inscription est « Sur invitation ». Pour faire entrer quelqu'un, générez un lien depuis Paramètres → Inscription, ou changez le mode d'inscription.")}
            </Notice>
          )}

          {canCreateManually && showCreateForm && (
            <form onSubmit={handleCreateUser} className="mt-4 space-y-3">
              {createError && <Notice tone="danger">{createError}</Notice>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">{t('Identifiant*')}</label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={50}
                    value={createForm.username}
                    onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                    className="w-full"
                    placeholder="ex: jdupont"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="field-label">{t('Nom affiché*')}</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={createForm.display_name}
                    onChange={e => setCreateForm({ ...createForm, display_name: e.target.value })}
                    className="w-full"
                    placeholder="ex: Jean Dupont"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">
                    {t('Mot de passe')}
                    <span className="ml-1 font-normal" style={{ color: 'var(--text-3)' }}>
                      {t('(optionnel — généré automatiquement si laissé vide, affiché une seule fois pour que vous le transmettiez)')}
                    </span>
                  </label>
                  <input
                    type="password"
                    minLength={6}
                    value={createForm.password}
                    onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full"
                    placeholder={t('Laisser vide pour génération automatique')}
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
                    {t("Créer en tant qu'administrateur")}
                  </label>
                </div>
              </div>

              <button type="submit" disabled={creating} className="btn btn-primary text-sm">
                {creating ? t('Création…') : t('Créer le compte')}
              </button>
            </form>
          )}

          {createdResult && (
            <Notice tone="success" className="mt-4">
              <p style={{ color: 'var(--text-1)' }}>
                {t('Compte @{name} créé.', { name: createdResult.username })}
              </p>
              {createdResult.generated_password && (
                <div className="mt-2">
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    {t("Mot de passe généré — copiez-le maintenant et transmettez-le à l'utilisateur par un canal sécurisé (il ne sera plus jamais affiché) :")}
                  </p>
                  <code
                    className="block mt-1 px-2 py-1.5 rounded text-sm select-all"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  >
                    {createdResult.generated_password}
                  </code>
                </div>
              )}
            </Notice>
          )}
        </div>
      )}

      <div className="card mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="icon-box"><Icon name="key" size={17} /></div>
          <div>
          <h3 className="section-title" style={{ fontSize: '0.95rem' }}>
            {t('Réinitialisation de mot de passe')}
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            {passwordResetEnabled
              ? t("Les admins peuvent réinitialiser le mot de passe d'un utilisateur (pas de SMTP/lien par email disponible).")
              : t('Désactivée : aucun admin ne peut réinitialiser un mot de passe actuellement.')}
          </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold whitespace-nowrap"
            style={{ color: passwordResetEnabled ? 'var(--success)' : 'var(--danger)' }}
          >
            {togglingReset ? t('Patientez…') : passwordResetEnabled ? t('Activé') : t('Désactivé')}
          </span>
          <ToggleSwitch
            checked={passwordResetEnabled}
            onChange={handleTogglePasswordReset}
            disabled={togglingReset}
            title={passwordResetEnabled ? t('Cliquer pour désactiver') : t('Cliquer pour activer')}
          />
        </div>
      </div>

      {resetError && <Notice tone="danger" className="mb-4">{resetError}</Notice>}

      {resetResult && (
        <Notice tone="success" className="mb-5">
          <p style={{ color: 'var(--text-1)' }}>
            {t('Mot de passe de @{name} réinitialisé.', { name: resetResult.username })}
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>
            {t("Copiez-le maintenant et transmettez-le à l'utilisateur par un canal sécurisé (il ne sera plus jamais affiché) :")}
          </p>
          <code
            className="block mt-1 px-2 py-1.5 rounded text-sm select-all"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          >
            {resetResult.generated_password}
          </code>
        </Notice>
      )}

      <div className="card">
        <h3 className="section-title mb-3">{t('Gestion des utilisateurs')}</h3>

        {loading ? (
          <div className="text-center py-6">
            <div className="spinner mx-auto mb-2"></div>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>{t('Chargement…')}</p>
          </div>
        ) : users.length === 0 ? (
          <p style={{ color: 'var(--text-3)' }}>{t('Aucun utilisateur.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>{t('Utilisateur')}</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>{t('Nom affiché')}</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>{t('Rôle')}</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>{t('Créé le')}</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isServiceAccount = user.username === 'homeassistant';
                  return (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>@{user.username}</span>
                        {user.id === currentUser.id && (
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{t('(vous)')}</span>
                        )}
                        {user.password_reset_requested_at && (
                          <span
                            className="badge badge-warning"
                            title={t('Demande de réinitialisation le {date}', { date: fmt.date(user.password_reset_requested_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
                          >
                            <Icon name="bell" size={11} strokeWidth={2.2} />
                            {t('Reset demandé')}
                          </span>
                        )}
                        {user.must_change_password && (
                          <span className="badge badge-neutral" title={t('Doit encore choisir son propre mot de passe')}>
                            <Icon name="clock" size={11} strokeWidth={2.2} />
                            {t('Mot de passe temporaire')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>
                      {user.display_name}
                    </td>
                    <td>
                      {isServiceAccount ? (
                        <span className="badge" style={{ background: 'var(--purple-light)', color: 'var(--purple)' }}>
                          <Icon name="cpu" size={11} strokeWidth={2.2} />
                          {t('Service')}
                        </span>
                      ) : user.is_admin ? (
                        <span className="badge badge-success">
                          <Icon name="shield" size={11} strokeWidth={2.2} />
                          {t('Admin')}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{t('Utilisateur')}</span>
                      )}
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {fmt.date(user.created_at)}
                    </td>
                    <td>
                      <div className="flex gap-1.5 items-center flex-wrap">
                        {user.id !== currentUser.id && !isServiceAccount && (
                          <button
                            onClick={() => handlePromoteUser(user.id, user.username, user.is_admin)}
                            disabled={deleting === user.id}
                            className="btn btn-secondary btn-sm"
                            title={user.is_admin ? t('Rétrograder en utilisateur') : t('Promouvoir administrateur')}
                          >
                            <Icon name={user.is_admin ? 'user' : 'shield'} size={14} />
                            {user.is_admin ? t('Rétrograder') : t('Promouvoir')}
                          </button>
                        )}
                        {isServiceAccount && (
                          <span className="text-xs inline-flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                            <Icon name="lock" size={13} />
                            {t('Compte protégé')}
                          </span>
                        )}
                        {!isServiceAccount && passwordResetEnabled && user.id !== currentUser.id && (
                          <button
                            onClick={() => handleResetPassword(user.id, user.username)}
                            disabled={resetting === user.id}
                            className={`btn btn-sm ${user.password_reset_requested_at ? 'btn-primary' : 'btn-secondary'}`}
                            title={t("Réinitialiser le mot de passe (utile en l'absence d'email)")}
                          >
                            <Icon name="key" size={14} />
                            {resetting === user.id ? t('Patientez…') : t('Réinitialiser')}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          disabled={user.id === currentUser.id || deleting === user.id || user.is_admin || isServiceAccount}
                          className="btn-icon danger"
                          aria-label={t('Supprimer @{name}', { name: user.username })}
                          title={isServiceAccount
                            ? t('Impossible : compte de service protégé')
                            : (user.is_admin ? t("Impossible : rétrogradez-le d'abord") : t('Supprimer cet utilisateur'))}
                        >
                          <Icon name="trash" size={15} />
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

      {/* Une phrase par puce, et la phrase ENTIÈRE dans la clé : couper au
          milieu pour garder un <strong> laissait des moitiés de phrase dans le
          catalogue, intraduisibles hors contexte. L'emphase se perd, le sens
          se garde. */}
      <Notice tone="neutral" title={t("Ce que cette console permet, et ce qu'elle interdit")} className="mt-5">
        <ul className="space-y-1 mt-1 list-disc list-inside">
          <li>{t("Le premier compte créé sur l'instance est automatiquement administrateur.")}</li>
          <li>{t('Un administrateur peut promouvoir ou rétrograder les autres, mais pas lui-même.')}</li>
          <li>{t('En mode « Privé » ou « Ouvert », un administrateur crée un compte directement ; en mode « Sur invitation », il passe par un lien (Paramètres → Inscription).')}</li>
          <li>{t("Un mot de passe créé ou réinitialisé par un administrateur est temporaire : la personne devra en choisir un à sa prochaine connexion, et ses sessions en cours sont déconnectées.")}</li>
          <li>{t("Depuis l'écran de connexion, un utilisateur peut signaler un mot de passe oublié : un badge apparaît ici. Il n'y a pas d'envoi d'email en self-hosted.")}</li>
          <li>{t("Un administrateur ne peut pas réinitialiser son propre mot de passe ici — il risquerait de se déconnecter sans pouvoir revenir. Passez par Paramètres → Compte.")}</li>
          <li>{t("Les administrateurs ne peuvent pas être supprimés : rétrogradez-les d'abord.")}</li>
          <li>{t('Supprimer un utilisateur supprime aussi tous ses véhicules.')}</li>
        </ul>
      </Notice>
    </div>
  );
}