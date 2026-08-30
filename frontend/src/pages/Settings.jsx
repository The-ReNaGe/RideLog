import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DiscordIntegration from '../components/integrations/DiscordIntegration';
import HomeAssistantIntegration from '../components/integrations/HomeAssistantIntegration';
import APIDocumentation from '../components/APIDocumentation';
import FamilySettings from '../components/FamilySettings';
import { copyToClipboard } from '../lib/clipboard';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import Notice from '../components/Notice';
import { usePreferences } from '../lib/preferencesContext';
import { LANGUAGES } from '../lib/i18n';
import { UNIT_SYSTEMS } from '../lib/units';
import Flag from '../components/Flag';

// Libellés d'onglets passés à t() dynamiquement (`t(tab.label)`).
// i18n: 'Préférences', 'Discord', 'Home Assistant', 'Rappels', 'Famille', 'Compte', 'Inscription', 'API'
const TABS = [
  // Les préférences d'abord : c'est le premier réglage qu'on cherche, et
  // c'était jusqu'ici le plus difficile à trouver — le pays dans un onglet
  // admin séparé, la langue enfouie dans « Compte ».
  { key: 'preferences',   icon: 'sliders',  label: 'Préférences' },
  { key: 'discord',       icon: 'message',  label: 'Discord' },
  { key: 'homeassistant', icon: 'home',     label: 'Home Assistant' },
  { key: 'reminders',     icon: 'bell',     label: 'Rappels' },
  { key: 'famille',       icon: 'users',    label: 'Famille' },
  { key: 'compte',        icon: 'key',      label: 'Compte' },
  { key: 'inscription',   icon: 'mail',     label: 'Inscription', adminOnly: true },
  { key: 'api',           icon: 'plug',     label: 'API' },
];

export default function Settings({ currentUser }) {
  const { t } = usePreferences();
  const [activeTab, setActiveTab] = useState('preferences');

  return (
    // Largeur commune à tous les onglets. Sans elle, le contenu s'étirait sur
    // toute la page : des lignes de texte de 1400 px, que l'œil perd au retour
    // à la ligne. Un onglet centré et les autres pleine largeur — l'écart
    // sautait aux yeux en passant de l'un à l'autre.
    <div className="max-w-5xl mx-auto">
      <PageHeader title={t('Paramètres')} />

      {/* Navigation par onglets */}
      <div className="tabs mb-5">
        {TABS.filter(tab => !tab.adminOnly || currentUser?.is_admin).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            aria-current={activeTab === tab.key ? 'true' : undefined}
          >
            <Icon name={tab.icon} size={16} />
            {t(tab.label)}
          </button>
        ))}
      </div>

      {/* DISCORD TAB */}
      {activeTab === 'discord' && <DiscordIntegration />}

      {/* HOME ASSISTANT TAB */}
      {activeTab === 'homeassistant' && <HomeAssistantIntegration />}

      {/* REMINDERS TAB */}
      {activeTab === 'reminders' && <ReminderSettings />}

      {/* FAMILLE TAB */}
      {activeTab === 'famille' && <FamilySettings currentUser={currentUser} />}

      {/* PRÉFÉRENCES TAB */}
      {activeTab === 'preferences' && <PreferencesSettings currentUser={currentUser} />}

      {/* COMPTE TAB */}
      {activeTab === 'compte' && <AccountSettings />}

      {/* INSCRIPTION TAB */}
      {activeTab === 'inscription' && currentUser?.is_admin && (
        <InscriptionSettings />
      )}

      {/* API TAB */}
      {activeTab === 'api' && <APIDocumentation />}
    </div>
  );
}

