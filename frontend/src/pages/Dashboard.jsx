import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useFormat, useT } from '../lib/preferencesContext';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import VehiclePhoto from '../components/VehiclePhoto';
import Notice from '../components/Notice';
import { getInterventionDisplayName } from '../lib/interventionTranslations';

/**
 * Ce qu'il reste avant l'échéance, en une phrase courte.
 *
 * Même règle que dans « À venir » : on annonce la contrainte qui tombera la
 * première, pas les deux — « dans 8 950 km ou 11 mois » demande au lecteur
 * de faire le tri lui-même.
 */
function remainingLabel(item) {
  const num = (v) => (v == null || v === 999999 || v === Infinity ? null : v);
  const days = num(item.days_remaining);

  if (item.status === 'overdue') {
    if (days != null && days < 0) {
      const d = Math.abs(Math.round(days));
      if (d > 365) return `depuis ${Math.floor(d / 365)} an${Math.floor(d / 365) > 1 ? 's' : ''}`;
      if (d > 30) return `depuis ${Math.floor(d / 30)} mois`;
      return `depuis ${d} j`;
    }
    return 'en retard';
  }

  if (days == null) return null;
  const d = Math.round(days);
  if (d <= 0) return 'aujourd’hui';
  if (d === 1) return 'demain';
  if (d > 365) return `dans ${Math.floor(d / 365)} an${Math.floor(d / 365) > 1 ? 's' : ''}`;
  if (d > 60) return `dans ${Math.round(d / 30)} mois`;
  return `dans ${d} j`;
}

