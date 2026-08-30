import React, { useState, useCallback } from 'react';
import { api } from '../lib/api';
import { getInterventionDisplayName } from '../lib/interventionTranslations';
import Icon from './Icon';
import { useFormat } from '../lib/preferencesContext';
import CountryBadge from './CountryBadge';

const STATUS = {
  overdue: { label: 'En retard',    badge: 'badge-danger',  color: 'var(--danger)' },
  urgent:  { label: 'Urgent',       badge: 'badge-warning', color: 'var(--warning)' },
  warning: { label: 'À surveiller', badge: 'badge-warning', color: 'var(--warning)' },
  ok:      { label: 'À jour',       badge: 'badge-success', color: 'var(--success)' },
};

const statusOf = (s) => STATUS[s] || STATUS.ok;

/** Pastille d'état : la couleur porte l'information, le mot la confirme. */
function StatusBadge({ status }) {
  const st = statusOf(status);
  return (
    <span className={`badge ${st.badge}`}>
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor', display: 'inline-block' }}
      />
      {st.label}
    </span>
  );
}

const OVERDUE = Symbol('overdue');

// `fmt` est passé plutôt que capturé : c'est une fonction pure, hors
// composant, donc hors de portée des hooks — même convention que
// `formatDistance` juste en dessous.
function formatDueDate(value, fmt) {
  if (!value) return 'sans échéance';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sans échéance';
  return fmt.date(date);
}

// `fmt` vient de useFormat() : les sentinelles et le cas « en retard » sont
// traités AVANT toute conversion, sinon 999999 deviendrait « 621 371 mi ».
function formatDistance(km, fmt) {
  if (km === 999999 || km === Infinity) return '—';
  if (km < 0) return OVERDUE;
  return fmt.dist(km);
}

function formatDays(days) {
  if (days === 999999 || days === Infinity) return '—';
  if (days < 0) return OVERDUE;
  if (days > 365) return `${Math.floor(days / 365)} an${Math.floor(days / 365) > 1 ? 's' : ''}`;
  if (days > 30) return `${Math.floor(days / 30)} mois`;
  return `${days} j`;
}

/** Une colonne de l'encart de chiffres. */
function Stat({ label, value, color }) {
  const overdue = value === OVERDUE;
  return (
    <div style={{ padding: '0 10px', textAlign: 'center', width: 104 }}>
      <div className="card-label" style={{ marginBottom: 2 }}>{label}</div>
      <div
        className="tabular"
        style={{ fontSize: 15, fontWeight: 700, color: overdue ? 'var(--danger)' : (color || 'var(--text-1)') }}
      >
        {overdue ? 'En retard' : value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modales — châssis commun, puis les deux contenus
// ─────────────────────────────────────────────────────────────────────────────

/** Enveloppe partagée : voile, carte, en-tête, pied. */
function ModalShell({ title, subtitle, onClose, children, footer }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(12,15,22,0.55)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 480, padding: 0, boxShadow: 'var(--shadow-lg)' }}>
        <div className="panel-header" style={{ alignItems: 'flex-start' }}>
          <div className="flex-1 min-w-0">
            <h4 style={{ fontSize: '0.98rem' }}>{title}</h4>
            {subtitle && (
              <p className="text-ellipsis" style={{ color: 'var(--text-3)', fontSize: 12.5 }}>{subtitle}</p>
            )}
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Fermer">
            <Icon name="close" size={16} strokeWidth={2.2} />
          </button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {children}
        </div>

        {/* `flex-wrap` : « Supprimer cet entretien récurrent » est un libellé
            long, et à 420 px de large il ne tient pas sur la même ligne que les
            deux actions. Sans le repli, Enregistrer sortait du cadre. */}
        <div className="panel-footer flex items-center justify-between gap-2 flex-wrap">{footer}</div>
      </div>
    </div>
  );
}

/** Un critère d'intervalle : sa valeur, et la case qui l'éteint.
 *
 *  Sans `setDisabled`, la case n'est pas rendue du tout — à la création, un
 *  champ laissé vide suffit à ne pas suivre le critère, et une case inerte à
 *  côté d'un champ vide laissait croire à un réglage qui n'existait pas.
 */