// Noms de devise, renvoyés par le backend et passés à t() dynamiquement.
// i18n: 'Euro', 'Dollar américain'
// ═══════════════════════════════════════════════════════════════════════════
// PRÉFÉRENCES — pays, langue, unités
// ═══════════════════════════════════════════════════════════════════════════
//
// Les trois étaient éparpillés : le pays dans un onglet admin à part, la langue
// enfouie dans « Compte », les unités nulle part. Trois réglages qu'on vient
// régler dans le même mouvement, et qu'on cherchait à trois endroits.
//
// Ils n'ont pourtant pas la même PORTÉE, et l'écran doit le dire :
//
//   Pays    → toute l'instance, réservé à un administrateur. Il décide du
//             format de plaque et du calendrier réglementaire, qui sont des
//             faits sur les véhicules, pas des goûts. Un pays par utilisateur
//             ferait qu'un membre du groupe famille verrait une échéance de
//             contrôle technique différente de celle du propriétaire, sur le
//             même véhicule.
//   Langue  → par utilisateur.
//   Unités  → par utilisateur, et purement d'affichage : la base reste en
//             kilomètres et en litres quoi qu'on choisisse (voir lib/units.js).
//
// Le pays fournit le DÉFAUT des deux autres. Tant que l'utilisateur n'a rien
// choisi, il suit le pays — et suivra le nouveau si l'admin en change.

function OptionRow({ children }) {
  return (
    <div className="flex flex-wrap gap-2" style={{ marginBottom: 6 }}>
      {children}
    </div>
  );
}

/**
 * Un choix, rendu en bouton-carte plutôt qu'en `<select>`.
 *
 * Deux ou trois options tiennent à l'écran : les montrer toutes évite le clic
 * qui sert seulement à découvrir ce qui existe. Et un `<select>` ne sait pas
 * porter un drapeau.
 */
function OptionButton({ active, onClick, disabled, flag, label, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="card p-3"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--accent-light)' : 'var(--bg-surface)',
        opacity: disabled && !active ? 0.55 : 1,
        minWidth: 150,
      }}
    >
      {flag && <Flag code={flag} width={22} />}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: active ? 'var(--accent)' : 'var(--text-1)' }}>
          {label}
        </span>
        {hint && (
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)' }}>{hint}</span>
        )}
      </span>
    </button>
  );
}

