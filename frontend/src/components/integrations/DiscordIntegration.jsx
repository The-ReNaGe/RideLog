import React, { useState } from 'react';
import { api } from '../../lib/api';
import Icon from '../Icon';
import Notice from '../Notice';

export default function DiscordIntegration() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [testing, setTesting] = useState(false);

  React.useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const response = await api.getWebhooks();
      setWebhooks(response.data.filter(w => w.webhook_type === 'discord'));
    } catch (err) {
      console.error('Failed to load Discord webhooks', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWebhook = async () => {
    if (!webhookUrl.trim()) {
      alert('Veuillez entrer une URL valide');
      return;
    }
    try {
      await api.createWebhook({ webhook_type: 'discord', url: webhookUrl });
      setWebhookUrl('');
      setShowForm(false);
      fetchWebhooks();
      alert('Webhook Discord ajouté.');
    } catch (err) {
      alert('Erreur : ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleTestWebhook = async (webhookId) => {
    setTesting(true);
    try {
      await api.testWebhook(webhookId);
      alert('Message de test envoyé sur Discord.');
    } catch (err) {
      alert('Erreur : ' + (err.response?.data?.detail || err.message));
    }
    setTesting(false);
  };

  const handleDeleteWebhook = async (webhookId) => {
    if (window.confirm('Supprimer ce webhook Discord?')) {
      try {
        await api.deleteWebhook(webhookId);
        fetchWebhooks();
        alert('Webhook supprimé.');
      } catch (err) {
        alert('Impossible de supprimer le webhook');
      }
    }
  };

  const handleToggleWebhook = async (webhookId, isActive) => {
    try {
      await api.toggleWebhook(webhookId, { is_active: !isActive });
      fetchWebhooks();
    } catch (err) {
      alert('Impossible de mettre à jour le webhook');
    }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="icon-box"><Icon name="message" size={18} /></div>
        <div>
          <h3 className="section-title">Discord</h3>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
            Recevez les alertes d'entretien directement sur votre serveur.
          </p>
        </div>
      </div>

      <Notice tone="info" title="Configurer un webhook Discord" className="mb-4">
        <ol className="list-decimal list-inside space-y-1">
          <li>Allez dans <strong>Paramètres du serveur → Intégrations → Webhooks</strong></li>
          <li>Cliquez sur <strong>Créer un webhook</strong></li>
          <li>Choisissez le salon où envoyer les messages</li>
          <li>Copiez l'URL du webhook</li>
          <li>Collez-la ci-dessous</li>
        </ol>
      </Notice>

      {webhooks.length > 0 ? (
        <div className="mb-6">
          <h4 className="card-label">Webhooks configurés</h4>
          <div className="space-y-2">
            {webhooks.map((webhook) => (
              <div key={webhook.id} className="inset flex items-center justify-between gap-2" style={{ padding: 12 }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm break-all" style={{ color: 'var(--text-2)' }}>{webhook.url}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleTestWebhook(webhook.id)}
                    disabled={testing}
                    className="btn btn-secondary btn-sm"
                  >
                    <Icon name="send" size={14} />
                    {testing ? 'Envoi…' : 'Tester'}
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
                    title="Supprimer ce webhook"
                    aria-label="Supprimer ce webhook"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center mb-4" style={{ padding: '24px 8px' }}>
          <div className="icon-box lg neutral mx-auto" style={{ marginBottom: 10 }}>
            <Icon name="webhook" size={20} />
          </div>
          <p style={{ color: 'var(--text-2)' }}>Aucun webhook Discord configuré.</p>
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary w-full mb-4"
        >
          <Icon name="plus" size={16} strokeWidth={2} />
          Ajouter un webhook Discord
        </button>
      )}

      {showForm && (
        <div className="inset mb-4" style={{ padding: 16 }}>
          <input
            type="text"
            placeholder="https://discord.com/api/webhooks/…"
            className="w-full mb-3"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddWebhook}
              className="btn btn-primary flex-1"
            >
              Ajouter
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setWebhookUrl('');
              }}
              className="btn btn-secondary flex-1"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
