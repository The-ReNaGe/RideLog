import React from 'react';
import Flag from './Flag';
import { usePreferences } from '../lib/preferencesContext';

/**
 * Marque un champ ou une échéance dont le comportement dépend du PAYS.
 *
 * À quoi ça sert, concrètement
 * ────────────────────────────
 * Trois choses au moins ne se traduisent pas, elles se *remplacent* d'un pays
 * à l'autre (§20.1) : le format d'une plaque et le service qui la décode, le
 * calendrier du contrôle technique, et la base des communes qui alimente la
 * recherche de stations. Rien à l'écran ne le disait — un utilisateur voyait
 * « AB-123-CD » sans savoir que c'est une règle française, et un contributeur
 * devait relire le code pour savoir ce qu'un second pays obligerait à toucher.
 *
 * Ce badge répond aux deux à la fois : il montre le drapeau du pays actif, et
 * il **recense** dans le code ce qui est national. Ajouter un pays revient
 * alors à chercher les occurrences de ce composant.
 *
 * ⚠️ À poser UNIQUEMENT sur ce qui change réellement avec le pays. Sur un
 * champ ordinaire il deviendrait décoratif, et le jour où l'on cherchera ce
 * qu'un nouveau pays impacte, la liste ne voudra plus rien dire.
 */
export default function CountryBadge({ reason, size = 16 }) {
  const { region } = usePreferences();
  // Tant que le pays n'est pas connu (premier rendu, /auth/me pas encore
  // revenu), rien plutôt qu'un drapeau faux.
  if (!region) return null;

  return (
    <span
      className="inline-flex items-center"
      style={{ gap: 4, verticalAlign: 'middle' }}
      title={reason}
    >
      <Flag code={region} width={size} />
    </span>
  );
}