function Criterion({ label, unit, value, setValue, disabled = false, setDisabled, inputProps, warning }) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <label className="field-label" style={{ marginBottom: 0 }}>{label}</label>
        {setDisabled && (
          <label className="flex items-center gap-1.5 cursor-pointer" style={{ fontSize: 12, color: 'var(--text-3)' }}>
            <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
            Désactivé
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          {...inputProps}
          value={disabled ? '' : value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? 'Désactivé' : inputProps.placeholder}
          style={{ flex: 1, opacity: disabled ? 0.45 : 1 }}
        />
        <span style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }}>{unit}</span>
      </div>
      {/* L'alerte est posée sous le champ concerné, pas au bas de la modale :
          un bouton grisé n'apprend rien tant qu'on ne sait pas lequel des deux
          critères l'attend. */}
      {warning && (
        <p className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--warning)', marginTop: 5 }}>
          <Icon name="alertCircle" size={13} />
          {warning}
        </p>
      )}
    </div>
  );
}

const NEEDS_CHOICE = 'Indiquez une valeur, ou cochez « Désactivé »';

function ErrorLine({ children }) {
  if (!children) return null;
  return (
    <p className="flex items-center gap-2" style={{ fontSize: 13, color: 'var(--danger)' }}>
      <Icon name="alertCircle" size={14} />{children}
    </p>
  );
}

const KM_INPUT = { min: '1', max: '500000', step: '100', placeholder: 'ex : 5000' };
const MONTHS_INPUT = { min: '1', max: '240', step: '1', placeholder: 'ex : 12' };

/** Le contrôle technique se suit au calendrier, jamais au compteur. */
const isInspection = (key) => (key || '').startsWith('inspection_technical');