export default function Dashboard({ onSelectVehicle, currentUser }) {
  const fmt = useFormat();
  const t = useT();
  const [data, setData] = useState(null);
  // Le planning global : c'est lui qui porte les échéances, intervention par
  // intervention. Le tableau de bord ne servait que des décomptes — il disait
  // « 12 en retard » sans jamais dire lesquels, alors que c'est la question
  // qui amène quelqu'un ici.
  const [planning, setPlanning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      // Deux requêtes en parallèle : le planning n'est pas indispensable à
      // l'écran, son échec ne doit pas emporter le reste.
      const [res, plan] = await Promise.all([
        api.getDashboard(),
        api.getPlanning().catch(() => null),
      ]);
      setData(res.data);
      setPlanning(plan?.data || null);
      setError(null);
    } catch (err) {
      setError(t('Impossible de charger le tableau de bord'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="spinner mx-auto mb-3"></div>
        <p style={{ color: 'var(--text-2)' }} className="text-sm">{t('Chargement du tableau de bord…')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center" style={{ padding: '40px 16px' }}>
        <div className="icon-box lg danger mx-auto" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={20} />
        </div>
        <p style={{ color: 'var(--text-2)' }}>{error}</p>
        <button onClick={fetchDashboard} className="btn btn-primary mt-4">
          <Icon name="refresh" size={16} />
          Réessayer
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Pas d'alias local autour du formateur de montants : `fmtEuro` en était
  // un, et il faisait passer ce fichier au travers du grep de contrôle des
  // devises documenté au §20.6, qui cherche le nom de la fonction elle-même.
  const mixed = fmt.isMixed(data.cost_by_currency);
  // Les cinq échéances les plus pressantes, mais **une par véhicule
  // d'abord** : trié par pure urgence, le panneau affichait cinq lignes du
  // même véhicule et taisait les deux autres. Le planning arrive déjà trié,
  // on ne fait que le dérouler en deux passes.
  const priorityItems = planning?.items || [];
  const priority = (() => {
    const seen = new Set();
    const firstOfEach = [];
    const others = [];
    for (const item of priorityItems) {
      if (seen.has(item.vehicle_id)) others.push(item);
      else { seen.add(item.vehicle_id); firstOfEach.push(item); }
    }
    return [...firstOfEach, ...others].slice(0, 5);
  })();

  return (
    <div>
      <PageHeader
        title={t('Tableau de bord')}
        subtitle={currentUser?.display_name
          ? t("Vue d'ensemble du garage de {name}", { name: currentUser.display_name })
          : t("Vue d'ensemble du garage")}
      />

      {/* État du parc — une phrase, puis les mesures.

          Le bloc « Alertes » a disparu : il énumérait, véhicule par véhicule,
          exactement ce que les lignes juste en dessous répètent, et ce que la
          liste des véhicules affiche une troisième fois. Le décompte total
          suffit ici ; le détail est dans la ligne du véhicule concerné. */}
      {(() => {
        const alerts = data.alert_details || [];
        const overdue = alerts.filter(a => a.type === 'overdue').reduce((s, a) => s + a.count, 0);
        const urgent  = alerts.filter(a => a.type === 'urgent').reduce((s, a) => s + a.count, 0);
        const touched = new Set(alerts.filter(a => a.type === 'overdue').map(a => a.vehicle_id)).size;

        const state = overdue > 0
          ? { n: overdue, tone: 'danger', icon: 'alertCircle',
              txt: overdue > 1 ? t('entretiens en retard') : t('entretien en retard'),
              hint: touched > 1 ? t('Répartis sur {count} véhicules', { count: touched }) : null }
          : urgent > 0
          ? { n: urgent, tone: 'warning', icon: 'alert',
              txt: urgent > 1 ? t('entretiens urgents') : t('entretien urgent'), hint: null }
          : { n: null, tone: 'success', icon: 'checkCircle', txt: t('Tout le parc est à jour'), hint: null };

        return (
          <section className="card mb-6" style={{ padding: '16px 18px' }}>
            <div className={`status-band tone-${state.tone} bare`}>
              <span className="status-band-icon"><Icon name={state.icon} size={18} /></span>
              <span>
                <span className="status-band-text">
                  {state.n != null ? `${state.n} ${state.txt}` : state.txt}
                </span>
                {state.hint && <span className="status-band-hint">{state.hint}</span>}
              </span>
            </div>

            <div className="metrics mt-4">
              <div>
                <div className="metric-l">{t('Véhicules')}</div>
                <div className="metric-v tabular">{fmt.num(data.total_vehicles)}</div>
              </div>
              <div>
                <div className="metric-l">{t('Distance totale')}</div>
                <div className="metric-v tabular">{fmt.dist(data.total_mileage)}</div>
              </div>
              <div>
                {/* Ventilé, jamais additionné à travers deux devises : « 400 »
                    pour 200 € et 200 $ est un chiffre faux qu'on ne recompte
                    jamais. */}
                <div className="metric-l">{t('Coût total')}</div>
                <div className="metric-v tabular">{fmt.totals(data.cost_by_currency)}</div>
                <div className="metric-s">
                  {t('Entretien')} {fmt.money(data.total_maintenance_cost)} · {t('Carburant')} {fmt.money(data.total_fuel_cost)}
                </div>
              </div>
              <div>
                {/* « — » et non « 0 € » quand aucun véhicule n'a de prix
                    d'achat : un parc sans prix saisi n'a pas une valeur de
                    zéro, il n'en a pas. */}
                <div className="metric-l">{t("Valeur d'achat")}</div>
                <div className="metric-v tabular">
                  {fmt.isMixed(data.fleet_purchase_by_currency) || data.fleet_purchase_price
                    ? fmt.totals(data.fleet_purchase_by_currency)
                    : '—'}
                </div>
                <div className="metric-s">{t("Prix d'achat cumulé du parc")}</div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Ce qu'il faut faire, et sur quoi.

          Le tableau de bord servait des décomptes — « 12 en retard » — sans
          jamais dire lesquels ni sur quel véhicule. Il fallait ouvrir chaque
          fiche pour l'apprendre. Les deux colonnes répondent aux deux
          questions qu'on se pose en arrivant : par quoi je commence, et
          comment va chaque véhicule. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        <div className="card p-4">
          <h3 className="section-title flex items-center gap-2" style={{ marginBottom: 10 }}>
            <Icon name="clipboard" size={16} style={{ color: 'var(--text-3)' }} />
            {t('À faire en premier')}
          </h3>

          {priority.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              {t('Aucune échéance à court terme.')}
            </p>
          ) : (
            <div className="rows bare">
              {priority.map((item, i) => {
                const late = item.status === 'overdue';
                const due = item.next_due_mileage
                  ? fmt.dist(item.next_due_mileage)
                  : item.estimated_date ? fmt.date(item.estimated_date)
                  : '—';
                return (
                  <div
                    key={`${item.vehicle_id}-${item.intervention_key || i}`}
                    className="row-item interactive"
                    onClick={() => onSelectVehicle(item.vehicle_id)}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectVehicle(item.vehicle_id); } }}
                  >
                    <span className={`dot ${late ? 'danger' : item.status === 'urgent' ? 'warning' : ''}`} aria-hidden="true" />
                    <div className="min-w-0" style={{ flex: 1 }}>
                      <div className="row-name text-ellipsis">
                        {getInterventionDisplayName(item.intervention_type)}
                      </div>
                      <div className="row-meta text-ellipsis">{item.vehicle_name}</div>
                    </div>
                    <div className={`row-value ${late ? 'late' : ''}`}>
                      {due}
                      <small>{remainingLabel(item)}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {priorityItems.length > priority.length && (
            <p className="field-hint" style={{ marginTop: 10 }}>
              {t('et {count} autres échéances, dans Planning', { count: priorityItems.length - priority.length })}
            </p>
          )}
        </div>

        <div className="card p-4">
          <h3 className="section-title flex items-center gap-2" style={{ marginBottom: 10 }}>
            <Icon name="car" size={16} style={{ color: 'var(--text-3)' }} />
            {t('Le parc')}
            <span className="group-meta">
              {data.vehicles.length} {data.vehicles.length > 1 ? t('véhicules') : t('véhicule')}
            </span>
          </h3>

          <div className="rows bare">
            {data.vehicles.map((v) => {
              const state = v.overdue_count > 0
                ? { dot: 'danger',  color: 'var(--danger)',  label: t('{count} en retard', { count: v.overdue_count }) }
                : v.urgent_count > 0
                ? { dot: 'warning', color: 'var(--warning)', label: v.urgent_count > 1 ? t('{count} urgents', { count: v.urgent_count }) : t('{count} urgent', { count: v.urgent_count }) }
                : v.warning_count > 0
                ? { dot: 'warning', color: 'var(--text-2)',  label: t('{count} à prévoir', { count: v.warning_count }) }
                : { dot: 'success', color: 'var(--text-3)',  label: t('À jour') };

              return (
                <div
                  key={v.id}
                  className="row-item interactive"
                  onClick={() => onSelectVehicle(v.id)}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectVehicle(v.id); } }}
                >
                  <div className="photo-container photo-thumb flex-shrink-0" style={{ width: 54 }}>
                    <Icon
                      name={v.vehicle_type === 'motorcycle' ? 'motorcycle' : 'car'}
                      size={20} strokeWidth={1.4}
                      style={{ color: 'var(--border-strong)', position: 'absolute' }}
                    />
                    {v.photo_url && (
                      <VehiclePhoto vehicleId={v.id} version={v.updated_at} alt={v.name} backdrop />
                    )}
                  </div>

                  <div className="min-w-0" style={{ flex: 1 }}>
                    <div className="row-name text-ellipsis">{v.name}</div>
                    <div className="row-meta text-ellipsis">
                      {/* Le nom du véhicule est le plus souvent « marque modèle » :
                          le réécrire juste en dessous n'apprend rien. */}
                      {[
                        `${v.brand} ${v.model}`.trim() === (v.name || '').trim()
                          ? null
                          : `${v.brand} ${v.model}`,
                        v.year,
                        fmt.dist(v.current_mileage),
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                    <span className={`dot ${state.dot}`} aria-hidden="true" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: state.color, whiteSpace: 'nowrap' }}>
                      {state.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Les deux colonnes du bas.

          `items-start` laissait chaque carte à sa hauteur naturelle : celle
          des graphiques descendait 110 px plus bas que celle de l'activité,
          et le bas de la page finissait en marche d'escalier — c'est ce qui
          « dépassait ». Les cartes s'étirent donc à la même hauteur. Rien ne
          s'étire à l'intérieur : les graphiques restent en haut de leur
          carte, sinon on retrouve le vide de 400 px corrigé plus tôt. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Activity */}
        <div className="card p-4">
          <h3 className="section-title flex items-center gap-2" style={{ marginBottom: 10 }}>
            <Icon name="clock" size={16} style={{ color: 'var(--text-3)' }} />
            {t('Activité récente')}
          </h3>
          {data.recent_activity.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>{t('Aucune activité')}</p>
          ) : (
            <div className="rows bare">
              {data.recent_activity.map((a) => (
                <div
                  key={a.id}
                  className="row-item interactive"
                  onClick={() => onSelectVehicle(a.vehicle_id)}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectVehicle(a.vehicle_id); } }}
                >
                  <div className="min-w-0" style={{ flex: 1 }}>
                    <div className="row-name text-ellipsis">{a.intervention_type}</div>
                    <div className="row-meta text-ellipsis">{a.vehicle_name}</div>
                  </div>
                  <div className="row-value" style={{ color: 'var(--text-2)' }}>
                    {a.cost_paid != null ? fmt.money(a.cost_paid, a.currency) : ''}
                    <small>{fmt.date(a.execution_date)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        
        <div className="card p-4 flex flex-col gap-5">
          <CostCharts monthlyCosts={data.monthly_costs} mixed={mixed} />
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant graphiques : mensuel (année sélectionnable) + annuel
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
// Sous l'axe, une abréviation ; dans une phrase, le mois s'écrit en entier —
// « mois le plus cher : Aoû » se lit comme une coquille.
const MONTH_NAMES_FULL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function CostCharts({ monthlyCosts, mixed }) {
  const t = useT();
  const fmt = useFormat();

  // Construire les données par année et par mois depuis monthlyCosts
  // monthlyCosts = [{ month: "2024-03", cost: 150 }, ...]
  const byYearMonth = {};
  const years = new Set();

  for (const { month, cost } of monthlyCosts) {
    const [year, mon] = month.split('-');
    years.add(year);
    if (!byYearMonth[year]) byYearMonth[year] = {};
    byYearMonth[year][parseInt(mon) - 1] = (byYearMonth[year][parseInt(mon) - 1] || 0) + cost;
  }

  const sortedYears = [...years].sort();
  const currentYear = String(new Date().getFullYear());

  const [selectedYear, setSelectedYear] = useState(
    sortedYears.includes(currentYear) ? currentYear : sortedYears[sortedYears.length - 1] || currentYear
  );

  // Données mensuelles pour l'année sélectionnée — 12 mois fixes
  const monthlyData = MONTH_LABELS.map((label, i) => ({
    label,
    fullLabel: MONTH_NAMES_FULL[i],
    cost: byYearMonth[selectedYear]?.[i] || 0,
  }));

  // Données annuelles — total par année
  const annualData = sortedYears.map(year => ({
    label: year,
    cost: Object.values(byYearMonth[year] || {}).reduce((a, b) => a + b, 0),
  }));

  const yearTotal = monthlyData.reduce((a, b) => a + b.cost, 0);
  const peak = monthlyData.reduce((m, d) => (d.cost > m.cost ? d : m), monthlyData[0]);

  const maxMonthly = Math.max(...monthlyData.map(d => d.cost), 1);
  const maxAnnual = Math.max(...annualData.map(d => d.cost), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Une barre est une somme, et une somme ne traverse pas deux devises.
          Les ventiler ferait deux barres par mois et casserait la lecture ;
          on additionne donc, et on le dit — même arbitrage que pour les
          répartitions par catégorie de la fiche véhicule. */}
      {/* Graphique mensuel */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title flex items-center gap-2">
            <Icon name="calendar" size={16} style={{ color: 'var(--text-3)' }} />
            {t('Dépenses mensuelles')}
          </h3>
          {sortedYears.length > 1 && (
            <div className="flex gap-1">
              {sortedYears.map(y => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`btn btn-sm ${selectedYear === y ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ minHeight: 26, padding: '0 9px', fontSize: 12 }}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
        {yearTotal > 0 && (
          <p className="field-hint" style={{ marginTop: -4, marginBottom: 10 }}>
            {fmt.money(yearTotal)} {t('sur l’année')} · {fmt.money(yearTotal / 12)}{t('/mois')} {t('en moyenne')}
            {peak && peak.cost > 0 && ` · ${t('mois le plus cher')} : ${t(peak.fullLabel)} (${fmt.money(peak.cost)})`}
          </p>
        )}
        <BarChart data={monthlyData} max={maxMonthly} money={fmt.money} height={160} />
      </div>

      {/* Séparateur */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Graphique annuel */}
      <div>
        <h3 className="section-title flex items-center gap-2" style={{ marginBottom: 10 }}>
          <Icon name="trendUp" size={16} style={{ color: 'var(--text-3)' }} />
          {t('Dépenses annuelles')}
        </h3>
        <div>
          {annualData.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>{t('Aucune donnée')}</p>
          ) : (
            <BarChart data={annualData} max={maxAnnual} money={fmt.money} height={120} accentOpacity={0.75} />
          )}
        </div>
      </div>

      {/* Une barre est une somme, et une somme ne traverse pas deux devises.
          Les ventiler ferait deux barres par mois et casserait la lecture ;
          on additionne donc, et on le dit. */}
      {mixed && (
        <Notice tone="warning">
          {t('Ces graphiques additionnent des montants saisis dans des devises différentes. Les totaux du haut de page, eux, restent ventilés.')}
        </Notice>
      )}
    </div>
  );
}

// Graphique à barres générique
// minBarWidth : si défini, active le scroll horizontal avec une largeur fixe par barre
function BarChart({ data, max, money, height = 160, accentOpacity = 0.6, minBarWidth = null }) {
  const [hovered, setHovered] = useState(null);

  // Largeur totale minimale si scroll activé
  const scrollWidth = minBarWidth ? data.length * (minBarWidth + 4) : null;
  const useScroll = scrollWidth !== null;

  // Position du tooltip en px si scroll, en % sinon
  const tooltipLeft = hovered !== null
    ? useScroll
      ? `${(hovered + 0.5) * (minBarWidth + 4)}px`
      : `${((hovered + 0.5) / data.length) * 100}%`
    : '0';

  const inner = (
    <div style={{ position: 'relative', width: scrollWidth ? `${scrollWidth}px` : '100%' }}>
      {/* Tooltip */}
      {hovered !== null && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '0.4rem',
            padding: '3px 10px',
            textAlign: 'center',
            pointerEvents: 'none',
            left: tooltipLeft,
            transform: 'translateX(-50%)',
            top: '-4px',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-1)' }}>{money(data[hovered].cost)}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>{data[hovered].label}</div>
        </div>
      )}

      {/* Grille chiffrée.

          Le graphique n'avait ni ligne de base ni échelle : on voyait des
          barres, on ne lisait aucune valeur sans les survoler — et sur un
          téléphone, il n'y a pas de survol. Deux repères (maximum et moitié)
          suffisent à donner l'ordre de grandeur au repos. */}
      <div style={{ position: 'absolute', inset: `28px 0 ${useScroll ? 0 : 0}px 0`, pointerEvents: 'none' }}>
        {[1, 0.5, 0].map(ratio => (
          <div
            key={ratio}
            style={{
              position: 'absolute',
              left: 0, right: 0,
              top: `${(1 - ratio) * height}px`,
              borderTop: `1px ${ratio === 0 ? 'solid' : 'dashed'} var(--border)`,
            }}
          >
            {ratio > 0 && !useScroll && (
              <span
                style={{
                  position: 'absolute', right: 0, top: -14,
                  fontSize: 10, color: 'var(--text-3)',
                  background: 'var(--bg-surface)', padding: '0 3px',
                }}
              >
                {money(Math.round(max * ratio))}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Barres */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '4px',
          height: `${height + 24}px`,
          paddingTop: '28px',
        }}
      >
        {data.map((d, i) => {
          const barH = max > 0 ? Math.max(d.cost > 0 ? 3 : 0, (d.cost / max) * height) : 0;
          const isActive = hovered === i;
          return (
            <div
              key={i}
              style={{
                flex: useScroll ? 'none' : 1,
                width: useScroll ? `${minBarWidth}px` : undefined,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div
                style={{
                  width: '100%',
                  // Deux barres dans une carte large deviendraient deux pavés
                  // de 300 px : une barre reste une barre.
                  maxWidth: 72,
                  height: `${barH}px`,
                  background: 'var(--accent)',
                  opacity: isActive ? 1 : accentOpacity,
                  borderRadius: '3px 3px 0 0',
                  transition: 'opacity 0.15s, transform 0.15s',
                  transform: isActive ? 'scaleX(1.08)' : 'scaleX(1)',
                  minWidth: '6px',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
        {data.map((d, i) => (
          <div
            key={i}
            style={{
              flex: useScroll ? 'none' : 1,
              width: useScroll ? `${minBarWidth}px` : undefined,
              textAlign: 'center',
              fontSize: '0.62rem',
              fontWeight: 500,
              color: hovered === i ? 'var(--text-1)' : 'var(--text-3)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );

  if (useScroll) {
    return (
      <div style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: '2px' }}>
        {inner}
      </div>
    );
  }

  return inner;
}