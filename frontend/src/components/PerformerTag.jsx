import React from 'react';
import Icon from './Icon';
import { useT } from '../lib/preferencesContext';

/**
 * Qui a réalisé l'intervention — un professionnel ou le propriétaire.
 *
 * Défini une seule fois, comme `CategoryTag` : le libellé apparaît dans
 * l'historique, le récapitulatif et le formulaire, et trois tables de
 * correspondance finiraient par diverger.
 *
 * Neutre, volontairement : ce n'est ni un état ni une alerte, et le badge de
 * catégorie porte déjà la seule couleur de la ligne (§23.2). Rien n'est rendu
 * quand la valeur manque — « non renseigné » n'a pas à s'afficher.
 */
// i18n: 'Professionnel', 'Soi-même'
export const PERFORMERS = {
  pro:  { icon: 'building', label: 'Professionnel' },
  self: { icon: 'user',     label: 'Soi-même' },
};

export default function PerformerTag({ performedBy }) {
  const t = useT();
  const who = PERFORMERS[performedBy];
  if (!who) return null;
  return (
    <span className="badge badge-neutral">
      <Icon name={who.icon} size={12} strokeWidth={2} />
      {t(who.label)}
    </span>
  );
}