function IntervalEditModal({ vehicleId, item, onClose, onSaved }) {
  const fmt = useFormat();
  const isCustom = Boolean(item.is_custom);
  const inspection = isInspection(item.intervention_key);
  const displayName = isCustom
    ? item.intervention_type
    : getInterventionDisplayName(item.intervention_type);

  const [name, setName] = useState(item.intervention_type || '');
  // L'intervalle est une DISTANCE : affiché dans l'unité choisie, et reconverti
  // en kilomètres à l'enregistrement. Sans cela, « tous les 5 000 » saisi par
  // un utilisateur en miles serait stocké comme 5 000 km — soit le double.
  const [kmValue, setKmValue] = useState(
    item.km_interval != null ? String(fmt.distValue(item.km_interval)) : ''
  );
  const [monthsValue, setMonthsValue] = useState(item.months_interval != null ? String(item.months_interval) : '');
  const [kmDisabled, setKmDisabled] = useState(item.km_interval == null && item.has_override);
  const [monthsDisabled, setMonthsDisabled] = useState(item.months_interval == null && item.has_override);
  const [saving, setSaving] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [error, setError] = useState(null);

  const interventionKey = item.intervention_key;
  // Le CT n'expose pas de critère kilométrique : il ne peut donc pas se
  // retrouver sans aucun critère, et le garde-fou ne le concerne pas.
  const bothOff = !inspection && kmDisabled && monthsDisabled;

  const body = () => ({
    km_interval: (inspection || kmDisabled) ? null : (kmValue !== '' ? fmt.toStorage(parseInt(kmValue, 10)) : null),
    months_interval: monthsDisabled ? null : (monthsValue !== '' ? parseInt(monthsValue, 10) : null),
    is_km_disabled: inspection || kmDisabled,
    is_months_disabled: monthsDisabled,
  });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.upsertIntervalOverride(vehicleId, interventionKey, {
        ...body(),
        is_disabled: false,
        name: isCustom ? name.trim() : undefined,
      });
      onSaved();
    } catch (e) {
      setError(e.response?.status === 409
        ? 'Un entretien de ce nom existe déjà pour ce véhicule.'
        : 'Erreur lors de la sauvegarde.');
      setSaving(false);
    }
  };

  /** Retirer l'entretien du suivi.
   *
   *  Deux mécanismes derrière un même bouton, parce que l'utilisateur fait la
   *  même chose dans les deux cas : une intervention du catalogue est écartée
   *  (elle reste rétablissable), un entretien personnalisé est supprimé — il
   *  n'existe que par sa ligne, la garder « écartée » n'aurait aucun sens.
   */
  const handleRemove = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isCustom) {
        await api.deleteIntervalOverride(vehicleId, interventionKey);
      } else {
        await api.upsertIntervalOverride(vehicleId, interventionKey, { ...body(), is_disabled: true });
      }
      onSaved();
    } catch (e) {
      if (isCustom && e.response?.status === 404) {
        onSaved();
        return;
      }
      setError('Erreur lors de la suppression.');
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.deleteIntervalOverride(vehicleId, interventionKey);
      onSaved();
    } catch (e) {
      // Si pas d'override existant (404), on ferme quand même
      if (e.response?.status === 404) {
        onSaved();
      } else {
        setError('Erreur lors de la réinitialisation.');
        setSaving(false);
      }
    }
  };

  return (
    <ModalShell
      title={isCustom ? "Modifier l'entretien" : "Modifier l'intervalle"}
      subtitle={displayName}
      onClose={onClose}
      footer={
        <>
          {/* Retirer du suivi, en bas à gauche.
              Même libellé dans les deux cas : un entretien ajouté est récurrent
              lui aussi. Deux mécanismes derrière — une intervention du catalogue
              est écartée et se rétablit, un entretien ajouté est supprimé — mais
              c'est le même geste, et la phrase au-dessus des boutons dit lequel
              des deux s'applique. */}
          <button
            onClick={confirmingRemoval || !isCustom ? handleRemove : () => setConfirmingRemoval(true)}
            disabled={saving}
            className="btn btn-sm"
            style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}
          >
            <Icon name="trash" size={14} />
            {confirmingRemoval ? 'Confirmer la suppression' : 'Supprimer cet entretien récurrent'}
          </button>

          <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
            <button onClick={onClose} disabled={saving} className="btn btn-secondary btn-sm">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || bothOff || (isCustom && !name.trim())}
              className="btn btn-primary btn-sm"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      }
    >
      {isCustom && (
        <div>
          <label className="field-label" htmlFor="custom-name">Nom de l'entretien</label>
          <input
            id="custom-name"
            type="text"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex : Vérification plaquettes"
          />
        </div>
      )}

      {/* Pas de critère kilométrique pour le contrôle technique : il se compte
          en années, pas en kilomètres. */}
      {!inspection && (
        <Criterion
          label={`Intervalle en ${fmt.distUnit}`} unit={fmt.distUnit}
          value={kmValue} setValue={setKmValue}
          disabled={kmDisabled} setDisabled={setKmDisabled}
          inputProps={KM_INPUT}
        />
      )}
      <Criterion
        label={inspection ? 'Périodicité' : 'Intervalle temporel'} unit="mois"
        value={monthsValue} setValue={setMonthsValue}
        disabled={monthsDisabled} setDisabled={inspection ? undefined : setMonthsDisabled}
        inputProps={inspection ? { ...MONTHS_INPUT, placeholder: 'ex : 24' } : MONTHS_INPUT}
      />

      {!isCustom && item.has_override && (
        <button
          onClick={handleReset}
          disabled={saving}
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: 'flex-start' }}
        >
          <Icon name="refresh" size={14} />
          Revenir aux valeurs par défaut
        </button>
      )}

      {bothOff && (
        <p className="flex items-start gap-2" style={{ fontSize: 12, color: 'var(--warning)', lineHeight: 1.45 }}>
          <Icon name="alertCircle" size={14} style={{ marginTop: 1 }} />
          <span>
            Un entretien sans aucun critère n'a plus d'échéance. Pour ne plus en
            entendre parler, utilisez « Supprimer cet entretien récurrent » ci-dessous.
          </span>
        </p>
      )}

      <p className="flex items-start gap-2" style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
        <Icon name="info" size={14} style={{ marginTop: 1 }} />
        <span>
          {inspection
            ? "Sans valeur ici, RideLog applique le calendrier réglementaire français (premier contrôle, puis périodicité). Une valeur le remplace pour ce véhicule."
            : "Ces valeurs ne valent que pour ce véhicule. Elles sont conservées indéfiniment."}
        </span>
      </p>

      <ErrorLine>{error}</ErrorLine>

      {/* Ce que fera le bouton rouge du pied. La phrase diffère parce que le
          sort de l'entretien diffère : l'un se rétablit, l'autre non. */}
      <p className="field-hint" style={{ marginBottom: 0, lineHeight: 1.45 }}>
        <strong style={{ color: 'var(--text-2)', fontWeight: 600 }}>Supprimer cet entretien récurrent : </strong>
        {isCustom
          ? "cet entretien que vous avez ajouté est retiré définitivement de ce véhicule. Les interventions déjà enregistrées sont conservées."
          : "il disparaît des échéances et des rappels de ce véhicule. Un bloc « Entretiens écartés » apparaît alors en bas de la liste « À venir » pour le rétablir. Les interventions déjà enregistrées sont conservées."}
      </p>
    </ModalShell>
  );
}

