import React, { useState } from 'react';
import Icon from './Icon';

/**
 * Couleur par verbe HTTP.
 *
 * Les valeurs étaient écrites en dur (#3399FF, #22CC44, #FF6600), comme
 * `--bg-input`, `--text-code` et `--primary` — trois jetons qui n'ont jamais
 * existé dans la feuille de style : les blocs de code s'affichaient donc sans
 * fond, avec la couleur héritée.
 */
const METHOD_COLORS = {
  GET: 'var(--accent)',
  POST: 'var(--success)',
  PUT: 'var(--warning)',
  PATCH: 'var(--warning)',
  DELETE: 'var(--danger)',
};
const methodColor = (m) => METHOD_COLORS[m] || 'var(--text-2)';

export default function APIDocumentation() {
  const [expandedSection, setExpandedSection] = useState('auth');

  const Section = ({ id, title, icon, children }) => {
    const open = expandedSection === id;
    return (
      <div className="panel mb-4">
        <button
          onClick={() => setExpandedSection(open ? null : id)}
          className="panel-header w-full text-left"
          style={{ cursor: 'pointer', borderBottom: open ? '1px solid var(--border)' : 'none' }}
          aria-expanded={open}
        >
          <span className="icon-box sm"><Icon name={icon} size={15} /></span>
          <h3 className="section-title flex-1">{title}</h3>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} style={{ color: 'var(--text-3)' }} />
        </button>
        {open && <div className="panel-body">{children}</div>}
      </div>
    );
  };

  const CodeBlock = ({ code }) => (
    <pre
      className="p-3 mb-3 overflow-x-auto text-xs"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-1)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      <code>{code}</code>
    </pre>
  );

  const ApiEndpoint = ({ method, path, description, example, response }) => (
    <div
      className="mb-4"
      style={{
        borderLeft: `3px solid ${methodColor(method)}`,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderLeftWidth: 3,
        borderLeftColor: methodColor(method),
        borderRadius: 'var(--radius)',
        padding: 14,
      }}
    >
      <div className="flex gap-3 items-center mb-2 flex-wrap">
        <span className="badge" style={{ background: 'transparent', border: `1px solid ${methodColor(method)}`, color: methodColor(method) }}>
          {method}
        </span>
        <code style={{ color: 'var(--text-1)', fontSize: 12.5 }} className="font-mono">
          {path}
        </code>
      </div>
      <p className="text-sm mb-3" style={{ color: 'var(--text-2)' }}>{description}</p>
      {example && (
        <>
          <p className="card-label">Exemple</p>
          <CodeBlock code={example} />
        </>
      )}
      {response && (
        <>
          <p className="card-label">Réponse (200 OK)</p>
          <CodeBlock code={response} />
        </>
      )}
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="card mb-5">
        <h2 className="section-title flex items-center gap-2 mb-2">
          <Icon name="plug" size={18} style={{ color: 'var(--text-3)' }} />
          Documentation de l'API
        </h2>
        <p style={{ color: 'var(--text-2)', lineHeight: '1.6' }} className="text-sm">
          RideLog expose une API REST complète et sécurisée. Tous les endpoints (sauf <code>/auth/login</code> et <code>/auth/register</code>) 
          nécessitent une authentification par JWT token.
        </p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        {[
          { title: 'Base URL', value: 'localhost:8000' },
          { title: 'Authentification', value: 'JWT Bearer' },
          { title: 'Format', value: 'JSON' },
          { title: 'Timeout', value: '10s' },
          { title: 'Rate Limit', value: 'Aucune' },
          { title: 'CORS', value: 'Activé' }
        ].map((item, i) => (
          <div key={i} className="card p-3 text-center">
            <p style={{ color: 'var(--text-3)', fontSize: '12px' }} className="mb-1">{item.title}</p>
            <p style={{ color: 'var(--text-1)' }} className="font-semibold text-sm">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Sections */}

      <Section id="auth" icon={'lock'} title="Authentification">
        <p className="mb-4 text-sm" style={{ color: 'var(--text-2)' }}>
          L'authentification utilise JWT (JSON Web Tokens). Le token est obtenu lors du login et doit être envoyé 
          dans l'en-tête <code>Authorization: Bearer {'<token>'}</code> pour chaque requête protégée.
        </p>

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Créer un compte</h4>
        <ApiEndpoint
          method="POST"
          path="/auth/register"
          description="Crée un nouvel utilisateur local. Le premier utilisateur devient automatiquement administrateur."
          example={`curl -X POST http://localhost:8000/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "john",
    "display_name": "John Dupont",
    "password": "MonMotDePasse123",
    "password_confirm": "MonMotDePasse123"
  }'`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Connexion</h4>
        <ApiEndpoint
          method="POST"
          path="/auth/login"
          description="Authentifie un utilisateur et retourne un JWT token valide 7 jours."
          example={`curl -X POST http://localhost:8000/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "john",
    "password": "MonMotDePasse123"
  }'`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Profil utilisateur</h4>
        <ApiEndpoint
          method="GET"
          path="/auth/me"
          description="Retourne les informations de l'utilisateur authentifié."
          example={`curl -X GET http://localhost:8000/auth/me \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Renouveler le token</h4>
        <ApiEndpoint
          method="POST"
          path="/auth/refresh"
          description="Renouvelle le JWT token de l'utilisateur connecté."
          example={`curl -X POST http://localhost:8000/auth/refresh \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Initialiser Home Assistant</h4>
        <ApiEndpoint
          method="POST"
          path="/auth/ha-init"
          description="Crée ou réinitialise le compte d'intégration Home Assistant. Retourne username et mot de passe."
          example={`curl -X POST http://localhost:8000/auth/ha-init \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />
      </Section>

      <Section id="vehicles" icon={'car'} title="Véhicules">
        <p className="mb-4 text-sm" style={{ color: 'var(--text-2)' }}>
          Chaque utilisateur peut créer et gérer ses propres véhicules. Les données sont isolées par <code>user_id</code>.
        </p>

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Lister mes véhicules</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles"
          description="Retourne tous les véhicules de l'utilisateur authentifié."
          example={`curl -X GET http://localhost:8000/vehicles \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Créer un véhicule</h4>
        <ApiEndpoint
          method="POST"
          path="/vehicles"
          description="Crée un nouveau véhicule pour l'utilisateur."
          example={`curl -X POST http://localhost:8000/vehicles \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Ma Voiture",
    "vehicle_type": "car",
    "brand": "Peugeot",
    "model": "308"
  }'`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Détail d'un véhicule</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}"
          description="Retourne les détails d'un véhicule spécifique."
          example={`curl -X GET http://localhost:8000/vehicles/1 \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Modifier un véhicule</h4>
        <ApiEndpoint
          method="PUT"
          path="/vehicles/{vehicle_id}"
          description="Met à jour les informations d'un véhicule."
          example={`curl -X PUT http://localhost:8000/vehicles/1 \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "Ma Voiture Modifiée", "mileage": 55000 }'`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Supprimer un véhicule</h4>
        <ApiEndpoint
          method="DELETE"
          path="/vehicles/{vehicle_id}"
          description="Supprime un véhicule et toutes ses données associées."
          example={`curl -X DELETE http://localhost:8000/vehicles/1 \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Décoder un VIN</h4>
        <ApiEndpoint
          method="POST"
          path="/vehicles/decode-vin"
          description="Décode un numéro VIN via l'API NHTSA pour récupérer les infos du véhicule."
          example={`curl -X POST http://localhost:8000/vehicles/decode-vin \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{ "vin": "VF1RFB00X56789012" }'`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Décoder une plaque</h4>
        <ApiEndpoint
          method="POST"
          path="/vehicles/decode-license-plate"
          description="Décode une plaque d'immatriculation française pour récupérer les infos du véhicule."
          example={`curl -X POST http://localhost:8000/vehicles/decode-license-plate \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{ "license_plate": "AB-123-CD" }'`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Photo du véhicule</h4>
        <ApiEndpoint
          method="POST"
          path="/vehicles/{vehicle_id}/photo"
          description="Upload une photo de véhicule (multipart/form-data)."
          example={`curl -X POST http://localhost:8000/vehicles/1/photo \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -F "file=@photo.jpg"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Planning global</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/planning"
          description="Retourne les entretiens à venir et en retard pour tous les véhicules de l'utilisateur."
          example={`curl -X GET http://localhost:8000/vehicles/planning \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />
      </Section>

      <Section id="maintenances" icon={'wrench'} title="Entretiens">
        <p className="mb-4 text-sm" style={{ color: 'var(--text-2)' }}>
          Gérez l'historique d'entretien de chaque véhicule. Ajoutez des interventions avec factures, 
          consultez les entretiens à venir et les recommandations.
        </p>

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Historique d'entretien</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/maintenances"
          description="Retourne l'historique complet des entretiens d'un véhicule."
          example={`curl -X GET http://localhost:8000/vehicles/1/maintenances \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Ajouter un entretien</h4>
        <ApiEndpoint
          method="POST"
          path="/vehicles/{vehicle_id}/maintenances"
          description="Enregistre un entretien. Supporte l'upload de factures (multipart/form-data)."
          example={`curl -X POST http://localhost:8000/vehicles/1/maintenances \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -F "intervention_type=Vidange" \\
  -F "date=2024-01-15" \\
  -F "mileage=50000" \\
  -F "cost=89.90" \\
  -F "invoices=@facture.pdf"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Modifier un entretien</h4>
        <ApiEndpoint
          method="PUT"
          path="/vehicles/{vehicle_id}/maintenances/{maintenance_id}"
          description="Met à jour un entretien existant. Supporte l'ajout de nouvelles factures."
          example={`curl -X PUT http://localhost:8000/vehicles/1/maintenances/5 \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -F "cost=95.00" \\
  -F "notes=Huile synthétique 5W40"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Supprimer un entretien</h4>
        <ApiEndpoint
          method="DELETE"
          path="/vehicles/{vehicle_id}/maintenances/{maintenance_id}"
          description="Supprime un entretien et ses factures associées."
          example={`curl -X DELETE http://localhost:8000/vehicles/1/maintenances/5 \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Télécharger une facture</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/maintenances/{maintenance_id}/invoices/{invoice_id}"
          description="Télécharge une facture associée à un entretien."
          example={`curl -X GET http://localhost:8000/vehicles/1/maintenances/5/invoices/2 \\
  -H "Authorization: Bearer <YOUR_TOKEN>" --output facture.pdf`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Entretiens à venir</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/upcoming"
          description="Liste les entretiens à venir, triés par urgence (overdue > urgent > upcoming > ok)."
          example={`curl -X GET http://localhost:8000/vehicles/1/upcoming \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Recommandations</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/recommendations"
          description="Retourne des recommandations contextuelles basées sur l'âge du véhicule et les entretiens en retard."
          example={`curl -X GET http://localhost:8000/vehicles/1/recommendations \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Interventions disponibles</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/available-interventions"
          description="Retourne les types d'interventions disponibles avec estimations de prix selon le véhicule."
          example={`curl -X GET http://localhost:8000/vehicles/1/available-interventions \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />
      </Section>

      <Section id="fuels" icon={'fuel'} title="Carburant">
        <p className="mb-4 text-sm" style={{ color: 'var(--text-2)' }}>
          Suivez vos pleins de carburant et analysez votre consommation. Recherchez les stations les moins chères à proximité.
        </p>

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Historique des pleins</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/fuel-logs"
          description="Retourne l'historique des pleins de carburant d'un véhicule."
          example={`curl -X GET http://localhost:8000/vehicles/1/fuel-logs \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Ajouter un plein</h4>
        <ApiEndpoint
          method="POST"
          path="/vehicles/{vehicle_id}/fuel-logs"
          description="Enregistre un nouveau plein de carburant."
          example={`curl -X POST http://localhost:8000/vehicles/1/fuel-logs \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "date": "2024-01-15",
    "mileage": 51000,
    "liters": 45.5,
    "cost": 78.20,
    "fuel_type": "SP95",
    "is_full_tank": true
  }'`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Statistiques consommation</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/fuel-stats"
          description="Retourne les statistiques de consommation (moyenne L/100km, coût/km, totaux)."
          example={`curl -X GET http://localhost:8000/vehicles/1/fuel-stats \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Rechercher des stations</h4>
        <ApiEndpoint
          method="GET"
          path="/fuel-stations/search?city=Paris&fuel_type=SP95"
          description="Recherche les stations-service à proximité d'une ville avec prix en temps réel."
          example={`curl -X GET "http://localhost:8000/fuel-stations/search?city=Paris&fuel_type=SP95" \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Suggestions de villes</h4>
        <ApiEndpoint
          method="GET"
          path="/fuel-stations/city-suggestions?q=Par"
          description="Auto-complétion de noms de villes pour la recherche de stations."
          example={`curl -X GET "http://localhost:8000/fuel-stations/city-suggestions?q=Par" \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />
      </Section>

      <Section id="exports" icon={'package'} title="Exports & Intégrations">
        <p className="mb-4 text-sm" style={{ color: 'var(--text-2)' }}>
          Exportez vos données en CSV, générez des récapitulatifs, estimez la valeur du véhicule 
          et intégrez avec Home Assistant.
        </p>

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Export CSV</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/csv"
          description="Exporte l'historique d'entretien au format CSV."
          example={`curl -X GET http://localhost:8000/vehicles/1/csv \\
  -H "Authorization: Bearer <YOUR_TOKEN>" --output entretiens.csv`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Récapitulatif complet</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/recap"
          description="Récapitulatif détaillé de l'historique d'entretien avec documents associés."
          example={`curl -X GET http://localhost:8000/vehicles/1/recap \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Télécharger ZIP</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/recap/download"
          description="Télécharge un ZIP contenant le CSV et toutes les factures du véhicule."
          example={`curl -X GET http://localhost:8000/vehicles/1/recap/download \\
  -H "Authorization: Bearer <YOUR_TOKEN>" --output recap.zip`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Estimation valeur</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/estimate"
          description="Estime la valeur actuelle du véhicule basée sur la dépréciation."
          example={`curl -X GET http://localhost:8000/vehicles/1/estimate \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Données Home Assistant</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/homeassistant"
          description="Exporte les données du véhicule au format attendu par l'intégration Home Assistant."
          example={`curl -X GET http://localhost:8000/vehicles/1/homeassistant \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Carte HA dynamique</h4>
        <ApiEndpoint
          method="GET"
          path="/vehicles/{vehicle_id}/ha-dashboard-card"
          description="Génère automatiquement une carte Lovelace (YAML) pour le dashboard Home Assistant."
          example={`curl -X GET http://localhost:8000/vehicles/1/ha-dashboard-card \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />
      </Section>

      <Section id="webhooks" icon={'webhook'} title="Webhooks & Notifications">
        <p className="mb-4 text-sm" style={{ color: 'var(--text-2)' }}>
          Configurez des notifications automatiques vers Discord, ntfy.sh, Gotify, Home Assistant, etc. 
          Chaque utilisateur gère ses propres webhooks en isolation complète.
        </p>

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Lister mes webhooks</h4>
        <ApiEndpoint
          method="GET"
          path="/settings/webhooks"
          description="Retourne tous les webhooks de l'utilisateur."
          example={`curl -X GET http://localhost:8000/settings/webhooks \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Créer un webhook</h4>
        <ApiEndpoint
          method="POST"
          path="/settings/webhooks"
          description="Crée un nouveau webhook. Le token_secret est généré automatiquement."
          example={`curl -X POST http://localhost:8000/settings/webhooks \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://ntfy.sh/mon-canal",
    "webhook_type": "ntfy"
  }'`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Supprimer un webhook</h4>
        <ApiEndpoint
          method="DELETE"
          path="/settings/webhooks/{webhook_id}"
          description="Supprime un webhook."
          example={`curl -X DELETE http://localhost:8000/settings/webhooks/3 \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Activer/Désactiver</h4>
        <ApiEndpoint
          method="PUT"
          path="/settings/webhooks/{webhook_id}"
          description="Active ou désactive un webhook existant."
          example={`curl -X PUT http://localhost:8000/settings/webhooks/3 \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Tester un webhook</h4>
        <ApiEndpoint
          method="POST"
          path="/settings/webhooks/{webhook_id}/test"
          description="Envoie une notification de test au webhook pour vérifier la configuration."
          example={`curl -X POST http://localhost:8000/settings/webhooks/3/test \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Forcer vérification rappels</h4>
        <ApiEndpoint
          method="POST"
          path="/settings/webhooks/check-reminders"
          description="Force la vérification des rappels et envoie les notifications immédiatement."
          example={`curl -X POST http://localhost:8000/settings/webhooks/check-reminders \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        />
      </Section>

      <Section id="admin" icon={'shield'} title="Administration">
        <p className="mb-4 text-sm" style={{ color: 'var(--text-2)' }}>
          Endpoints réservés aux administrateurs pour gérer les utilisateurs.
        </p>

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Lister les utilisateurs</h4>
        <ApiEndpoint
          method="GET"
          path="/admin/users"
          description="Liste tous les utilisateurs (admin uniquement)."
          example={`curl -X GET http://localhost:8000/admin/users \\
  -H "Authorization: Bearer <ADMIN_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Supprimer un utilisateur</h4>
        <ApiEndpoint
          method="DELETE"
          path="/admin/users/{user_id}"
          description="Supprime un utilisateur et toutes ses données (admin uniquement)."
          example={`curl -X DELETE http://localhost:8000/admin/users/2 \\
  -H "Authorization: Bearer <ADMIN_TOKEN>"`}
        />

        <h4 className="section-title mb-3" style={{ fontSize: '0.95rem' }}>Promouvoir admin</h4>
        <ApiEndpoint
          method="PUT"
          path="/admin/users/{user_id}/promote"
          description="Promeut un utilisateur au rang d'administrateur."
          example={`curl -X PUT http://localhost:8000/admin/users/2/promote \\
  -H "Authorization: Bearer <ADMIN_TOKEN>"`}
        />
      </Section>

      <Section id="security" icon={'shield'} title="Sécurité">
        <div className="space-y-3 text-sm">
          <div className="inset p-3" style={{ borderLeft: '3px solid var(--success)' }}>
            <p className="font-semibold mb-1">Isolation par utilisateur</p>
            <p style={{ color: 'var(--text-2)' }}>Chaque utilisateur ne voit que ses propres données.</p>
          </div>

          <div className="inset p-3" style={{ borderLeft: '3px solid var(--success)' }}>
            <p className="font-semibold mb-1">Authentification JWT</p>
            <p style={{ color: 'var(--text-2)' }}>Tous les endpoints nécessitent un JWT valide (7 jours).</p>
          </div>

          <div className="inset p-3" style={{ borderLeft: '3px solid var(--success)' }}>
            <p className="font-semibold mb-1">Mots de passe hachés</p>
            <p style={{ color: 'var(--text-2)' }}>Hachés avec bcrypt (coût 12, ~100ms par vérification).</p>
          </div>

          <div className="inset p-3" style={{ borderLeft: '3px solid var(--success)' }}>
            <p className="font-semibold mb-1">Upload sécurisé</p>
            <p style={{ color: 'var(--text-2)' }}>Vérification MIME type, taille max 10 Mo, stockage isolé par utilisateur.</p>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <div className="card text-center">
        <p style={{ color: 'var(--text-3)' }} className="text-xs">
          Tous les endpoints utilisent le préfixe <code>/api</code>. Base URL : <code>http://localhost:8000/api</code>
        </p>
      </div>
    </div>
  );
}
