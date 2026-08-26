import React from 'react';
import Icon from './Icon';

/**
 * Catégorie d'une intervention — entretien, réparation, modification.
 *
 * Défini une seule fois : la table de correspondance était recopiée dans
 * `VehicleDetail` et `MaintenanceHistory`, avec des tailles et des couleurs
 * qui avaient déjà divergé.
 */
export const CATEGORIES = {
  scheduled:    { icon: 'wrench',  label: 'Entretien',    color: 'var(--accent)',  light: 'var(--accent-light)' },
  repair:       { icon: 'alert',   label: 'Réparation',   color: 'var(--warning)', light: 'var(--warning-light)' },
  modification: { icon: 'sliders', label: 'Modification', color: 'var(--purple)',  light: 'var(--purple-light)' },
};

export const getCategory = (key) => CATEGORIES[key] || CATEGORIES.scheduled;

export default function CategoryTag({ category }) {
  const cat = typeof category === 'string' ? getCategory(category) : category;
  return (
    <span className="badge" style={{ background: cat.light, color: cat.color }}>
      <Icon name={cat.icon} size={12} strokeWidth={2} />
      {cat.label}
    </span>
  );
}