function PreferencesSettings({ currentUser }) {
  const { lang, units, region, currency, setLang, setUnits, t } = usePreferences();
  const [regions, setRegions] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isAdmin = !!currentUser?.is_admin;

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getRegions();
        setRegions(res.data.regions);
        setCurrencies(res.data.currencies || []);
      } catch (err) {
        setError(err.response?.data?.detail || err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Le réglage s'applique tout de suite et part au serveur ensuite : une
  // interface qui attend le réseau pour répondre à un clic paraît cassée.
  // L'enregistrement ne sert qu'à retrouver le choix ailleurs.
  const savePreference = async (patch, applyLocally) => {
    applyLocally();
    setError(null);
    try {
      const res = await api.setPreferences(patch);
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const chooseCurrency = async (code) => {
    if (code === currency) return;
    setError(null);
    try {
      await api.setCurrency(code);
      // Relire le compte : la devise effective est résolue côté serveur.
      const me = await api.getCurrentUser();
      localStorage.setItem('user', JSON.stringify(me.data));
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const chooseCountry = async (code) => {
    if (code === region) return;
    setError(null);
    try {
      await api.setRegion(code);
      // Le pays fournit le défaut de la langue et des unités : il faut relire
      // le compte pour que les valeurs effectives soient recalculées côté
      // serveur plutôt que devinées ici.
      const me = await api.getCurrentUser();
      localStorage.setItem('user', JSON.stringify(me.data));
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  if (loading) {
    return <div className="text-center py-8"><div className="spinner mx-auto"></div></div>;
  }

  const activeRegion = regions.find((r) => r.code === region);
  const onlyOneCountry = regions.length < 2;

  return (
    <div>
      {error && (
        <Notice tone="danger" icon="alertCircle" className="mb-5">{error}</Notice>
      )}

      {/* ── Pays ─────────────────────────────────────────────────────── */}
      <div className="card p-6 mb-5">
        <h3 className="section-title mb-1">{t('Pays')}</h3>
        <p className="field-hint mb-3">
          {t("Décide du format de plaque d'immatriculation, du service qui la décode et du calendrier du contrôle technique. S'applique à toute l'instance.")}
        </p>

        <OptionRow>
          {regions.map((r) => (
            <OptionButton
              key={r.code}
              active={r.code === region}
              disabled={!isAdmin || onlyOneCountry}
              onClick={() => chooseCountry(r.code)}
              flag={r.code}
              label={r.name}
              hint={r.plate_example}
            />
          ))}
        </OptionRow>

        {!isAdmin && (
          <p className="field-hint">
            {t('Seul un administrateur peut changer le pays de l\'instance.')}
          </p>
        )}
        {isAdmin && onlyOneCountry && (
          <p className="field-hint">
            {t("La France est pour l'instant le seul pays pris en charge. D'autres apparaîtront ici sans qu'aucun réglage ne soit à refaire.")}
          </p>
        )}
      </div>

      {/* ── Langue ───────────────────────────────────────────────────── */}
      <div className="card p-6 mb-5">
        <h3 className="section-title mb-1">{t('Langue')}</h3>
        <p className="field-hint mb-3">
          {activeRegion
            ? t('Ne vaut que pour votre compte. Par défaut, celle de {country}.', { country: activeRegion.name })
            : t('Ne vaut que pour votre compte.')}
        </p>

        <OptionRow>
          {LANGUAGES.map((l) => (
            <OptionButton
              key={l.code}
              active={l.code === lang}
              onClick={() => savePreference({ language: l.code }, () => setLang(l.code))}
              label={l.label}
            />
          ))}
        </OptionRow>

        {lang !== 'fr' && (
          <Notice tone="warning" icon="info" className="mt-3">
            {t('La traduction anglaise est en cours : certains écrans sont encore en français.')}
          </Notice>
        )}
      </div>

      {/* ── Unités ───────────────────────────────────────────────────── */}
      <div className="card p-6">
        <h3 className="section-title mb-1">{t('Unités')}</h3>
        <p className="field-hint mb-3">
          {t('Ne vaut que pour votre compte, et ne change que l\'affichage : vos données restent enregistrées en kilomètres et en litres.')}
        </p>

        <OptionRow>
          {UNIT_SYSTEMS.map((u) => (
            <OptionButton
              key={u.code}
              active={u.code === units}
              onClick={() => savePreference({ units: u.code }, () => setUnits(u.code))}
              label={t(u.label)}
              hint={u.hint}
            />
          ))}
        </OptionRow>
      </div>

      {/* ── Devise ───────────────────────────────────────────────────── */}
      <div className="card p-6 mt-5">
        <h3 className="section-title mb-1">{t('Devise')}</h3>
        <p className="field-hint mb-3">
          {t("Change le symbole affiché, rien d'autre : aucun montant déjà enregistré n'est converti.")}
        </p>

        <OptionRow>
          {currencies.map((c) => (
            <OptionButton
              key={c.code}
              active={c.code === currency}
              disabled={!isAdmin}
              onClick={() => chooseCurrency(c.code)}
              label={`${c.symbol}  ${t(c.name)}`}
              hint={c.code}
            />
          ))}
        </OptionRow>

        {!isAdmin && (
          <p className="field-hint">
            {t("Seul un administrateur peut changer la devise de l'instance.")}
          </p>
        )}
        <Notice tone="warning" icon="info" className="mt-3">
          {t("RideLog ne convertit pas les montants : il n'applique aucun taux de change. Saisissez vos dépenses dans votre monnaie, ce réglage dit seulement comment l'écrire.")}
        </Notice>
      </div>
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
      <Notice tone="info" icon="bell" title="Gestion des rappels d'entretien" className="mb-5">
        <p className="mb-2">
          Les rappels partent automatiquement vers vos webhooks, en trois niveaux :
        </p>
        <ul className="space-y-1">
          {[
            { color: 'var(--accent)',  label: '1er rappel — à prévoir', detail: '3 mois ou 1 500 km avant l’échéance' },
            { color: 'var(--warning)', label: '2e rappel — urgent',     detail: '1 mois ou 500 km avant l’échéance' },
            { color: 'var(--danger)',  label: '3e rappel — en retard',  detail: 'le jour de l’échéance, puis au-delà' },
          ].map(lvl => (
            <li key={lvl.label} className="flex items-center gap-2">
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: lvl.color, flexShrink: 0 }} />
              <span><strong style={{ color: 'var(--text-1)' }}>{lvl.label} :</strong> {lvl.detail}</span>
            </li>
          ))}
        </ul>
      </Notice>

      {loading ? (
        <div className="text-center py-8"><div className="spinner mx-auto"></div></div>
      ) : !hasWebhooks ? (
        <div className="card text-center" style={{ padding: '32px 16px' }}>
          <div className="icon-box lg neutral mx-auto" style={{ marginBottom: 12 }}>
            <Icon name="webhook" size={20} />
          </div>
          <p style={{ color: 'var(--text-2)' }}>
            Aucun webhook configuré — commencez par l'onglet Discord.
          </p>
        </div>
      ) : (
        <div className="card p-6 mb-6">
          <h3 className="section-title mb-3">Webhooks actifs</h3>
          <div className="space-y-2 mb-5">
            {webhooks.map((w) => (
              <div key={w.id} className="inset flex items-center gap-2" style={{ padding: '10px 12px' }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                    background: w.is_active ? 'var(--success)' : 'var(--text-3)',
                  }}
                />
                <span className="text-sm" style={{ color: 'var(--text-2)' }}>
                  {w.webhook_type.toUpperCase()} — {w.is_active ? 'actif' : 'inactif'}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={async () => {
              setChecking(true);
              try {
                const res = await api.checkReminders();
                alert(`Vérification terminée. ${res.data.cleared_logs} rappel(s) réinitialisé(s).`);
              } catch (err) {
                alert('Erreur : ' + (err.response?.data?.detail || err.message));
              }
              setChecking(false);
            }}
            disabled={checking}
            className="btn btn-primary w-full"
          >
            <Icon name="refresh" size={16} />
            {checking ? 'Vérification…' : 'Re-vérifier les rappels maintenant'}
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
// COMPTE — changement de mot de passe (libre-service, tous utilisateurs)
// ═══════════════════════════════════════════════════════════════════════════

function AccountSettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== newPasswordConfirm) {
      setError('Les nouveaux mots de passe ne correspondent pas');
      return;
    }
    if (newPassword.length < 6) {
      setError('Le nouveau mot de passe doit faire au moins 6 caractères');
      return;
    }

    setSaving(true);
    try {
      const response = await api.changeMyPassword(currentPassword, newPassword);
      // Le backend invalide les anciens tokens et en renvoie un nouveau —
      // on le stocke immédiatement pour rester connecté sur cet appareil.
      localStorage.setItem('access_token', response.data.access_token);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors du changement de mot de passe');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    // Plus étroit que les autres onglets : un formulaire de mot de passe à
    // trois champs n'a aucune raison de s'étendre sur toute la largeur
    // disponible. La bannière et la carte partagent la même largeur.
    <div className="max-w-2xl mx-auto">
      <Notice tone="info" icon="key" title="Sécurité du compte" className="mb-5">
        Changez votre mot de passe quand vous le souhaitez, sans passer par un administrateur.
        Vos autres sessions (autres appareils, autres navigateurs) sont déconnectées ; celle-ci reste ouverte.
      </Notice>

      <div className="card">
        <h3 className="section-title mb-4">Changer mon mot de passe</h3>

        {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
        {success && <Notice tone="success" className="mb-4">Mot de passe changé avec succès.</Notice>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">Mot de passe actuel</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="field-label">Nouveau mot de passe</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="field-hint">Minimum 6 caractères</p>
          </div>
          <div>
            <label className="field-label">Confirmer le nouveau mot de passe</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPasswordConfirm}
              onChange={e => setNewPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" disabled={saving} className="btn btn-primary w-full mt-2">
            {saving ? 'Changement…' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
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
    icon: 'mail',
    description: 'Une nouvelle personne doit recevoir un lien d\'invitation d\'un administrateur pour s\'inscrire.',
    color: 'var(--accent)',
    bg: 'var(--accent-light)',
  },
  {
    value: 'closed',
    label: 'Privé',
    icon: 'lock',
    description: 'Les inscriptions sont fermées. Seul un administrateur peut créer des comptes.',
    color: 'var(--danger)',
    bg: 'var(--danger-light)',
  },
  {
    value: 'open',
    label: 'Ouvert',
    icon: 'globe',
    description: 'Tout le monde peut créer un compte librement, sans invitation.',
    color: 'var(--success)',
    bg: 'var(--success-light)',
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
  const [copyError, setCopyError] = useState(null);

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

  const copyInviteLink = async (token) => {
    setCopyError(null);
    const link = `${window.location.origin}/invite/${token}`;
    const success = await copyToClipboard(link);
    if (success) {
      setCopiedId(token);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      setCopyError('Impossible de copier automatiquement. Copiez le lien manuellement : ' + link);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="spinner mx-auto mb-2"></div>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>Chargement…</p>
      </div>
    );
  }

  return (
    <div>
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}

      {/* Mode d'inscription */}
      <div className="card mb-5">
        <h3 className="section-title">Qui peut s'inscrire</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
          Contrôlez comment les nouvelles personnes s'inscrivent à votre instance RideLog.
        </p>

        <div className="space-y-3">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSetMode(opt.value)}
              disabled={saving}
              className="w-full text-left transition-all"
              style={{
                border: '1px solid',
                borderColor: mode === opt.value ? opt.color : 'var(--border)',
                background: mode === opt.value ? opt.bg : 'var(--bg-surface)',
                borderRadius: 'var(--radius)',
                padding: 14,
                opacity: saving ? 0.6 : 1,
                cursor: 'pointer',
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 18, height: 18, marginTop: 1,
                    border: `2px solid ${mode === opt.value ? opt.color : 'var(--border-strong)'}`,
                  }}
                >
                  {mode === opt.value && (
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: opt.color }} />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon name={opt.icon} size={15} style={{ color: mode === opt.value ? opt.color : 'var(--text-3)' }} />
                    <span className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{opt.label}</span>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
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
        <div className="card">
          <h3 className="section-title">Liens d'invitation</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
            Des liens à usage unique, pour permettre à de nouvelles personnes de créer un compte.
          </p>

          {copyError && <Notice tone="warning" className="mb-3">{copyError}</Notice>}

          <div className="flex items-end gap-3 mb-4 flex-wrap">
            <div>
              <label className="field-label">Validité</label>
              <select
                value={expiresHours}
                onChange={(e) => setExpiresHours(Number(e.target.value))}
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
              className="btn btn-primary"
            >
              <Icon name="plus" size={16} strokeWidth={2} />
              {invCreating ? 'Création…' : 'Créer une invitation'}
            </button>
          </div>

          {invLoading ? (
            <div className="text-center py-4">
              <div className="spinner mx-auto mb-2"></div>
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Aucune invitation en cours.</p>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Statut</th>
                    <th>Créée par</th>
                    <th>Créée le</th>
                    <th>Expire le</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => {
                    const isUsed = inv.is_used;
                    const isExpired = inv.is_expired;
                    const isActive = !isUsed && !isExpired;
                    return (
                      <tr key={inv.id} style={{ opacity: isActive ? 1 : 0.65 }}>
                        <td>
                          {isUsed ? (
                            <span className="badge badge-info">
                              <Icon name="check" size={11} strokeWidth={2.5} />
                              Utilisée
                            </span>
                          ) : isExpired ? (
                            <span className="badge badge-warning">
                              <Icon name="clock" size={11} strokeWidth={2.2} />
                              Expirée
                            </span>
                          ) : (
                            <span className="badge badge-success">Active</span>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-2)' }}>@{inv.creator_username}</td>
                        <td className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {new Date(inv.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {new Date(inv.expires_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>
                          <div className="flex gap-1 items-center">
                            {isActive && (
                              <button onClick={() => copyInviteLink(inv.token)} className="btn btn-secondary btn-sm">
                                <Icon name={copiedId === inv.token ? 'check' : 'copy'} size={14} strokeWidth={copiedId === inv.token ? 2.4 : 1.75} />
                                {copiedId === inv.token ? 'Copié' : 'Copier le lien'}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteInvitation(inv.id)}
                              className="btn-icon danger"
                              title="Révoquer cette invitation"
                              aria-label="Révoquer cette invitation"
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
      )}
    </div>
  );
}