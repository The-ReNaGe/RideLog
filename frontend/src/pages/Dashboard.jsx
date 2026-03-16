import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Dashboard({ onSelectVehicle, currentUser }) {
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
      setError('Impossible de charger le dashboard');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="spinner mx-auto mb-3"></div>
        <p style={{ color: 'var(--text-2)' }} className="text-sm">Chargement du dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <button onClick={fetchDashboard} className="btn btn-primary mt-4">Réessayer</button>
      </div>
    );
  }

  if (!data) return null;

  const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);
  const fmtEuro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-1)' }}>
        📊 Dashboard — {currentUser?.display_name || 'Mon garage'}
      </h2>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4 text-center">
          <div className="card-label">Véhicules</div>
          <div className="stat-number">{data.total_vehicles}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="card-label">Coût total</div>
          <div className="stat-number" style={{ fontSize: '22px' }}>{fmtEuro(data.total_cost)}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            Entretien {fmtEuro(data.total_maintenance_cost)} • Carburant {fmtEuro(data.total_fuel_cost)}
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="card-label">Km totaux</div>
          <div className="stat-number" style={{ fontSize: '22px' }}>{fmt(data.total_mileage)}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="card-label">Valeur d'achat</div>
          <div className="stat-number" style={{ fontSize: '20px' }}>
            {data.fleet_purchase_price ? fmtEuro(data.fleet_purchase_price) : '—'}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>Prix d'achat total</div>
        </div>
      </div>

      {/* Alerts Row */}
      {data.alert_details && data.alert_details.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-1)' }}>⚠️ Alertes</h3>
          <div className="space-y-2">
            {data.alert_details.map((alert, i) => {
              const cfg = alert.type === 'overdue'
                ? { icon: '⛔', label: 'En retard', color: 'var(--danger)' }
                : alert.type === 'urgent'
                ? { icon: '🔴', label: 'Urgent', color: 'var(--warning)' }
                : { icon: '🟡', label: 'À prévoir', color: 'var(--accent)' };
              return (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded cursor-pointer"
                  style={{ background: 'var(--bg-base)', borderLeft: `4px solid ${cfg.color}` }}
                  onClick={() => onSelectVehicle(alert.vehicle_id)}
                >
                  <div className="flex items-center gap-2">
                    <span>{cfg.icon}</span>
                    <span className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{alert.vehicle_name}</span>
                  </div>
                  <span className="text-xs font-bold" style={{ color: cfg.color }}>{alert.count} {cfg.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vehicles Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {data.vehicles.map((v) => {
          const borderColor = v.overdue_count > 0 ? 'var(--danger)' : v.urgent_count > 0 ? 'var(--warning)' : v.warning_count > 0 ? '#f59e0b' : 'var(--success)';
          return (
            <div
              key={v.id}
              className="card p-5 cursor-pointer transition-transform hover:scale-[1.01]"
              style={{ border: `2px solid ${borderColor}` }}
              onClick={() => onSelectVehicle(v.id)}
            >
              <div className="flex items-start gap-4 mb-4">
                {v.photo_url ? (
                  <img src={v.photo_url} alt={v.name} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" style={{ background: 'var(--bg-base)' }} />
                ) : (
                  <div className="w-20 h-20 rounded-lg flex items-center justify-center flex-shrink-0 text-3xl" style={{ background: 'var(--bg-base)' }}>
                    {v.vehicle_type === 'motorcycle' ? '🏍️' : '🚗'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base" style={{ color: 'var(--text-1)' }}>{v.name}</div>
                  <div className="text-sm" style={{ color: 'var(--text-3)' }}>{v.brand} {v.model} • {v.year}</div>
                  <div className="text-sm" style={{ color: 'var(--text-2)' }}>{fmt(v.current_mileage)} km</div>
                </div>
                <div className="flex-shrink-0 text-lg">
                  {v.overdue_count > 0 ? '⛔' : v.urgent_count > 0 ? '🔴' : v.warning_count > 0 ? '🟡' : '✅'}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded" style={{ background: 'var(--bg-base)' }}>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{fmtEuro(v.total_cost)}</div>
                  <div className="text-xs" style={{ color: 'var(--text-3)' }}>Dépenses</div>
                </div>
                <div className="p-3 rounded" style={{ background: 'var(--bg-base)' }}>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{v.purchase_price ? fmtEuro(v.purchase_price) : '—'}</div>
                  <div className="text-xs" style={{ color: 'var(--text-3)' }}>Prix d'achat</div>
                </div>
                <div className="p-3 rounded" style={{ background: 'var(--bg-base)' }}>
                  {v.overdue_count > 0 ? (
                    <div className="text-sm font-bold" style={{ color: 'var(--danger)' }}>{v.overdue_count} retard{v.overdue_count > 1 ? 's' : ''}</div>
                  ) : v.urgent_count > 0 ? (
                    <div className="text-sm font-bold" style={{ color: 'var(--warning)' }}>{v.urgent_count} urgent{v.urgent_count > 1 ? 's' : ''}</div>
                  ) : v.warning_count > 0 ? (
                    <div className="text-sm font-bold" style={{ color: '#f59e0b' }}>{v.warning_count} à prévoir</div>
                  ) : (
                    <div className="text-sm font-bold" style={{ color: 'var(--success)' }}>À jour</div>
                  )}
                  <div className="text-xs" style={{ color: 'var(--text-3)' }}>État</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom row: Recent Activity + Charts — items-stretch pour aligner les hauteurs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* Recent Activity */}
        <div className="card p-4">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-1)' }}>🕐 Activité récente</h3>
          {data.recent_activity.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Aucune activité</p>
          ) : (
            <div className="space-y-2">
              {data.recent_activity.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-2 rounded cursor-pointer"
                  style={{ background: 'var(--bg-base)' }}
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
                </div>
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
          <h3 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>📅 Dépenses mensuelles</h3>
          {sortedYears.length > 1 && (
            <div className="flex gap-1">
              {sortedYears.map(y => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  style={{
                    fontSize: '0.72rem', fontWeight: 600,
                    padding: '2px 8px', borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: selectedYear === y ? 'var(--accent)' : 'var(--bg-base)',
                    color: selectedYear === y ? 'white' : 'var(--text-3)',
                    cursor: 'pointer',
                  }}
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
        <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text-1)' }}>📈 Dépenses annuelles</h3>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          {annualData.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Aucune donnée</p>
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
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