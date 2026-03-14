import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DiscordIntegration from '../components/integrations/DiscordIntegration';
import HomeAssistantIntegration from '../components/integrations/HomeAssistantIntegration';
import APIDocumentation from '../components/APIDocumentation';

export default function Settings({ currentUser }) {
  const [activeTab, setActiveTab] = useState('discord');

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-1)' }}>⚙️ Paramètres</h2>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setActiveTab('discord')}
          className="px-4 py-3 font-medium transition-colors border-b-2 whitespace-nowrap"
          style={{
            borderColor: activeTab === 'discord' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'discord' ? 'var(--accent)' : 'var(--text-2)',
          }}
        >
          💬 Discord
        </button>
        <button
          onClick={() => setActiveTab('homeassistant')}
          className="px-4 py-3 font-medium transition-colors border-b-2 whitespace-nowrap"
          style={{
            borderColor: activeTab === 'homeassistant' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'homeassistant' ? 'var(--accent)' : 'var(--text-2)',
          }}
        >
          🏠 Home Assistant
        </button>
        <button
          onClick={() => setActiveTab('reminders')}
          className="px-4 py-3 font-medium transition-colors border-b-2 whitespace-nowrap"
          style={{
            borderColor: activeTab === 'reminders' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'reminders' ? 'var(--accent)' : 'var(--text-2)',
          }}
        >
          🔔 Rappels
        </button>
        {currentUser?.is_admin && (
          <button
            onClick={() => setActiveTab('inscription')}
            className="px-4 py-3 font-medium transition-colors border-b-2 whitespace-nowrap"
            style={{
              borderColor: activeTab === 'inscription' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'inscription' ? 'var(--accent)' : 'var(--text-2)',
            }}
          >
            📨 Inscription
          </button>
        )}
        <button
          onClick={() => setActiveTab('api')}
          className="px-4 py-3 font-medium transition-colors border-b-2 whitespace-nowrap"
          style={{
            borderColor: activeTab === 'api' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'api' ? 'var(--accent)' : 'var(--text-2)',
          }}
        >
          🔌 API
        </button>
      </div>

      {/* DISCORD TAB */}
      {activeTab === 'discord' && <DiscordIntegration />}

      {/* HOME ASSISTANT TAB */}
      {activeTab === 'homeassistant' && <HomeAssistantIntegration />}

      {/* REMINDERS TAB */}
      {activeTab === 'reminders' && <ReminderSettings />}

      {/* INSCRIPTION TAB */}
      {activeTab === 'inscription' && currentUser?.is_admin && (
        <InscriptionSettings />
      )}

      {/* API TAB */}
      {activeTab === 'api' && <APIDocumentation />}
    </div>
  );
}

