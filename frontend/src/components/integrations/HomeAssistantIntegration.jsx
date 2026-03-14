import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';

export default function HomeAssistantIntegration() {
  const [activeTab, setActiveTab] = useState('setup');
  const [haAccountStatus, setHaAccountStatus] = useState('unknown');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  // Template generator state
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [generatedYaml, setGeneratedYaml] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const yamlRef = useRef(null);

  // Récupère l'utilisateur courant et vérifie si le compte homeassistant existe
  useEffect(() => {
    fetchCurrentUser();
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      const response = await api.getVehicles();
      setVehicles(response.data || []);
    } catch (err) {
      console.error('Erreur chargement véhicules:', err);
    }
  };

  const fetchCurrentUser = async () => {
    setIsLoading(true);
    try {
      const response = await api.getCurrentUser();
      const user = response.data;
      console.log('Utilisateur courant:', user);
      setCurrentUser(user);
      if (user && user.is_admin) {
        checkHaAccount();
      } else if (user) {
        // Non-admin, on reste en unknown
        setHaAccountStatus('notadmin');
      }
    } catch (err) {
      console.error('Erreur lors de la récupération de l\'utilisateur courant:', err);
      setHaAccountStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const checkHaAccount = async () => {
    try {
      const response = await api.getAllUsers();
      const users = response.data;
      const haUser = users.find(u => u.username === 'homeassistant');
      if (haUser) {
        setHaAccountStatus('exists');
      } else {
        setHaAccountStatus('notfound');
      }
    } catch (err) {
      console.error('Erreur lors de la vérification du compte HA:', err);
      setHaAccountStatus('unknown');
    }
  };

  const createHaAccount = async () => {
    setIsCreating(true);
    setError('');
    setSuccess('');
    
    try {
      const response = await api.initHomeAssistant();
      // La réponse contient le token, mais on met juste à jour le statut
      setHaAccountStatus('exists');
      setSuccess('✅ Compte Home Assistant créé avec succès! Le token a été généré.');
      // Réinitialiser le message après 5 secondes
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError('❌ Erreur lors de la création du compte: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="card p-6 mb-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
            🏠 Home Assistant
          </h3>
          <p className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>
            Intégrez vos véhicules dans votre tableau de bord Home Assistant
          </p>
        </div>
      </div>

      {/* Statut et Setup du compte HA */}
      {isLoading ? (
        <div className="rounded p-4 mb-6" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
          <p className="font-bold" style={{ color: 'var(--text-2)' }}>
            ⏳ Chargement...
          </p>
        </div>
      ) : currentUser?.is_admin ? (
        <div className="rounded p-4 mb-6" style={{
          background: haAccountStatus === 'exists' ? 'var(--success-light)' : 'var(--accent-light)',
          border: `1px solid ${haAccountStatus === 'exists' ? 'var(--success)' : 'var(--accent)'}`
        }}>
          <div className="flex justify-between items-center">
            <div>
              <p className="font-bold" style={{ color: haAccountStatus === 'exists' ? 'var(--success)' : 'var(--accent)' }}>
                {haAccountStatus === 'exists' 
                  ? '✅ Compte Home Assistant activé' 
                  : '⚙️ Configuration requise'}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                {haAccountStatus === 'exists'
                  ? 'Le compte de service Home Assistant est prêt. Procédez à la configuration du custom component.'
                  : 'Créez le compte de service Home Assistant qui permettra à votre instance HA d\'accéder à tous vos véhicules.'}
              </p>
            </div>
            {haAccountStatus !== 'exists' && (
              <button
                onClick={createHaAccount}
                disabled={isCreating}
                className="btn btn-primary whitespace-nowrap ml-4"
              >
                {isCreating ? '⏳ Création...' : '🚀 Créer le compte'}
              </button>
            )}
          </div>
          {success && <p className="text-sm mt-2" style={{ color: 'var(--success)' }}>{success}</p>}
          {error && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
      ) : (
        <div className="rounded p-4 mb-6" style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)' }}>
          <p className="font-bold" style={{ color: 'var(--warning)' }}>
            ⛔ Accès administrateur requis
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Seul un administrateur peut créer/gérer le compte Home Assistant.
          </p>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setActiveTab('setup')}
          className="px-4 py-2 font-medium text-sm transition-colors whitespace-nowrap border-b-2"
          style={{
            borderColor: activeTab === 'setup' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'setup' ? 'var(--accent)' : 'var(--text-2)',
          }}
        >
          📋 Configuration
        </button>
        <button
          onClick={() => setActiveTab('auth')}
          className="px-4 py-2 font-medium text-sm transition-colors whitespace-nowrap border-b-2"
          style={{
            borderColor: activeTab === 'auth' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'auth' ? 'var(--accent)' : 'var(--text-2)',
          }}
        >
          🔑 Authentification
        </button>
        <button
          onClick={() => setActiveTab('cards')}
          className="px-4 py-2 font-medium text-sm transition-colors whitespace-nowrap border-b-2"
          style={{
            borderColor: activeTab === 'cards' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'cards' ? 'var(--accent)' : 'var(--text-2)',
          }}
        >
          🎨 Carte Lovelace
        </button>
      </div>

      {/* Setup Tab */}
      {activeTab === 'setup' && (
        <div className="space-y-6">
          {/* Étape 1 : Créer le compte */}
          <div className="rounded p-4" style={{
            background: haAccountStatus === 'exists' ? 'var(--success-light)' : 'var(--accent-light)',
            border: `1px solid ${haAccountStatus === 'exists' ? 'var(--success)' : 'var(--accent)'}`
          }}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">{haAccountStatus === 'exists' ? '✅' : '📋'}</span>
              <div className="flex-1">
                <p className="font-bold" style={{ color: haAccountStatus === 'exists' ? 'var(--success)' : 'var(--accent)' }}>
                  Étape 1 : Compte Home Assistant
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                  {haAccountStatus === 'exists'
                    ? '✓ Compte homeassistant créé et prêt'
                    : 'Créez le compte de service en cliquant sur le bouton ci-dessus'}
                </p>
              </div>
            </div>
          </div>

          {/* Étape 2 : Installation du custom component */}
          <div className="rounded p-4" style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)' }}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">📦</span>
              <div className="flex-1">
                <p className="font-bold" style={{ color: 'var(--accent)' }}>Étape 2 : Installer le custom component</p>
                <p className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>
                  Copiez les fichiers du custom component dans votre instance Home Assistant :
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <p style={{ color: 'var(--text-1)' }}><strong>Source :</strong> <code style={{ background: 'var(--bg-base)', padding: '2px 8px', borderRadius: 4 }}>backend/../ha-integration/custom_components/ridelog/</code></p>
                  <p style={{ color: 'var(--text-1)' }}><strong>Destination :</strong> <code style={{ background: 'var(--bg-base)', padding: '2px 8px', borderRadius: 4 }}>~/.homeassistant/custom_components/ridelog/</code></p>
                  <p className="mt-3" style={{ color: 'var(--text-1)' }}><strong>📝 Fichiers à copier :</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2" style={{ color: 'var(--text-2)' }}>
                    <li><code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>__init__.py</code></li>
                    <li><code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>manifest.json</code></li>
                    <li><code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>config_flow.py</code></li>
                    <li><code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>const.py</code></li>
                    <li><code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>api.py</code></li>
                    <li><code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>strings.json</code> (et autres fichiers)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Étape 3 : Redémarrer HA */}
          <div className="rounded p-4" style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)' }}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔄</span>
              <div className="flex-1">
                <p className="font-bold" style={{ color: 'var(--warning)' }}>Étape 3 : Redémarrer Home Assistant</p>
                <p className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>
                  Après la copie des fichiers, redémarrez Home Assistant pour qu'il détecte le nouveau custom component.
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>
                  <strong>Chemin :</strong> Paramètres → Système → ⋮ (menu) → Redémarrer
                </p>
              </div>
            </div>
          </div>

          {/* Étape 4 : Créer l'intégration */}
          <div className="rounded p-4" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid #8b5cf6' }}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">🎛️</span>
              <div className="flex-1">
                <p className="font-bold" style={{ color: '#8b5cf6' }}>Étape 4 : Créer l'intégration RideLog</p>
                <p className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>
                  Une fois HA redémarré, créez l'intégration RideLog :
                </p>
                <div className="mt-3 space-y-1 text-xs" style={{ color: 'var(--text-2)' }}>
                  <p><strong>1.</strong> Allez à <strong>Paramètres → Appareils et services</strong></p>
                  <p><strong>2.</strong> Cliquez sur <strong>Créer une intégration</strong> (bouton en bas à droite)</p>
                  <p><strong>3.</strong> Recherchez <strong>"RideLog"</strong></p>
                  <p><strong>4.</strong> Sélectionnez <strong>RideLog</strong> (avec le logo auto)</p>
                  <p className="mt-2"><strong>5.</strong> Remplissez le formulaire :</p>
                  <div className="p-2 rounded mt-1 ml-4" style={{ background: 'var(--bg-base)' }}>
                    <p className="font-mono" style={{ color: 'var(--text-1)' }}>URL API: <strong>http://192.168.1.x:8000</strong></p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>(Remplacez par votre IP/domaine)</p>
                  </div>
                  <p className="mt-2"><strong>6.</strong> Cliquez sur <strong>Créer</strong></p>
                </div>
              </div>
            </div>
          </div>

          {/* Étape 5 : Vérification */}
          <div className="rounded p-4" style={{ background: 'var(--success-light)', border: '1px solid var(--success)' }}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">🎉</span>
              <div className="flex-1">
                <p className="font-bold" style={{ color: 'var(--success)' }}>Étape 5 : Vérification</p>
                <p className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>
                  Les capteurs RideLog doivent maintenant être disponibles dans Home Assistant.
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>
                  <strong>Allez à :</strong> Paramètres → Appareils et services → RideLog
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>
                  <strong>Capteurs visibles :</strong> <code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>sensor.ridelog_*</code>
                </p>
              </div>
            </div>
          </div>

          {/* Notes importantes */}
          <div className="rounded p-4" style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)' }}>
            <p className="font-bold" style={{ color: 'var(--warning)' }}>⚠️ Notes importantes</p>
            <ul className="list-disc list-inside space-y-1 text-xs mt-2" style={{ color: 'var(--text-2)' }}>
              <li>L'URL API doit être accessible depuis votre réseau Home Assistant</li>
              <li>Pour un accès distant, utilisez un domaine avec certificat SSL (https://)</li>
              <li>Le compte homeassistant est un compte de service protégé (ne pas promouvoir en admin)</li>
              <li>Les tokens valent 30 jours - un renouvellement automatique est recommandé</li>
            </ul>
          </div>
        </div>
      )}

      {/* Authentication Tab */}
      {activeTab === 'auth' && (
        <div className="space-y-6">
          <div className="rounded p-4 text-sm" style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', color: 'var(--text-1)' }}>
            <p className="font-bold mb-3">🔑 Comment fonctionne l'authentification</p>
            <ol className="list-decimal list-inside space-y-2 text-xs">
              <li>Vous créez le compte Home Assistant dans RideLog (bouton ci-dessus ↑)</li>
              <li>RideLog crée un compte de service spécial <strong>homeassistant</strong></li>
              <li>Home Assistant appelle <code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>POST /auth/ha-init</code></li>
              <li>RideLog retourne un token Bearer valide 30 jours</li>
              <li>Home Assistant stocke le token de manière sécurisée</li>
              <li>Le compte homeassistant voit TOUS les véhicules de tous les utilisateurs</li>
              <li>Utilisez <code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>POST /auth/refresh</code> pour renouveler le token</li>
            </ol>
          </div>

          <div className="rounded p-4 text-sm" style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', color: 'var(--text-1)' }}>
            <p className="font-bold mb-3">⏰ Renouvellement automatique (optionnel)</p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-2)' }}>Créez une automation pour renouveler le token chaque semaine (avant les 30 jours):</p>
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
              <li>✓ Pas de password stocké (token générés aléatoirement)</li>
              <li>✓ Token Bearer avec expiration 30 jours</li>
              <li>✓ Token stocké chiffré dans Home Assistant</li>
              <li>✓ Zéro modification de configuration.yaml requise</li>
              <li>✓ Compte de service interne dédié (pas admin)</li>
            </ul>
          </div>

          <div className="rounded p-4 text-sm" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid #8b5cf6', color: 'var(--text-1)' }}>
            <p className="font-bold mb-2">📝 Endpoints API disponibles</p>
            <ul className="text-xs space-y-1 font-mono">
              <li><code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>POST /auth/ha-init</code> — Créer/récupérer compte homeassistant</li>
              <li><code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>POST /auth/refresh</code> — Renouveler le token</li>
              <li><code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>GET /vehicles</code> — Liste des véhicules</li>
              <li><code style={{ background: 'var(--bg-base)', padding: '1px 4px', borderRadius: 4 }}>GET /maintenances</code> — Historique d'entretien</li>
            </ul>
          </div>
        </div>
      )}

      {/* Cards Tab – Template Generator */}
      {activeTab === 'cards' && (
        <div className="space-y-6">
          <div className="rounded p-4 text-sm" style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', color: 'var(--text-1)' }}>
            <p className="font-bold mb-2">🎨 Générateur de carte Lovelace</p>
            <p className="text-xs" style={{ color: 'var(--text-2)' }}>
              Sélectionnez un véhicule pour générer automatiquement le YAML de la carte Mushroom 
              avec les bonnes entités. Copiez-le dans votre tableau de bord Home Assistant.
            </p>
          </div>

          {/* Dépendances HACS */}
          <div className="rounded p-4" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid #8b5cf6' }}>
            <p className="font-bold mb-2" style={{ color: '#8b5cf6' }}>📦 Dépendances requises (HACS)</p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-2)' }}>
              Ces composants doivent être installés via <strong>HACS → Frontend</strong> avant d'utiliser la carte :
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                <code style={{ background: 'var(--bg-base)', padding: '2px 8px', borderRadius: 4 }} className="font-mono">mushroom</code>
                <span>— Cartes stylisées (mushroom-template-card, mushroom-title-card, mushroom-chips-card)</span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                <code style={{ background: 'var(--bg-base)', padding: '2px 8px', borderRadius: 4 }} className="font-mono">card-mod</code>
                <span>— Permet le CSS conditionnel (afficher/masquer les items selon les données)</span>
              </div>
            </div>
            <p className="text-xs mt-3" style={{ color: 'var(--text-3)' }}>
              HACS → Frontend → <strong>Explorer et télécharger des dépôts</strong> → Rechercher le nom → Installer → Redémarrer HA
            </p>
          </div>

          {/* Vehicle selector */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>
                Véhicule
              </label>
              <select
                value={selectedVehicleId}
                onChange={(e) => {
                  setSelectedVehicleId(e.target.value);
                  setGeneratedYaml('');
                  setCopySuccess(false);
                }}
                className="w-full border rounded px-3 py-2 text-sm"
                style={{ 
                  backgroundColor: 'var(--surface-2)', 
                  color: 'var(--text-1)',
                  borderColor: 'var(--border)'
                }}
              >
                <option value="">— Choisir un véhicule —</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.vehicle_type === 'motorcycle' ? '🏍️' : '🚗'} {v.name}
                  </option>
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
                } catch (err) {
                  setGeneratedYaml('# Erreur lors de la génération');
                } finally {
                  setIsGenerating(false);
                }
              }}
              disabled={!selectedVehicleId || isGenerating}
              className="btn btn-primary whitespace-nowrap"
            >
              {isGenerating ? '⏳ Génération...' : '⚡ Générer'}
            </button>
          </div>

          {/* Generated YAML */}
          {generatedYaml && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-bold" style={{ color: 'var(--text-2)' }}>
                  YAML généré — cliquez pour copier
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedYaml);
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 3000);
                  }}
                  className="text-xs px-3 py-1 rounded font-medium transition-colors"
                  style={copySuccess
                    ? { background: 'var(--success-light)', color: 'var(--success)', border: '1px solid var(--success)' }
                    : { background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)' }
                  }
                >
                  {copySuccess ? '✅ Copié !' : '📋 Copier'}
                </button>
              </div>
              <pre 
                ref={yamlRef}
                className="p-4 rounded overflow-auto text-xs border cursor-pointer"
                style={{
                  backgroundColor: 'var(--surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-1)',
                  maxHeight: '500px',
                }}
                onClick={() => {
                  navigator.clipboard.writeText(generatedYaml);
                  setCopySuccess(true);
                  setTimeout(() => setCopySuccess(false), 3000);
                }}
              >
                {generatedYaml}
              </pre>
              <div className="mt-3 rounded p-3 text-xs" style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', color: 'var(--text-1)' }}>
                <p className="font-bold">💡 Comment utiliser :</p>
                <ol className="list-decimal list-inside space-y-1 mt-1">
                  <li>Copiez le YAML ci-dessus</li>
                  <li>Dans HA : ouvrez votre <strong>Tableau de bord</strong> → cliquez sur <strong>✏️</strong> (modifier) en haut à droite</li>
                  <li>Cliquez <strong>+ Ajouter une carte</strong></li>
                  <li>Tout en bas, cliquez <strong>Manuel</strong></li>
                  <li>Effacez le contenu par défaut, collez le YAML et cliquez <strong>Enregistrer</strong></li>
                </ol>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
