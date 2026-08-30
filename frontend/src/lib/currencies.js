/**
 * Devises : symboles, et rien d'autre.
 *
 * ⚠️ **Cette liste doit rester alignée sur `backend/currency.py`.** Elle est
 * recopiée plutôt qu'appelée parce que `fmt.money()` est synchrone et tourne
 * sur chaque montant affiché : aller chercher un symbole par requête serait
 * absurde. Deux listes de deux lignes, dont l'écart se verrait au premier
 * montant affiché — c'est le bon compromis. Une troisième devise s'ajoute des
 * deux côtés, dans le même lot.
 *
 * ⚠️ **Aucune conversion ici.** Le symbole dit dans quelle monnaie un montant a
 * été saisi ; il ne le recalcule pas. La conversion est une commande explicite
 * d'administration, avec un taux fourni à la main (voir §20.8).
 */

export const CURRENCY_SYMBOLS = {
  EUR: '€',
  USD: '$',
};

/**
 * Symbole d'un code devise, ou `fallback` si le code est absent ou inconnu.
 *
 * Le repli compte : une ligne enregistrée avant que le marquage existe porte
 * `null`, et doit alors suivre le réglage d'instance — c'est exactement
 * comment elle a toujours été affichée.
 */
export function currencySymbolOf(code, fallback) {
  if (!code) return fallback;
  return CURRENCY_SYMBOLS[String(code).toUpperCase()] || fallback;
}
