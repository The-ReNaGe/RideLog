import React, { useState } from 'react';
import { api } from '../../lib/api';
import Icon from '../Icon';
import Notice from '../Notice';

/**
 * Canaux de notification — où partent les rappels d'entretien.
 *
 * Un seul écran pour Discord et ntfy plutôt qu'un onglet par service : les
 * deux sont la même chose pour l'utilisateur (une URL, un bouton Tester, un
 * interrupteur), et un troisième service n'ajoutera qu'une entrée à la table
 * ci-dessous, pas un onglet.
 *
 * Le jeton d'accès ntfy n'est jamais relu : l'API ne renvoie que
 * `has_auth_token`. Pour le changer, on supprime le canal et on le recrée.
 */
const SERVICES = {
  discord: {
    label: 'Discord',
    icon: 'message',
    placeholder: 'https://discord.com/api/webhooks/…',
    hasToken: false,
    help: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Allez dans <strong>Paramètres du serveur → Intégrations → Webhooks</strong></li>
        <li>Cliquez sur <strong>Créer un webhook</strong> et choisissez le salon</li>
        <li>Copiez l'URL du webhook et collez-la ci-dessous</li>
      </ol>
    ),
  },
  ntfy: {
    label: 'ntfy',
    icon: 'bell',
    placeholder: 'https://ntfy.sh/mon-sujet',
    hasToken: true,
    help: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Installez l'application <strong>ntfy</strong> sur votre téléphone et abonnez-vous à un sujet</li>
        <li>Collez l'adresse du sujet ci-dessous — sur <strong>ntfy.sh</strong> ou sur votre propre serveur</li>
        <li>Si le sujet est protégé, ajoutez un jeton d'accès (<code>tk_…</code>)</li>
      </ol>
    ),
  },
};

const serviceOf = (type) => SERVICES[type] || { label: type, icon: 'webhook' };

export default function NotificationChannels() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [serviceType, setServiceType] = useState('discord');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [testing, setTesting] = useState(null);

  React.useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const response = await api.getWebhooks();
      setWebhooks(response.data);
    } catch (err) {
      console.error('Failed to load notification channels', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setWebhookUrl('');
    setAuthToken('');
  };

  const handleAddWebhook = async () => {
    if (!webhookUrl.trim()) {
      alert('Veuillez entrer une URL valide');
      return;
    }
    try {
      const payload = { webhook_type: serviceType, url: webhookUrl.trim() };
      if (SERVICES[serviceType]?.hasToken && authToken.trim()) {
        payload.auth_token = authToken.trim();
      }
      await api.createWebhook(payload);
      resetForm();
      fetchWebhooks();
    } catch (err) {
      alert('Erreur : ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleTestWebhook = async (webhookId) => {
    setTesting(webhookId);
    try {
      await api.testWebhook(webhookId);
      alert('Message de test envoyé.');
    } catch (err) {
      alert('Erreur : ' + (err.response?.data?.detail || err.message));
    }
    setTesting(null);
  };

  const handleDeleteWebhook = async (webhookId) => {
    if (window.confirm('Supprimer ce canal de notification ?')) {
      try {
        await api.deleteWebhook(webhookId);
        fetchWebhooks();
      } catch (err) {
        alert('Impossible de supprimer le canal');
      }
    }
  };

  const handleToggleWebhook = async (webhookId, isActive) => {
    try {
      await api.toggleWebhook(webhookId, { is_active: !isActive });
      fetchWebhooks();
    } catch (err) {
      alert('Impossible de mettre à jour le canal');
    }
  };

  const service = SERVICES[serviceType];

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="icon-box"><Icon name="send" size={18} /></div>
        <div>
          <h3 className="section-title">Notifications</h3>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
            Recevez les rappels d'entretien sur Discord ou sur votre téléphone avec ntfy.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8"><div className="spinner mx-auto"></div></div>
      ) : webhooks.length > 0 ? (
        <div className="mb-6">
          <h4 className="card-label">Canaux configurés</h4>
          <div className="space-y-2">
            {webhooks.map((webhook) => {
              const svc = serviceOf(webhook.webhook_type);
              return (
                <div key={webhook.id} className="inset flex items-center justify-between gap-2 flex-wrap" style={{ padding: 12 }}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="icon-box sm neutral"><Icon name={svc.icon} size={15} /></div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                        {svc.label}
                        {webhook.has_auth_token && (
                          <span className="badge badge-neutral" style={{ marginLeft: 8 }}>
                            <Icon name="lock" size={11} strokeWidth={2} />
                            Jeton
                          </span>
                        )}
                      </div>
                      <div className="text-xs break-all" style={{ color: 'var(--text-3)' }}>{webhook.url}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 flex-wrap">
                    <button
                      onClick={() => handleTestWebhook(webhook.id)}
                      disabled={testing !== null}
                      className="btn btn-secondary btn-sm"
                    >
                      <Icon name="send" size={14} />
                      {testing === webhook.id ? 'Envoi…' : 'Tester'}
                    </button>
                    <button
                      onClick={() => handleToggleWebhook(webhook.id, webhook.is_active)}
                      className={`btn btn-sm ${webhook.is_active ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {webhook.is_active ? 'Actif' : 'Inactif'}
                    </button>
                    <button
                      onClick={() => handleDeleteWebhook(webhook.id)}
                      className="btn-icon danger"
                      title="Supprimer ce canal"
                      aria-label="Supprimer ce canal"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center mb-4" style={{ padding: '24px 8px' }}>
          <div className="icon-box lg neutral mx-auto" style={{ marginBottom: 10 }}>
            <Icon name="webhook" size={20} />
          </div>
          <p style={{ color: 'var(--text-2)' }}>Aucun canal de notification configuré.</p>
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary w-full mb-4"
        >
          <Icon name="plus" size={16} strokeWidth={2} />
          Ajouter un canal
        </button>
      )}

      {showForm && (
        <div className="inset mb-4" style={{ padding: 16 }}>
          {/* Contrôle segmenté plutôt qu'un <select> : deux choix, autant les
              montrer tous les deux (§23.11). */}
          <div className="segmented mb-4" role="tablist" aria-label="Service">
            {Object.entries(SERVICES).map(([key, svc]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={serviceType === key}
                className={`segment ${serviceType === key ? 'active' : ''}`}
                onClick={() => { setServiceType(key); setWebhookUrl(''); setAuthToken(''); }}
              >
                <Icon name={svc.icon} size={14} />
                {svc.label}
              </button>
            ))}
          </div>

          <Notice tone="info" title={`Configurer ${service.label}`} className="mb-4">
            {service.help}
          </Notice>

          <label className="field-label">Adresse</label>
          <input
            type="text"
            placeholder={service.placeholder}
            className="w-full mb-3"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          {service.hasToken && (
            <>
              <label className="field-label">Jeton d'accès (facultatif)</label>
              <input
                type="password"
                placeholder="tk_…"
                autoComplete="off"
                className="w-full mb-1"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
              />
              <p className="field-hint mb-3">
                Nécessaire seulement si votre serveur ntfy protège ce sujet. Il n'est jamais réaffiché.
              </p>
            </>
          )}
          <div className="flex gap-2">
            <button onClick={handleAddWebhook} className="btn btn-primary flex-1">
              Ajouter
            </button>
            <button onClick={resetForm} className="btn btn-secondary flex-1">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
