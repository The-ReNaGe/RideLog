import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/clipboard';

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
      {error && (
        <div className="card p-3 text-sm" style={{ background: 'var(--danger)', color: '#fff' }}>
          {error}
        </div>
      )}

      {!family ? (
        <>
          <div className="card p-4">
            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
              👨‍👩‍👧 Groupe famille
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
              Un groupe famille permet aux membres d'un même foyer de <strong>consulter</strong> les
              véhicules des autres : entretiens, échéances et pleins. Chacun reste seul à pouvoir
              modifier les siens — personne n'écrit sur le véhicule d'un autre.
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>
                  Nom du groupe
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Foyer Dupont"
                  className="input-field"
                  maxLength={100}
                />
              </div>
              <button
                onClick={() => run(() => api.createFamily(newName.trim()), 'Erreur lors de la création')}
                disabled={busy || !newName.trim()}
                className="btn btn-primary text-sm"
              >
                ➕ Créer le groupe
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
              🔗 Rejoindre un groupe existant
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
                  className="input-field w-full"
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
                className="btn btn-primary text-sm"
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
                <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>
                  👨‍👩‍👧 {family.name}
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
                    className="btn btn-secondary text-xs"
                  >
                    ✏️ Renommer
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
                  className="btn btn-danger text-xs"
                >
                  🚪 Quitter
                </button>
              </div>
            </div>

            {renaming && (
              <div className="flex flex-wrap gap-2 items-end mt-3">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="input-field"
                  maxLength={100}
                />
                <button
                  onClick={() => run(
                    async () => { await api.renameFamily(renameValue.trim()); setRenaming(false); },
                    'Erreur lors du renommage'
                  )}
                  disabled={busy || !renameValue.trim()}
                  className="btn btn-primary text-xs"
                >
                  Enregistrer
                </button>
                <button onClick={() => setRenaming(false)} className="btn btn-secondary text-xs">
                  Annuler
                </button>
              </div>
            )}

            <p className="text-xs mt-3 p-2 rounded" style={{ background: 'var(--accent-light)', color: 'var(--text-2)' }}>
              ℹ️ Les membres <strong>consultent</strong> les véhicules du groupe. Seul le propriétaire
              d'un véhicule peut y enregistrer un entretien ou un plein. Un véhicule marqué
              <strong> 🔒 Privé</strong> dans sa fiche reste invisible aux autres.
            </p>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold mb-3" style={{ color: 'var(--text-1)' }}>Membres</h3>
            <div className="space-y-2">
              {family.members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between gap-3 py-2"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <div>
                    <span style={{ color: 'var(--text-1)' }}>{m.display_name}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>@{m.username}</span>
                    {m.role === 'owner' && (
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs font-semibold ml-2"
                        style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                      >
                        créateur
                      </span>
                    )}
                    {m.user_id === currentUser?.id && (
                      <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>(vous)</span>
                    )}
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
                      className="btn btn-danger text-xs"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold mb-3" style={{ color: 'var(--text-1)' }}>
              📨 Inviter quelqu'un
            </h3>
            <p className="text-sm mb-2" style={{ color: 'var(--text-2)' }}>
              Transmettez ce lien à une personne qui a <strong>déjà un compte</strong> sur cette
              instance : elle rejoindra votre groupe en l'ouvrant.
            </p>
            <p className="text-xs mb-3 p-2 rounded" style={{ background: 'var(--warning-light)', color: 'var(--text-1)' }}>
              ℹ️ Ce lien ne crée pas de compte. Si la personne n'en a pas encore, demandez à un
              administrateur de lui en créer un d'abord — ouvrir l'instance à quelqu'un de nouveau
              reste une décision d'administrateur.
            </p>

            {copyError && (
              <div className="text-xs mb-2 p-2 rounded" style={{ background: 'var(--warning-light)', color: 'var(--text-1)' }}>
                {copyError}
              </div>
            )}

            <div className="flex flex-wrap gap-2 items-end mb-4">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>
                  Durée de validité
                </label>
                <select
                  value={expiresHours}
                  onChange={(e) => setExpiresHours(Number(e.target.value))}
                  className="input-field"
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
                className="btn btn-primary text-sm"
              >
                ➕ Créer un lien d'invitation
              </button>
            </div>

            {invitations.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Aucune invitation en attente</p>
            ) : (
              <div className="space-y-2">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-3 flex-wrap py-2"
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      Expire le {new Date(inv.expires_at).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => copyLink(inv.token)} className="btn btn-secondary text-xs">
                        {copiedToken === inv.token ? '✅ Copié !' : '📋 Copier le lien'}
                      </button>
                      <button
                        onClick={() => run(
                          () => api.revokeFamilyInvitation(inv.id),
                          'Erreur lors de la révocation'
                        )}
                        disabled={busy}
                        className="btn btn-danger text-xs"
                      >
                        🗑️
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
