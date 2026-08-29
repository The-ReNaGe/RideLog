import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useFormat, useT } from '../lib/preferencesContext';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import VehiclePhoto from '../components/VehiclePhoto';

export default function Dashboard({ onSelectVehicle, currentUser }) {
  // `fmt` est déjà pris par le formateur de nombres du tableau de bord.
  const u = useFormat();
  const t = useT();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.getDashboard();
      setData(res.data);
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

  const fmt = (n) => new Intl.NumberFormat(u.locale).format(n);
  const fmtEuro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  return (
    <div>
      <PageHeader
        title={t('Tableau de bord')}
        subtitle={currentUser?.display_name
          ? t("Vue d'ensemble du garage de {name}", { name: currentUser.display_name })
          : t("Vue d'ensemble du garage")}
      />

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { icon: 'car',   label: t('Véhicules'),     value: fmt(data.total_vehicles) },
          { icon: 'euro',  label: t('Coût total'),    value: fmtEuro(data.total_cost),
            sub: `Entretien ${fmtEuro(data.total_maintenance_cost)} · Carburant ${fmtEuro(data.total_fuel_cost)}` },
          { icon: 'gauge', label: t('Distance totale'), value: u.dist(data.total_mileage) },
          { icon: 'package', label: t("Valeur d'achat"), value: data.fleet_purchase_price ? fmtEuro(data.fleet_purchase_price) : '—',
            sub: "Prix d'achat cumulé du parc" },
        ].map(kpi => (
          <div key={kpi.label} className="card" style={{ padding: 16 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <Icon name={kpi.icon} size={15} style={{ color: 'var(--text-3)' }} />
              <span className="card-label" style={{ marginBottom: 0 }}>{kpi.label}</span>
            </div>
            <div className="stat-number" style={{ fontSize: 24 }}>{kpi.value}</div>
            {kpi.sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* Alerts Row */}
      {data.alert_details && data.alert_details.length > 0 && (
        <div className="card mb-5">
          <h3 className="section-title flex items-center gap-2" style={{ marginBottom: 10 }}>
            <Icon name="bell" size={16} style={{ color: 'var(--text-3)' }} />
            {t('Alertes')}
          </h3>
          <div className="space-y-2">
            {data.alert_details.map((alert, i) => {
              const cfg = alert.type === 'overdue'
                ? { icon: 'alertCircle', label: t('en retard'), color: 'var(--danger)' }
                : alert.type === 'urgent'
                ? { icon: 'alert', label: t('urgent'), color: 'var(--warning)' }
                : { icon: 'clock', label: t('à prévoir'), color: 'var(--accent)' };
              return (
                <button
                  key={i}
                  className="inset flex items-center justify-between gap-3 w-full text-left"
                  style={{ padding: '10px 12px', borderLeft: `3px solid ${cfg.color}`, cursor: 'pointer' }}
                  onClick={() => onSelectVehicle(alert.vehicle_id)}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon name={cfg.icon} size={16} style={{ color: cfg.color }} />
                    <span className="font-bold text-sm text-ellipsis" style={{ color: 'var(--text-1)' }}>{alert.vehicle_name}</span>
                  </span>
                  <span className="text-xs font-bold" style={{ color: cfg.color, whiteSpace: 'nowrap' }}>
                    {alert.count} {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Vehicles Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {data.vehicles.map((v) => {
          // L'état colore une réglette à gauche, pas tout le contour : quatre
          // cartes cerclées de rouge et de vert font un damier, pas une liste.
          const state = v.overdue_count > 0
            ? { color: 'var(--danger)',  tone: 'danger',  icon: 'alertCircle', label: t('{count} en retard', { count: v.overdue_count }) }
            : v.urgent_count > 0
            ? { color: 'var(--warning)', tone: 'warning', icon: 'alert',       label: t('{count} urgent(s)', { count: v.urgent_count }) }
            : v.warning_count > 0
            ? { color: 'var(--warning)', tone: 'warning', icon: 'clock',       label: t('{count} à prévoir', { count: v.warning_count }) }
            : { color: 'var(--success)', tone: 'success', icon: 'checkCircle', label: t('À jour') };

          return (
            <article
              key={v.id}
              className="card card-interactive"
              style={{ borderLeft: `3px solid ${state.color}` }}
              onClick={() => onSelectVehicle(v.id)}
              role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectVehicle(v.id); } }}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="photo-container photo-thumb flex-shrink-0">
                  <Icon
                    name={v.vehicle_type === 'motorcycle' ? 'motorcycle' : 'car'}
                    size={24} strokeWidth={1.4}
                    style={{ color: 'var(--border-strong)', position: 'absolute' }}
                  />
                  {v.photo_url && (
                    <VehiclePhoto vehicleId={v.id} version={v.updated_at} alt={v.name} backdrop />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-ellipsis" style={{ color: 'var(--text-1)', fontSize: 15 }}>{v.name}</div>
                  <div className="text-ellipsis" style={{ color: 'var(--text-3)', fontSize: 13 }}>{v.brand} {v.model} · {v.year}</div>
                  <div className="tabular" style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}>{u.dist(v.current_mileage)}</div>
                </div>
                <span className={`icon-box sm ${state.tone}`} title={state.label}>
                  <Icon name={state.icon} size={15} />
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: t('Dépenses'),     value: fmtEuro(v.total_cost),  color: 'var(--text-1)' },
                  { label: t("Prix d'achat"), value: v.purchase_price ? fmtEuro(v.purchase_price) : '—', color: 'var(--text-1)' },
                  { label: t('État'),         value: state.label,            color: state.color },
                ].map(cell => (
                  <div key={cell.label} className="inset" style={{ padding: '9px 6px' }}>
                    <div className="tabular text-sm font-bold text-ellipsis" style={{ color: cell.color }}>{cell.value}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{cell.label}</div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      {/* Bottom row: Recent Activity + Charts — items-stretch pour aligner les hauteurs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* Recent Activity */}
        <div className="card p-4">
          <h3 className="section-title flex items-center gap-2" style={{ marginBottom: 10 }}>
            <Icon name="clock" size={16} style={{ color: 'var(--text-3)' }} />
            {t('Activité récente')}
          </h3>
          {data.recent_activity.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>{t('Aucune activité')}</p>
          ) : (
            <div className="space-y-2">
              {data.recent_activity.map((a) => (
                <button
                  key={a.id}
                  className="inset flex items-center justify-between gap-3 w-full text-left"
                  style={{ padding: '8px 10px', cursor: 'pointer' }}
                  onClick={() => onSelectVehicle(a.vehicle_id)}
                >
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{a.intervention_type}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>— {a.vehicle_name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.cost_paid != null && (
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>{fmtEuro(a.cost_paid)}</span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {new Date(a.execution_date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        
        <div className="card p-4 flex flex-col gap-5">
          <CostCharts monthlyCosts={data.monthly_costs} />
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant graphiques : mensuel (année sélectionnable) + annuel
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function CostCharts({ monthlyCosts }) {
  const fmtEuro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

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
    cost: byYearMonth[selectedYear]?.[i] || 0,
  }));

  // Données annuelles — total par année
  const annualData = sortedYears.map(year => ({
    label: year,
    cost: Object.values(byYearMonth[year] || {}).reduce((a, b) => a + b, 0),
  }));

  const maxMonthly = Math.max(...monthlyData.map(d => d.cost), 1);
  const maxAnnual = Math.max(...annualData.map(d => d.cost), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '1.25rem' }}>
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
        <BarChart data={monthlyData} max={maxMonthly} fmtEuro={fmtEuro} height={160} />
      </div>

      {/* Séparateur */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Graphique annuel — titre en haut, graphique en bas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 className="section-title flex items-center gap-2" style={{ marginBottom: 10 }}>
          <Icon name="trendUp" size={16} style={{ color: 'var(--text-3)' }} />
          {t('Dépenses annuelles')}
        </h3>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          {annualData.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>{t('Aucune donnée')}</p>
          ) : (
            <BarChart data={annualData} max={maxAnnual} fmtEuro={fmtEuro} height={120} accentOpacity={0.75} minBarWidth={36} />
          )}
        </div>
      </div>
    </div>
  );
}

// Graphique à barres générique
// minBarWidth : si défini, active le scroll horizontal avec une largeur fixe par barre
function BarChart({ data, max, fmtEuro, height = 160, accentOpacity = 0.6, minBarWidth = null }) {
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
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-1)' }}>{fmtEuro(data[hovered].cost)}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>{data[hovered].label}</div>
        </div>
      )}

      {/* Barres */}
      <div
        style={{
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