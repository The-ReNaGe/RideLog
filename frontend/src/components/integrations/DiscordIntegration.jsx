import React, { useState } from 'react';
import { api } from '../../lib/api';

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
      alert('✅ Webhook Discord ajouté!');
    } catch (err) {
      alert('❌ Erreur : ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleTestWebhook = async (webhookId) => {
    setTesting(true);
    try {
      await api.testWebhook(webhookId);
      alert('✅ Message de test envoyé sur Discord!');
    } catch (err) {
      alert('❌ Erreur : ' + (err.response?.data?.detail || err.message));
    }
    setTesting(false);
  };

  const handleDeleteWebhook = async (webhookId) => {
    if (window.confirm('Supprimer ce webhook Discord?')) {
      try {
        await api.deleteWebhook(webhookId);
        fetchWebhooks();
        alert('✅ Webhook supprimé');
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
    <div className="card p-6 mb-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
            💬 Discord
          </h3>
          <p className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>
            Recevez les alertes de maintenance directement sur Discord
          </p>
        </div>
      </div>

      <div className="rounded p-3 text-sm mb-4" style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', color: 'var(--text-1)' }}>
        <p className="font-bold mb-2">📌 Configurer un webhook Discord :</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Allez dans <strong>Paramètres du serveur → Intégrations → Webhooks</strong></li>
          <li>Cliquez sur <strong>Créer un webhook</strong></li>
          <li>Choisissez le salon où envoyer les messages</li>
          <li>Copiez l'URL du webhook</li>
          <li>Collez-la ci-dessous</li>
        </ol>
      </div>

      {webhooks.length > 0 ? (
        <div className="mb-6">
          <h4 className="font-bold mb-3" style={{ color: 'var(--text-1)' }}>Webhooks configurés :</h4>
          <div className="space-y-2">
            {webhooks.map((webhook) => (
              <div key={webhook.id} className="flex items-center justify-between p-3 card gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm break-all" style={{ color: 'var(--text-2)' }}>{webhook.url}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleTestWebhook(webhook.id)}
                    disabled={testing}
                    className="px-3 py-1 rounded text-sm font-medium btn btn-secondary whitespace-nowrap"
                  >
                    {testing ? '...' : '🧪 Tester'}
                  </button>
                  <button
                    onClick={() => handleToggleWebhook(webhook.id, webhook.is_active)}
                    className={`px-3 py-1 rounded text-sm font-medium btn whitespace-nowrap ${
                      webhook.is_active ? 'btn-primary' : 'btn-secondary'
                    }`}
                  >
                    {webhook.is_active ? 'Actif' : 'Inactif'}
                  </button>
                  <button
                    onClick={() => handleDeleteWebhook(webhook.id)}
                    className="btn btn-danger text-sm whitespace-nowrap"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 mb-4" style={{ color: 'var(--text-2)' }}>
          <p>Aucun webhook Discord configuré</p>
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary w-full mb-4"
        >
          ✅ Ajouter un webhook Discord
        </button>
      )}

      {showForm && (
        <div className="p-4 card mb-4" style={{ background: 'var(--bg-base)' }}>
          <input
            type="text"
            placeholder="https://discord.com/api/webhooks/..."
            className="input w-full mb-3"
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
