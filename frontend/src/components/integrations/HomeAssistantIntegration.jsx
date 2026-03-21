import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';

export default function HomeAssistantIntegration() {
  const [activeTab, setActiveTab] = useState('setup');

  // État de l'intégration : null = chargement, true/false = actif/inactif
  const [haEnabled, setHaEnabled] = useState(null);
  const [haAccountExists, setHaAccountExists] = useState(false);

  const [isWorking, setIsWorking] = useState(false); // action en cours (enable/disable)
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  // Carte Lovelace
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [generatedYaml, setGeneratedYaml] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const yamlRef = useRef(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const userRes = await api.getCurrentUser();
      const user = userRes.data;
      setCurrentUser(user);

      if (user?.is_admin) {
        await loadHaStatus();
      }

      const vehiclesRes = await api.getVehicles();
      setVehicles(vehiclesRes.data || []);
    } catch (err) {
      console.error('Erreur chargement HA:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadHaStatus = async () => {
    try {
      const res = await api.getHaIntegrationStatus();
      setHaEnabled(res.data.enabled);
      setHaAccountExists(res.data.account_exists);
    } catch (err) {
      console.error('Erreur statut HA:', err);
      setHaEnabled(false);
      setHaAccountExists(false);
    }
  };

  const handleEnable = async () => {
    setIsWorking(true);
    setError('');
    setSuccess('');
    try {
      await api.enableHaIntegration();
      setHaEnabled(true);
      setSuccess('✅ Intégration activée. Home Assistant peut maintenant créer/renouveler le compte.');
      setTimeout(() => setSuccess(''), 6000);
    } catch (err) {
      setError('❌ ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsWorking(false);
    }
  };

  const handleDisable = async () => {
    if (!window.confirm(
      'Désactiver l\'intégration Home Assistant ?\n\n' +
      '• Le compte homeassistant sera supprimé\n' +
      '• Home Assistant ne pourra plus accéder à RideLog\n' +
      '• HA ne pourra pas recréer le compte automatiquement'
    )) return;

    setIsWorking(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.disableHaIntegration();
      setHaEnabled(false);
      setHaAccountExists(false);
      setSuccess('✅ Intégration désactivée. Home Assistant n\'a plus accès à RideLog.');
      setTimeout(() => setSuccess(''), 6000);
    } catch (err) {
      setError('❌ ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsWorking(false);
    }
  };

  // Détermine le statut affiché
  const statusLabel = haEnabled && haAccountExists
    ? { text: '✅ Intégration active', color: 'var(--success)', bg: 'var(--success-light)', border: 'var(--success)' }
    : haEnabled && !haAccountExists
    ? { text: '⚙️ Activée — compte non encore créé par HA', color: 'var(--warning)', bg: 'var(--warning-light)', border: 'var(--warning)' }
    : { text: '⛔ Intégration désactivée', color: 'var(--danger)', bg: 'var(--danger-light)', border: 'var(--danger)' };

  return (
    <div className="card p-6 mb-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>🏠 Home Assistant</h3>
        <p className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>
          Intégrez vos véhicules dans votre tableau de bord Home Assistant
        </p>
      </div>

      {/* Bannière de statut */}
      {isLoading ? (
        <div className="rounded p-4 mb-6" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <p style={{ color: 'var(--text-2)' }}>⏳ Chargement...</p>
        </div>
      ) : !currentUser?.is_admin ? (
        <div className="rounded p-4 mb-6" style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)' }}>
          <p className="font-bold" style={{ color: 'var(--warning)' }}>⛔ Accès administrateur requis</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>Seul un administrateur peut gérer l'intégration Home Assistant.</p>
        </div>
      ) : (
        <div className="rounded p-4 mb-6" style={{ background: statusLabel.bg, border: `1px solid ${statusLabel.border}` }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-bold" style={{ color: statusLabel.color }}>{statusLabel.text}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                {haEnabled && haAccountExists
                  ? 'Le compte homeassistant est actif. Home Assistant peut accéder à tous les véhicules.'
                  : haEnabled && !haAccountExists
                  ? 'L\'intégration est activée mais HA n\'a pas encore appelé ha-init. Redémarrez Home Assistant.'
                  : 'L\'intégration est désactivée. HA ne peut pas recréer le compte même avec la bonne clé.'}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {haEnabled ? (
                <button
                  onClick={handleDisable}
                  disabled={isWorking}
                  className="btn whitespace-nowrap disabled:opacity-50"
                  style={{ background: 'var(--danger)', color: 'white' }}
                >
                  {isWorking ? '⏳...' : '🔒 Désactiver'}
                </button>
              ) : (
                <button
                  onClick={handleEnable}
                  disabled={isWorking}
                  className="btn btn-primary whitespace-nowrap disabled:opacity-50"
                >
                  {isWorking ? '⏳...' : '🔓 Activer'}
                </button>
              )}
            </div>
          </div>
          {success && <p className="text-sm mt-3 font-medium" style={{ color: 'var(--success)' }}>{success}</p>}
          {error && <p className="text-sm mt-3 font-medium" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'setup', label: '📋 Configuration' },
          { key: 'auth',  label: '🔑 Authentification' },
          { key: 'cards', label: '🎨 Carte Lovelace' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 font-medium text-sm whitespace-nowrap border-b-2"
            style={{
              borderColor: activeTab === tab.key ? 'var(--accent)' : 'transparent',
              color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-2)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Setup Tab */}
      {activeTab === 'setup' && (
        <div className="space-y-4">

          {[
            {
              icon: haEnabled ? '✅' : '📋',
              color: haEnabled ? 'var(--success)' : 'var(--accent)',
              bg: haEnabled ? 'var(--success-light)' : 'var(--accent-light)',
              border: haEnabled ? 'var(--success)' : 'var(--accent)',
              title: 'Étape 1 : Activer l\'intégration',
              desc: haEnabled
                ? '✓ Intégration activée — Home Assistant peut créer le compte via ha-init'
                : 'Activez l\'intégration ci-dessus pour autoriser Home Assistant à se connecter',
            },
            {
              icon: '📦', color: 'var(--accent)', bg: 'var(--accent-light)', border: 'var(--accent)',
              title: 'Étape 2 : Installer le custom component',
              desc: null,
              custom: (
                <div className="mt-3 space-y-2 text-xs">
                  <p style={{ color: 'var(--text-1)' }}><strong>Source :</strong><br/>
                    <code style={{ background: 'var(--bg-base)', padding: '2px 8px', borderRadius: 4, display: 'block', wordBreak: 'break-all', marginTop: 4 }}>ha-integration/custom_components/ridelog/</code>
                  </p>
                  <p style={{ color: 'var(--text-1)' }}><strong>Destination :</strong><br/>
                    <code style={{ background: 'var(--bg-base)', padding: '2px 8px', borderRadius: 4, display: 'block', wordBreak: 'break-all', marginTop: 4 }}>~/.homeassistant/custom_components/ridelog/</code>
                  </p>
                </div>
              ),
            },
            {
              icon: '🔄', color: 'var(--warning)', bg: 'var(--warning-light)', border: 'var(--warning)',
              title: 'Étape 3 : Redémarrer Home Assistant',
              desc: 'Redémarrez HA pour qu\'il détecte le custom component et appelle ha-init automatiquement.',
            },
            {
              icon: '🎛️', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: '#8b5cf6',
              title: 'Étape 4 : Créer l\'intégration RideLog dans HA',
              desc: null,
              custom: (
                <div className="mt-3 space-y-1 text-xs" style={{ color: 'var(--text-2)' }}>
                  <p><strong>1.</strong> Paramètres → Appareils et services</p>
                  <p><strong>2.</strong> Créer une intégration → rechercher <strong>RideLog</strong></p>
                  <p><strong>3.</strong> URL API :</p>
                  <div className="p-2 rounded mt-1 ml-4" style={{ background: 'var(--bg-base)', wordBreak: 'break-all' }}>
                    <p className="font-mono" style={{ color: 'var(--text-1)' }}>http://192.168.1.x:8000</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>(Remplacez par votre IP/domaine)</p>
                  </div>
                </div>
              ),
            },
            {
              icon: '🎉', color: 'var(--success)', bg: 'var(--success-light)', border: 'var(--success)',
              title: 'Étape 5 : Vérification',
              desc: 'Les capteurs sensor.ridelog_* sont disponibles dans Paramètres → Appareils et services → RideLog',
            },
          ].map((step, i) => (
            <div key={i} className="rounded p-4" style={{ background: step.bg, border: `1px solid ${step.border}` }}>
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{step.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold" style={{ color: step.color }}>{step.title}</p>
                  {step.desc && <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>{step.desc}</p>}
                  {step.custom}
                </div>
              </div>
            </div>
          ))}

          <div className="rounded p-4" style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)' }}>
            <p className="font-bold" style={{ color: 'var(--warning)' }}>⚠️ Notes importantes</p>
            <ul className="list-disc list-inside space-y-1 text-xs mt-2" style={{ color: 'var(--text-2)' }}>
              <li>L'URL API doit être accessible depuis le réseau de Home Assistant</li>
              <li>Pour un accès distant, utilisez HTTPS avec un certificat SSL valide</li>
              <li>Ne promouvez jamais le compte homeassistant en administrateur</li>
              <li>Les tokens valent 30 jours — Home Assistant les renouvelle automatiquement</li>
              <li>Désactiver l'intégration révoque immédiatement l'accès de HA</li>
            </ul>
          </div>
        </div>
      )}

      {/* Auth Tab */}
      {activeTab === 'auth' && (
        <div className="space-y-6">
          <div className="rounded p-4 text-sm" style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', color: 'var(--text-1)' }}>
            <p className="font-bold mb-3">🔑 Flux d'authentification</p>
            <ol className="list-decimal list-inside space-y-2 text-xs">
              <li>L'admin active l'intégration depuis cette page</li>
              <li>HA installe le custom component et redémarre</li>
              <li>HA appelle <code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>POST /auth/ha-init?init_key=…</code></li>
              <li>RideLog crée le compte et retourne un token Bearer 30 jours</li>
              <li>Le compte homeassistant accède à TOUS les véhicules</li>
              <li>HA renouvelle le token via <code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>POST /auth/refresh</code></li>
              <li>L'admin peut désactiver à tout moment → HA perd l'accès immédiatement</li>
            </ol>
          </div>

          <div className="rounded p-4 text-sm" style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', color: 'var(--text-1)' }}>
            <p className="font-bold mb-3">⏰ Renouvellement automatique (optionnel)</p>
            <pre className="p-3 rounded text-xs overflow-auto font-mono" style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}>
{`alias: "Renouveler token RideLog"
trigger:
  platform: time
  at: "03:00:00"
condition:
  - condition: time
    weekday: [sun]
action:
  - service: rest_command.ridelog_refresh

rest_command:
  ridelog_refresh:
    url: "http://localhost:8000/api/auth/refresh"
    method: post
    headers:
      Authorization: "Bearer VOTRE_TOKEN_ACTUEL"`}
            </pre>
          </div>

          <div className="rounded p-4 text-sm" style={{ background: 'var(--success-light)', border: '1px solid var(--success)', color: 'var(--text-1)' }}>
            <p className="font-bold mb-2">🔐 Sécurité</p>
            <ul className="text-xs space-y-1">
              <li>✓ Mot de passe aléatoire non utilisable (compte de service)</li>
              <li>✓ Token Bearer 30 jours avec renouvellement automatique</li>
              <li>✓ Comparaison timing-safe de la HA_INIT_KEY</li>
              <li>✓ Désactivation immédiate depuis l'UI sans redémarrage</li>
              <li>✓ Impossible de promouvoir le compte homeassistant en admin</li>
            </ul>
          </div>

          <div className="rounded p-4 text-sm" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid #8b5cf6', color: 'var(--text-1)' }}>
            <p className="font-bold mb-2">📝 Endpoints utilisés par HA</p>
            <ul className="text-xs space-y-1">
              {[
                ['POST /auth/ha-init', 'Créer le compte (bloqué si désactivé)'],
                ['POST /auth/refresh', 'Renouveler le token'],
                ['GET /vehicles', 'Liste tous les véhicules'],
                ['GET /vehicles/{id}/upcoming', 'Maintenances à venir'],
              ].map(([ep, desc]) => (
                <li key={ep}>
                  <code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>{ep}</code>
                  {' — '}{desc}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Cards Tab */}
      {activeTab === 'cards' && (
        <div className="space-y-6">
          <div className="rounded p-4 text-sm" style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', color: 'var(--text-1)' }}>
            <p className="font-bold mb-2">🎨 Générateur de carte Lovelace</p>
            <p className="text-xs" style={{ color: 'var(--text-2)' }}>
              Sélectionnez un véhicule pour générer le YAML Mushroom. Copiez-le dans votre tableau de bord HA.
            </p>
          </div>

          <div className="rounded p-4" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid #8b5cf6' }}>
            <p className="font-bold mb-2" style={{ color: '#8b5cf6' }}>📦 Dépendances HACS requises</p>
            <div className="space-y-2">
              {[
                ['mushroom', 'Cartes stylisées (mushroom-template-card, etc.)'],
                ['card-mod', 'CSS conditionnel'],
              ].map(([pkg, desc]) => (
                <div key={pkg} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                  <code style={{ background: 'var(--bg-base)', padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>{pkg}</code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>Véhicule</label>
              <select
                value={selectedVehicleId}
                onChange={e => { setSelectedVehicleId(e.target.value); setGeneratedYaml(''); setCopySuccess(false); }}
                className="w-full border rounded px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-1)', borderColor: 'var(--border)' }}
              >
                <option value="">— Choisir un véhicule —</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.vehicle_type === 'motorcycle' ? '🏍️' : '🚗'} {v.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={async () => {
                if (!selectedVehicleId) return;
                setIsGenerating(true);
                setCopySuccess(false);
                try {
                  const res = await api.getHaDashboardCard(selectedVehicleId);
                  setGeneratedYaml(res.data.yaml);
                } catch { setGeneratedYaml('# Erreur lors de la génération'); }
                finally { setIsGenerating(false); }
              }}
              disabled={!selectedVehicleId || isGenerating}
              className="btn btn-primary whitespace-nowrap disabled:opacity-50"
            >
              {isGenerating ? '⏳...' : '⚡ Générer'}
            </button>
          </div>

          {generatedYaml && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-bold" style={{ color: 'var(--text-2)' }}>YAML généré</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(generatedYaml); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 3000); }}
                  className="text-xs px-3 py-1 rounded font-medium"
                  style={copySuccess
                    ? { background: 'var(--success-light)', color: 'var(--success)', border: '1px solid var(--success)' }
                    : { background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                >
                  {copySuccess ? '✅ Copié !' : '📋 Copier'}
                </button>
              </div>
              <pre
                ref={yamlRef}
                className="p-4 rounded overflow-auto text-xs border cursor-pointer"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-1)', maxHeight: '400px' }}
                onClick={() => { navigator.clipboard.writeText(generatedYaml); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 3000); }}
              >
                {generatedYaml}
              </pre>
              <div className="mt-3 rounded p-3 text-xs" style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', color: 'var(--text-1)' }}>
                <p className="font-bold">💡 Comment utiliser :</p>
                <ol className="list-decimal list-inside space-y-1 mt-1">
                  <li>Copiez le YAML</li>
                  <li>Dans HA : Tableau de bord → ✏️ → + Ajouter une carte → Manuel</li>
                  <li>Collez et cliquez Enregistrer</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}