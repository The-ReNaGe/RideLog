import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import { getShortInterventionName } from '../lib/interventionTranslations';
import { useFormat, useT, usePreferences } from '../lib/preferencesContext';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';

// Passés à t() au rendu — déclarés ici pour l'audit des traductions.
// i18n: 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
// i18n: 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'
// i18n: 'En retard', 'Urgent', 'À surveiller', 'Planifié'
const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const STATUSES = [
  { key: 'overdue', label: 'En retard',    color: 'var(--danger)' },
  { key: 'urgent',  label: 'Urgent',       color: 'var(--warning)' },
  { key: 'warning', label: 'À surveiller', color: 'var(--purple)' },
  { key: 'ok',      label: 'Planifié',     color: 'var(--success)' },
];

const statusOf = (status) => STATUSES.find(s => s.key === status) || STATUSES[3];
const getStatusColor = (status) => statusOf(status).color;

/** Pastille de couleur — la légende du calendrier s'appuie sur la même. */
function StatusDot({ status, size = 8 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0,
        background: getStatusColor(status), display: 'inline-block',
      }}
    />
  );
}

function CalendarDay({ day, isCurrentMonth, isToday, items, onDayClick }) {
  if (!day) {
    return <div className="calendar-cell calendar-cell-empty" />;
  }

  const hasItems = items && items.length > 0;
  const worstStatus = hasItems
    ? items.reduce((worst, item) => {
        const order = { overdue: 0, urgent: 1, warning: 2, ok: 3 };
        return order[item.status] < order[worst] ? item.status : worst;
      }, 'ok')
    : null;

  return (
    <div
      className={`calendar-cell${!isCurrentMonth ? ' calendar-cell-other' : ''}${isToday ? ' calendar-cell-today' : ''}${hasItems ? ' calendar-cell-has-items' : ''}`}
      onClick={() => hasItems && onDayClick(day, items)}
      style={{ cursor: hasItems ? 'pointer' : 'default' }}
    >
      <div className="calendar-day-number" style={isToday ? { background: 'var(--accent)', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}}>
        {day.getDate()}
      </div>
      {hasItems && (
        <div className="calendar-day-items">
          {items.slice(0, 3).map((item, i) => (
            <div
              key={i}
              className="calendar-item-dot"
              style={{ background: getStatusColor(item.status), color: '#fff', fontSize: '10px', padding: '1px 4px', borderRadius: 3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '14px' }}
              title={`${item.vehicle_name} - ${getShortInterventionName(item.intervention_type)}`}
            >
              {getShortInterventionName(item.intervention_type)}
            </div>
          ))}
          {items.length > 3 && (
            <div style={{ fontSize: '10px', color: 'var(--text-3)', textAlign: 'center' }}>
              +{items.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DayDetailModal({ date, items, onClose }) {
  const fmt = useFormat();
  const t = useT();
  const { currencySymbol } = usePreferences();
  if (!date || !items) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(12,15,22,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
      onClick={onClose}>
      <div className="card" style={{ maxWidth: 500, width: '100%', maxHeight: '80vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="flex items-center gap-2" style={{ margin: 0, fontSize: '1.05rem' }}>
            <Icon name="calendar" size={17} style={{ color: 'var(--text-3)' }} />
            <span style={{ textTransform: 'capitalize' }}>
              {fmt.date(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </h3>
          <button onClick={onClose} className="btn-icon" aria-label="Fermer">
            <Icon name="close" size={16} strokeWidth={2.2} />
          </button>
        </div>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="inset" style={{ padding: 12, borderLeft: `3px solid ${getStatusColor(item.status)}` }}>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="badge badge-neutral">
                  <Icon name={item.vehicle_type === 'car' ? 'car' : 'motorcycle'} size={12} />
                  {item.vehicle_name}
                </span>
                <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: getStatusColor(item.status), fontWeight: 700 }}>
                  <StatusDot status={item.status} size={7} />
                  {t(statusOf(item.status).label)}
                </span>
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 14 }}>{getShortInterventionName(item.intervention_type)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                {item.km_remaining != null && item.km_remaining !== 999999 && (
                  <span style={item.km_remaining < 0 ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                    {item.km_remaining < 0
                      ? `${fmt.dist(Math.abs(item.km_remaining))} de retard`
                      : `Dans ${fmt.dist(item.km_remaining)}`}
                  </span>
                )}
                {item.estimated_cost_max && (
                  <span className="tabular" style={{ marginLeft: 12, color: 'var(--success)', fontWeight: 600 }}>
                    {item.estimated_cost_min} – {item.estimated_cost_max} {currencySymbol}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Planning() {
  const t = useT();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedItems, setSelectedItems] = useState(null);

  useEffect(() => {
    loadPlanning();
  }, []);

  const loadPlanning = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getPlanning();
      setItems(res.data.items || []);
    } catch (err) {
      console.error('Failed to load planning', err);
      setError(err.response?.data?.detail || t('Erreur de chargement'));
    } finally {
      setLoading(false);
    }
  };

  // Group items by date string (YYYY-MM-DD)
  const itemsByDate = useMemo(() => {
    const map = {};
    for (const item of items) {
      if (!item.estimated_date) continue;
      if (!map[item.estimated_date]) map[item.estimated_date] = [];
      map[item.estimated_date].push(item);
    }
    return map;
  }, [items]);

  // Build calendar grid for current month
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    // Monday = 0 in our grid
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6; // Sunday → 6
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      cells.push({ date: d, isCurrentMonth: false });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    // Next month padding to fill 6 rows
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
    }
    return cells;
  }, [currentMonth]);

  // Summary counts for displayed info
  const summary = useMemo(() => {
    const overdue = items.filter(i => i.status === 'overdue');
    const urgent = items.filter(i => i.status === 'urgent');
    // Items in current month
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthItems = items.filter(i => {
      if (!i.estimated_date) return false;
      const d = new Date(i.estimated_date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    return { overdue, urgent, monthItems };
  }, [items, currentMonth]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToToday = () => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));

  const handleDayClick = (date, dayItems) => {
    setSelectedDay(date);
    setSelectedItems(dayItems);
  };

  if (loading) {
    return <div className="text-center py-12" style={{ color: 'var(--text-2)' }}>{t('Chargement du planning…')}</div>;
  }

  if (error) {
    return (
      <div className="card text-center" style={{ padding: '40px 16px' }}>
        <div className="icon-box lg danger mx-auto" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={20} />
        </div>
        <p style={{ color: 'var(--text-2)' }}>{error}</p>
        <button onClick={loadPlanning} className="btn btn-primary mt-4">
          <Icon name="refresh" size={16} />
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Planning')}
        subtitle={t('Toutes les échéances de votre parc, mois par mois.')}
      />

      {/* Résumé */}
      <div className="flex flex-wrap gap-3">
        {[
          summary.overdue.length > 0 && { n: summary.overdue.length, label: summary.overdue.length > 1 ? 'en retard' : 'en retard', color: 'var(--danger)', icon: 'alertCircle' },
          summary.urgent.length > 0 && { n: summary.urgent.length, label: summary.urgent.length > 1 ? 'urgents' : 'urgent', color: 'var(--warning)', icon: 'alert' },
          { n: summary.monthItems.length, label: 'ce mois', color: 'var(--accent)', icon: 'calendar' },
        ].filter(Boolean).map(b => (
          <div key={b.label} className="card flex items-center gap-3" style={{ padding: '10px 14px', borderLeft: `3px solid ${b.color}` }}>
            <Icon name={b.icon} size={17} style={{ color: b.color }} />
            <span className="tabular" style={{ color: b.color, fontWeight: 800, fontSize: 19 }}>{b.n}</span>
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{b.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar header with navigation */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={prevMonth} className="btn-icon" aria-label={t('Mois précédent')} title={t('Mois précédent')}>
            <Icon name="chevronLeft" size={17} strokeWidth={2} />
          </button>
          <div className="flex items-center gap-3">
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
              {t(MONTH_NAMES[currentMonth.getMonth()])} {currentMonth.getFullYear()}
            </h2>
            {(currentMonth.getMonth() !== today.getMonth() || currentMonth.getFullYear() !== today.getFullYear()) && (
              <button onClick={goToToday} className="btn btn-secondary btn-sm">
                Aujourd'hui
              </button>
            )}
          </div>
          <button onClick={nextMonth} className="btn-icon" aria-label={t('Mois suivant')} title={t('Mois suivant')}>
            <Icon name="chevronRight" size={17} strokeWidth={2} />
          </button>
        </div>

        {/* Day name headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {DAY_NAMES.map(d => (
            <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' }}>
              {t(d)}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {calendarDays.map((cell, i) => {
            const dateStr = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, '0')}-${String(cell.date.getDate()).padStart(2, '0')}`;
            const dayItems = itemsByDate[dateStr] || [];
            const cellDate = new Date(cell.date);
            cellDate.setHours(0, 0, 0, 0);
            const isToday = cellDate.getTime() === today.getTime();

            return (
              <CalendarDay
                key={i}
                day={cell.date}
                isCurrentMonth={cell.isCurrentMonth}
                isToday={isToday}
                items={dayItems}
                onDayClick={handleDayClick}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
        {STATUSES.map(st => (
          <span key={st.key} className="inline-flex items-center gap-1.5">
            <StatusDot status={st.key} />
            {t(st.label)}
          </span>
        ))}
      </div>

      {/* Day detail modal */}
      {selectedDay && selectedItems && (
        <DayDetailModal
          date={selectedDay}
          items={selectedItems}
          onClose={() => { setSelectedDay(null); setSelectedItems(null); }}
        />
      )}
    </div>
  );
}
