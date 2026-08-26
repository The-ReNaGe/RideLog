import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/clipboard';
import Icon from './Icon';
import Notice from './Notice';

/**
 * Gestion du groupe famille — création, membres, invitations.
 *
 * Le partage est en LECTURE SEULE : les membres consultent les véhicules des
 * autres, personne n'écrit chez personne. L'interface le dit explicitement,
 * pour qu'on ne découvre pas la limite en butant dessus.
 */
export default function FamilySettings({ currentUser }) {
  const [family, setFamily] = useState(null);
  const [role, setRole] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [expiresHours, setExpiresHours] = useState(168);
  const [copiedToken, setCopiedToken] = useState(null);
  const [copyError, setCopyError] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const isOwner = role === 'owner';

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getFamily();
      setFamily(res.data.family);
      setRole(res.data.role || null);
      if (res.data.family) {
        const inv = await api.getFamilyInvitations();
        setInvitations(inv.data);
      } else {
        setInvitations([]);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Impossible de charger le groupe');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const run = async (fn, fallbackMessage) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || fallbackMessage);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (token) => {
    setCopyError(null);
    // Chemin distinct de /invite/ : ce lien ne crée PAS de compte, il rattache
    // un compte existant. Les confondre enverrait l'invité sur un formulaire
    // d'inscription que le backend refuserait.
    const link = `${window.location.origin}/rejoindre/${token}`;
    if (await copyToClipboard(link)) {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } else {
      setCopyError('Impossible de copier automatiquement. Copiez le lien manuellement : ' + link);
    }
  };

  if (loading) {
    return <div className="text-center py-8"><div className="spinner mx-auto"></div></div>;
  }

  return (
    <div className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}

      {!family ? (
        <>
          <div className="card p-4">
            <h3 className="section-title flex items-center gap-2 mb-2">
              <Icon name="users" size={17} style={{ color: 'var(--text-3)' }} />
              Groupe famille
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
              Un groupe famille permet aux membres d'un même foyer de <strong>consulter</strong> les
              véhicules des autres : entretiens, échéances et pleins. Chacun reste seul à pouvoir
              modifier les siens — personne n'écrit sur le véhicule d'un autre.
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="field-label">
                  Nom du groupe
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Foyer Dupont"
                  maxLength={100}
                />
              </div>
              <button
                onClick={() => run(() => api.createFamily(newName.trim()), 'Erreur lors de la création')}
                disabled={busy || !newName.trim()}
                className="btn btn-primary"
              >
                <Icon name="plus" size={16} strokeWidth={2} />
                Créer le groupe
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="section-title flex items-center gap-2 mb-2">
              <Icon name="link" size={17} style={{ color: 'var(--text-3)' }} />
              Rejoindre un groupe existant
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--text-2)' }}>
              Collez ici le lien d'invitation qu'on vous a transmis.
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1" style={{ minWidth: '240px' }}>
                <input
                  type="text"
                  value={joinToken}
                  onChange={(e) => setJoinToken(e.target.value)}
                  placeholder="https://…/invite/xxxxx  ou  le code seul"
                  className="w-full"
                />
              </div>
              <button
                onClick={() => {
                  // On accepte le lien complet aussi bien que le code seul :
                  // demander à l'utilisateur d'extraire le code lui-même serait
                  // une source d'erreur gratuite.
                  const token = joinToken.trim().split('/').filter(Boolean).pop() || '';
                  return run(() => api.joinFamily(token), 'Invitation invalide ou expirée');
                }}
                disabled={busy || !joinToken.trim()}
                className="btn btn-primary"
              >
                Rejoindre
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="card p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="section-title flex items-center gap-2">
                  <Icon name="users" size={17} style={{ color: 'var(--text-3)' }} />
                  {family.name}
                </h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  {family.members.length} membre{family.members.length > 1 ? 's' : ''}
                  {isOwner ? ' · vous êtes le créateur du groupe' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                {!renaming && (
                  <button
                    onClick={() => { setRenameValue(family.name); setRenaming(true); }}
                    className="btn btn-secondary btn-sm"
                  >
                    <Icon name="pencil" size={14} />
                    Renommer
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!window.confirm(
                      'Quitter le groupe ? Vous ne verrez plus les véhicules des autres membres, ' +
                      'et ils ne verront plus les vôtres.'
                    )) return;
                    return run(() => api.leaveFamily(), 'Erreur lors du départ du groupe');
                  }}
                  disabled={busy}
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--danger)' }}
                >
                  <Icon name="logout" size={14} />
                  Quitter
                </button>
              </div>
            </div>

            {renaming && (
              <div className="flex flex-wrap gap-2 items-end mt-3">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={100}
                />
                <button
                  onClick={() => run(
                    async () => { await api.renameFamily(renameValue.trim()); setRenaming(false); },
                    'Erreur lors du renommage'
                  )}
                  disabled={busy || !renameValue.trim()}
                  className="btn btn-primary btn-sm"
                >
                  Enregistrer
                </button>
                <button onClick={() => setRenaming(false)} className="btn btn-secondary btn-sm">
                  Annuler
                </button>
              </div>
            )}

            {/* max-w-prose : une explication de trois lignes lue sur toute la
                largeur de la carte fatigue à chaque retour à la ligne. */}
            <Notice tone="info" icon="eye" className="mt-3 max-w-prose">
              Les membres <strong>consultent</strong> les véhicules du groupe. Seul le propriétaire
              d'un véhicule peut y enregistrer un entretien ou un plein, et un véhicule marqué
              <strong> Privé</strong> reste invisible aux autres.
            </Notice>
          </div>

          <div className="card p-4">
            <h3 className="section-title mb-3">
              Membres <span className="text-sm font-normal" style={{ color: 'var(--text-3)' }}>
                · {family.members.length}
              </span>
            </h3>
            {/* Une vignette d'initiale, le nom et son identifiant sur la même
                ligne : la version précédente étalait chaque membre sur une
                ligne pleine largeur pour deux mots, laissant un grand vide. */}
            <div>
              {family.members.map((m, index) => (
                <div
                  key={m.user_id}
                  className="flex items-center gap-3 py-2.5"
                  style={{
                    borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
                  }}
                >
                  <span className="avatar" style={{ width: 30, minWidth: 30, height: 30, fontSize: 13 }}>
                    {(m.display_name || m.username || '?').charAt(0)}
                  </span>

                  <div className="flex items-baseline gap-2 flex-wrap min-w-0 flex-1">
                    <span className="font-medium" style={{ color: 'var(--text-1)' }}>
                      {m.display_name}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>@{m.username}</span>
                    {m.user_id === currentUser?.id && (
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>· vous</span>
                    )}
                    {m.role === 'owner' && <span className="badge badge-info">créateur</span>}
                  </div>

                  {isOwner && m.user_id !== currentUser?.id && (
                    <button
                      onClick={() => {
                        if (!window.confirm(`Retirer ${m.display_name} du groupe ?`)) return;
                        return run(
                          () => api.removeFamilyMember(m.user_id),
                          'Erreur lors du retrait du membre'
                        );
                      }}
                      disabled={busy}
                      className="btn btn-secondary btn-sm"
                      style={{ flexShrink: 0, color: 'var(--danger)' }}
                    >
                      Retirer
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="section-title flex items-center gap-2 mb-2">
              <Icon name="mail" size={17} style={{ color: 'var(--text-3)' }} />
              Inviter quelqu'un
            </h3>
            <p className="text-sm mb-3 max-w-prose" style={{ color: 'var(--text-2)' }}>
              Transmettez ce lien à une personne qui a <strong>déjà un compte</strong> sur cette
              instance : elle rejoindra votre groupe en l'ouvrant.
            </p>
            <Notice tone="warning" className="mb-4 max-w-prose">
              Ce lien <strong>ne crée pas de compte</strong>. Si la personne n'en a pas encore,
              demandez d'abord à un administrateur de lui en créer un.
            </Notice>

            {copyError && <Notice tone="warning" className="mb-2">{copyError}</Notice>}

            <div className="flex flex-wrap gap-2 items-end mb-4">
              <div>
                <label className="field-label">
                  Durée de validité
                </label>
                <select
                  value={expiresHours}
                  onChange={(e) => setExpiresHours(Number(e.target.value))}
                >
                  <option value={24}>24 heures</option>
                  <option value={168}>7 jours</option>
                  <option value={720}>30 jours</option>
                </select>
              </div>
              <button
                onClick={() => run(
                  () => api.createFamilyInvitation(expiresHours),
                  "Erreur lors de la création de l'invitation"
                )}
                disabled={busy}
                className="btn btn-primary"
              >
                <Icon name="plus" size={16} strokeWidth={2} />
                Créer un lien d'invitation
              </button>
            </div>

            {invitations.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Aucune invitation en attente</p>
            ) : (
              <div>
                {invitations.map((inv, index) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-3 flex-wrap py-2.5"
                    style={{
                      borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
                    }}
                  >
                    <span className="text-sm" style={{ color: 'var(--text-2)' }}>
                      Expire le {new Date(inv.expires_at).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => copyLink(inv.token)} className="btn btn-secondary btn-sm">
                        <Icon name={copiedToken === inv.token ? 'check' : 'copy'} size={14} strokeWidth={copiedToken === inv.token ? 2.4 : 1.75} />
                        {copiedToken === inv.token ? 'Copié' : 'Copier le lien'}
                      </button>
                      <button
                        onClick={() => run(
                          () => api.revokeFamilyInvitation(inv.id),
                          'Erreur lors de la révocation'
                        )}
                        disabled={busy}
                        className="btn-icon danger"
                        title="Révoquer ce lien"
                        aria-label="Révoquer ce lien"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