/** Création d'un entretien absent du catalogue. */
function CustomMaintenanceModal({ vehicleId, onClose, onSaved }) {
  const fmt = useFormat();
  const [name, setName] = useState('');
  const [kmValue, setKmValue] = useState('');
  const [monthsValue, setMonthsValue] = useState('');
  const [kmDisabled, setKmDisabled] = useState(false);
  const [monthsDisabled, setMonthsDisabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Distance saisie dans l'unité choisie → kilomètres en base.
  const km = kmDisabled || kmValue === '' ? null : fmt.toStorage(parseInt(kmValue, 10));
  const months = monthsDisabled || monthsValue === '' ? null : parseInt(monthsValue, 10);

  // Chaque critère demande un choix explicite : une valeur, ou la case
  // « Désactivé ». Un champ laissé vide sans rien cocher est une hésitation, pas
  // une décision — et le suivi qui en découlerait serait une surprise.
  const kmChosen = kmDisabled || kmValue !== '';
  const monthsChosen = monthsDisabled || monthsValue !== '';
  const bothOff = kmDisabled && monthsDisabled;
  const ready = name.trim() !== '' && kmChosen && monthsChosen && !bothOff && (km || months);

  // Rien n'est signalé tant que le formulaire est vierge : alerter avant que
  // l'utilisateur ait touché quoi que ce soit se lit comme un reproche. Dès
  // qu'il a commencé, le critère resté en suspens se signale.
  const engaged = name.trim() !== '' || kmChosen || monthsChosen;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.createCustomMaintenance(vehicleId, {
        name: name.trim(), km_interval: km, months_interval: months,
      });
      onSaved();
    } catch (e) {
      setError(e.response?.status === 409
        ? 'Un entretien de ce nom existe déjà pour ce véhicule.'
        : "Erreur lors de la création.");
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Ajouter un entretien récurrent"
      subtitle="Un suivi propre à ce véhicule, absent du catalogue"
      onClose={onClose}
      footer={
        <>
          <span />
          <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
            <button onClick={onClose} disabled={saving} className="btn btn-secondary btn-sm">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !ready}
              className="btn btn-primary btn-sm"
              title={ready ? '' : 'Chaque intervalle doit être renseigné ou désactivé'}
            >
              {saving ? 'Création…' : 'Ajouter'}
            </button>
          </div>
        </>
      }
    >
      <div>
        <label className="field-label" htmlFor="new-custom-name">Nom de l'entretien</label>
        <input
          id="new-custom-name"
          type="text"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex : Vérification plaquettes"
          autoFocus
        />
      </div>

      <Criterion
        label={`Intervalle en ${fmt.distUnit}`} unit={fmt.distUnit}
        value={kmValue} setValue={setKmValue}
        disabled={kmDisabled} setDisabled={setKmDisabled}
        inputProps={{ ...KM_INPUT, placeholder: 'ex : 500' }}
        warning={engaged && !kmChosen ? NEEDS_CHOICE : null}
      />
      <Criterion
        label="Intervalle temporel" unit="mois"
        value={monthsValue} setValue={setMonthsValue}
        disabled={monthsDisabled} setDisabled={setMonthsDisabled}
        inputProps={MONTHS_INPUT}
        warning={engaged && !monthsChosen ? NEEDS_CHOICE : null}
      />

      {bothOff ? (
        <p className="flex items-start gap-2" style={{ fontSize: 12, color: 'var(--warning)', lineHeight: 1.45 }}>
          <Icon name="alertCircle" size={14} style={{ marginTop: 1 }} />
          <span>Gardez au moins un critère actif : sans lui, l'entretien n'aurait aucune échéance.</span>
        </p>
      ) : (
        <p className="flex items-start gap-2" style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
          <Icon name="info" size={14} style={{ marginTop: 1 }} />
          <span>
            Un contrôle tous les {fmt.dist(500)} sans échéance de temps, par exemple :
            renseignez le kilométrage et cochez « Désactivé » sur le temporel.
            L'entretien rejoint alors les échéances et les rappels, et pourra
            être enregistré comme les autres.
          </span>
        </p>
      )}

      <ErrorLine>{error}</ErrorLine>
    </ModalShell>
  );
}