function ReminderSettings() {
  const [checking, setChecking] = useState(false);
  const [hasWebhooks, setHasWebhooks] = useState(false);
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const response = await api.getWebhooks();
      setWebhooks(response.data);
      setHasWebhooks(response.data.length > 0);
    } catch (err) {
      console.error('Failed to load webhooks', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="card p-4 text-sm mb-6" style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', color: 'var(--text-1)' }}>
        <p className="font-bold mb-2">🔔 Gestion des rappels d'entretien</p>
        <p className="mb-2" style={{ color: 'var(--text-2)' }}>
          Les rappels sont envoyés automatiquement via vos webhooks configurés selon 3 niveaux :
        </p>
        <ul className="list-disc list-inside space-y-1 text-xs" style={{ color: 'var(--text-2)' }}>
          <li>🟡 <strong>1er rappel – À prévoir :</strong> 3 mois ou 1 500 km avant l'échéance</li>
          <li>🔴 <strong>2e rappel – Urgent :</strong> 1 mois ou 500 km avant l'échéance</li>
          <li>⛔ <strong>3e rappel – En retard :</strong> le jour de l'échéance ou si dépassé</li>
        </ul>
      </div>

      {loading ? (
        <div className="text-center py-8"><div className="spinner mx-auto"></div></div>
      ) : !hasWebhooks ? (
        <div className="card p-6 mb-6 text-center">
          <p style={{ color: 'var(--text-2)' }} className="mb-4">
            Aucun webhook configuré. Configurez Discord d'abord !
          </p>
        </div>
      ) : (
        <div className="card p-6 mb-6">
          <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-1)' }}>📌 Webhooks actifs</h3>
          <div className="space-y-2 mb-6">
            {webhooks.map((w) => (
              <div key={w.id} className="flex items-center gap-2 p-3 rounded" style={{ background: 'var(--bg-base)' }}>
                <span className={`inline-block w-2 h-2 rounded-full ${w.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                <span className="text-sm" style={{ color: 'var(--text-2)' }}>
                  {w.webhook_type.toUpperCase()} {w.is_active ? '(actif)' : '(inactif)'}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={async () => {
              setChecking(true);
              try {
                const res = await api.checkReminders();
                alert(`✅ Vérification terminée. ${res.data.cleared_logs} rappel(s) réinitialisé(s).`);
              } catch (err) {
                alert('❌ Erreur : ' + (err.response?.data?.detail || err.message));
              }
              setChecking(false);
            }}
            disabled={checking}
            className="btn btn-primary w-full"
          >
            {checking ? '⏳ Vérification...' : '🔄 Re-vérifier les rappels maintenant'}
          </button>
          <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
            Relance immédiatement la vérification de tous les entretiens et envoie les rappels nécessaires.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INSCRIPTION SETTINGS (admin only)
// ═══════════════════════════════════════════════════════════════════════════

const MODE_OPTIONS = [
  {
    value: 'invite',
    label: 'Sur invitation',
    icon: '📨',
    description: 'Les nouveaux utilisateurs doivent recevoir un lien d\'invitation d\'un administrateur pour s\'inscrire.',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.1)',
  },
  {
    value: 'closed',
    label: 'Privé',
    icon: '🔒',
    description: 'Les inscriptions sont fermées. Seul un administrateur peut créer des comptes.',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.1)',
  },
  {
    value: 'open',
    label: 'Ouvert',
    icon: '🌐',
    description: 'Tout le monde peut créer un compte librement sans invitation.',
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.1)',
  },
];

function InscriptionSettings() {
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Invitations
  const [invitations, setInvitations] = useState([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invCreating, setInvCreating] = useState(false);
  const [expiresHours, setExpiresHours] = useState(48);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    loadMode();
    loadInvitations();
  }, []);

  const loadMode = async () => {
    try {
      const res = await api.getRegistrationMode();
      setMode(res.data.mode);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleSetMode = async (newMode) => {
    setSaving(true);
    setError(null);
    try {
      await api.setRegistrationMode(newMode);
      setMode(newMode);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors du changement de mode');
    } finally {
      setSaving(false);
    }
  };

  const loadInvitations = async () => {
    setInvLoading(true);
    try {
      const res = await api.getInvitations();
      setInvitations(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setInvLoading(false);
    }
  };

  const handleCreateInvitation = async () => {
    setInvCreating(true);
    setError(null);
    try {
      await api.createInvitation(expiresHours);
      loadInvitations();
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de la création de l'invitation");
    } finally {
      setInvCreating(false);
    }
  };

  const handleDeleteInvitation = async (id) => {
    try {
      await api.deleteInvitation(id);
      setInvitations(invitations.filter(inv => inv.id !== id));
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression');
    }
  };

  const copyInviteLink = (token) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="spinner mx-auto mb-2"></div>
        <p style={{ color: 'var(--text-2)' }}>Chargement...</p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div
          className="mb-4 p-3 rounded text-sm"
          style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', color: 'var(--danger)' }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Mode selector */}
      <div className="card p-6 mb-6">
        <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
          Codes d'invitation
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
          Contrôlez comment les nouvelles personnes s'inscrivent à votre instance RideLog.
        </p>

        <div className="space-y-3">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSetMode(opt.value)}
              disabled={saving}
              className="w-full text-left p-4 rounded-lg border-2 transition-all"
              style={{
                borderColor: mode === opt.value ? opt.color : 'var(--border)',
                background: mode === opt.value ? opt.bg : 'transparent',
                opacity: saving ? 0.6 : 1,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: mode === opt.value ? opt.color : 'var(--text-3)' }}
                >
                  {mode === opt.value && (
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ background: opt.color }}
                    />
                  )}
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                    {opt.icon} {opt.label}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {opt.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Invitations section (visible only in invite mode) */}
      {mode === 'invite' && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
            📨 Liens d'invitation
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
            Créez des liens à usage unique pour permettre à de nouvelles personnes de s'inscrire.
          </p>

          <div className="flex items-end gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                Validité
              </label>
              <select
                value={expiresHours}
                onChange={(e) => setExpiresHours(Number(e.target.value))}
                className="input text-sm"
                style={{ width: '160px' }}
              >
                <option value={1}>1 heure</option>
                <option value={6}>6 heures</option>
                <option value={24}>24 heures</option>
                <option value={48}>48 heures</option>
                <option value={168}>7 jours</option>
                <option value={720}>30 jours</option>
              </select>
            </div>
            <button
              onClick={handleCreateInvitation}
              disabled={invCreating}
              className="btn btn-primary text-sm"
            >
              {invCreating ? '...' : '➕ Créer une invitation'}
            </button>
          </div>

          {invLoading ? (
            <div className="text-center py-4">
              <div className="spinner mx-auto mb-2"></div>
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Aucune invitation créée</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left py-2 px-3" style={{ color: 'var(--text-2)' }}>Statut</th>
                    <th className="text-left py-2 px-3" style={{ color: 'var(--text-2)' }}>Créée par</th>
                    <th className="text-left py-2 px-3" style={{ color: 'var(--text-2)' }}>Créée le</th>
                    <th className="text-left py-2 px-3" style={{ color: 'var(--text-2)' }}>Expire le</th>
                    <th className="text-left py-2 px-3" style={{ color: 'var(--text-2)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => {
                    const isUsed = inv.is_used;
                    const isExpired = inv.is_expired;
                    const isActive = !isUsed && !isExpired;
                    return (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)', opacity: isActive ? 1 : 0.6 }}>
                        <td className="py-2 px-3">
                          {isUsed ? (
                            <span className="inline-block px-2 py-1 rounded text-xs font-semibold" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                              ✅ Utilisée
                            </span>
                          ) : isExpired ? (
                            <span className="inline-block px-2 py-1 rounded text-xs font-semibold" style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>
                              ⏰ Expirée
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-1 rounded text-xs font-semibold" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
                              🟢 Active
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3" style={{ color: 'var(--text-2)' }}>@{inv.creator_username}</td>
                        <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-3)' }}>
                          {new Date(inv.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-3)' }}>
                          {new Date(inv.expires_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex gap-2">
                            {isActive && (
                              <button
                                onClick={() => copyInviteLink(inv.token)}
                                className="btn btn-secondary text-xs"
                              >
                                {copiedId === inv.token ? '✅ Copié !' : '📋 Copier le lien'}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteInvitation(inv.id)}
                              className="btn btn-danger text-xs"
                            >
                              🗑️
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
      )}
    </div>
  );
}