/** Les entretiens écartés — visibles, sinon ils seraient irrécupérables. */
function DisabledSection({ vehicleId, items, canEdit, onRefresh }) {
  const [busyKey, setBusyKey] = useState(null);

  const restore = async (key) => {
    setBusyKey(key);
    try {
      await api.deleteIntervalOverride(vehicleId, key);
      onRefresh?.();
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="card" style={{ padding: '12px 14px', marginTop: 12 }}>
      <div className="flex items-center gap-2">
        <Icon name="ban" size={14} style={{ color: 'var(--text-3)' }} />
        <span className="card-label">Entretiens écartés</span>
      </div>
      <p className="field-hint" style={{ marginTop: 2, marginBottom: 10 }}>
        Ils ne produisent ni échéance ni rappel pour ce véhicule.
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item.intervention_key}
            className="chip"
            style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 4px 4px 10px' }}
          >
            <span style={{ color: 'var(--text-2)' }}>
              {item.is_custom ? item.intervention_type : getInterventionDisplayName(item.intervention_type)}
            </span>
            {canEdit && (
              <button
                onClick={() => restore(item.intervention_key)}
                disabled={busyKey === item.intervention_key}
                className="btn-icon"
                title="Rétablir cet entretien"
                aria-label={`Rétablir ${item.intervention_type}`}
              >
                <Icon name="refresh" size={14} />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export default React.memo(function UpcomingMaintenance({ data, vehicleId, onRefresh, canEdit = true }) {
  const fmt = useFormat();
  const { upcoming } = data;
  const disabled = data.disabled || [];
  const [editingItem, setEditingItem] = useState(null);
  const [creating, setCreating] = useState(false);

  const handleSaved = useCallback(() => {
    setEditingItem(null);
    setCreating(false);
    onRefresh?.();
  }, [onRefresh]);

  const addButton = canEdit && vehicleId ? (
    <div className="flex justify-end" style={{ marginBottom: 12 }}>
      <button onClick={() => setCreating(true)} className="btn btn-secondary btn-sm">
        <Icon name="plus" size={14} />
        Ajouter un entretien récurrent
      </button>
    </div>
  ) : null;

  const modals = (
    <>
      {editingItem && vehicleId && (
        <IntervalEditModal
          vehicleId={vehicleId}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={handleSaved}
        />
      )}
      {creating && vehicleId && (
        <CustomMaintenanceModal
          vehicleId={vehicleId}
          onClose={() => setCreating(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );

  const disabledSection = disabled.length > 0 ? (
    <DisabledSection
      vehicleId={vehicleId}
      items={disabled}
      canEdit={canEdit}
      onRefresh={onRefresh}
    />
  ) : null;

  if (!upcoming || upcoming.length === 0) {
    return (
      <>
        {addButton}
        <div className="card text-center" style={{ padding: '40px 16px' }}>
          <div className="icon-box lg success mx-auto" style={{ marginBottom: 12 }}>
            <Icon name="checkCircle" size={20} />
          </div>
          <p style={{ color: 'var(--text-2)' }}>Aucune intervention prévue.</p>
        </div>
        {disabledSection}
        {modals}
      </>
    );
  }

  return (
    <>
      {addButton}
      <div className="space-y-3">
        {upcoming.map((item, idx) => {
          const st = statusOf(item.status);

          const hasKm = item.km_interval !== null && item.km_interval !== undefined;
          const hasMonths = item.months_interval !== null && item.months_interval !== undefined;
          const intervalLabel = [
            hasKm ? fmt.dist(item.km_interval) : null,
            hasMonths ? `${item.months_interval} mois` : null,
          ].filter(Boolean).join(' ou ');

          const costMin = item.estimated_cost_min;
          const costMax = item.estimated_cost_max;
          // ⚠️ Ces fourchettes viennent du catalogue (maintenance_intervals.json),
          // qui porte des tarifs FRANÇAIS. Elles sont écrites avec le symbole de
          // l'instance sans conversion — c'est un ordre de grandeur, pas un devis,
          // et c'est la raison du CountryBadge posé à côté. Un second pays
          // apportera ses propres tarifs plutôt qu'un taux de change.
          const costLabel = costMin && costMax
            ? (costMin === costMax ? fmt.money(costMin) : `${fmt.money(costMin)} – ${fmt.money(costMax)}`)
            : '—';

          // Le contrôle technique est éditable lui aussi : sa périodicité peut
          // être fixée à la main (véhicule de collection, autre pays), à défaut
          // de quoi le calendrier réglementaire français s'applique.
          const editable = canEdit && Boolean(item.intervention_key);

          // Un entretien personnalisé porte le libellé saisi par l'utilisateur :
          // le passer au dictionnaire de traduction le renommerait au premier
          // homonyme approchant.
          const title = item.is_custom
            ? item.intervention_type
            : getInterventionDisplayName(item.intervention_type);

          return (
            <article
              key={idx}
              className="card"
              style={{ padding: 0, overflow: 'hidden', borderLeft: `3px solid ${st.color}` }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4" style={{ padding: '14px 16px' }}>
                <div className="min-w-0" style={{ flex: '1 1 300px' }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 style={{ color: 'var(--text-1)' }}>{title}</h4>
                    {isInspection(item.intervention_key) && (
                      <CountryBadge reason="Le calendrier du contrôle technique est fixé par la réglementation du pays de l'instance." />
                    )}
                    <StatusBadge status={item.status} />
                    {item.is_custom ? (
                      <span className="badge badge-info" title="Entretien ajouté pour ce véhicule">
                        <Icon name="plus" size={11} strokeWidth={2.2} />
                        Ajouté
                      </span>
                    ) : item.has_override && (
                      <span className="badge badge-info" title="Intervalle personnalisé pour ce véhicule">
                        <Icon name="pencil" size={11} strokeWidth={2.2} />
                        Personnalisé
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>
                    {hasKm || hasMonths
                      ? `Tous les ${intervalLabel}`
                      : item.condition_based ? 'Selon l’usage'
                      : isInspection(item.intervention_key) ? 'Calendrier réglementaire'
                      : 'Aucun critère d’intervalle actif'}
                  </p>

                  {item.never_recorded && (
                    <p className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 3 }}>
                      <Icon name="info" size={13} />
                      Jamais enregistré — échéance estimée depuis l'année du véhicule
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="inset flex items-center self-start" style={{ padding: '8px 0' }}>
                    {!item.condition_based && (
                      <>
                        <Stat label="Distance" value={formatDistance(item.km_remaining, fmt)} />
                        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
                        <Stat label="Temps" value={formatDays(item.days_remaining)} />
                        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
                      </>
                    )}
                    <Stat label="Coût est." value={costLabel} color="var(--success)" />
                  </div>

                  {/* Bouton édition intervalle — masqué sur un véhicule
                      partagé qu'on ne possède pas */}
                  {editable && (
                    <button
                      onClick={() => setEditingItem(item)}
                      className="btn-icon"
                      title="Modifier l'intervalle"
                      aria-label={`Modifier l'intervalle de ${title}`}
                      style={{ color: item.has_override ? 'var(--accent)' : undefined }}
                    >
                      <Icon name="pencil" size={16} />
                    </button>
                  )}
                </div>
              </div>

              {!item.condition_based && (item.next_due_mileage || item.next_due_date) && (
                <div style={{ padding: '8px 16px', background: 'var(--bg-inset)', borderTop: '1px solid var(--border-light)' }}>
                  <p className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                    <Icon name="calendar" size={13} />
                    Prochaine échéance :{' '}
                    {item.next_due_mileage ? fmt.dist(item.next_due_mileage) : ''}
                    {item.next_due_mileage && item.next_due_date ? ' · ' : ''}
                    {item.next_due_date
                      ? formatDueDate(item.next_due_date, fmt)
                      : (item.next_due_mileage ? '' : 'sans échéance')}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {disabledSection}
      {modals}
    </>
  );
});
