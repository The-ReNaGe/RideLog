---
name: ridelog-ui
description: Système de design de RideLog — jetons CSS, classes existantes et règles de composition. À charger AVANT d'écrire ou de modifier le moindre composant React, d'ajouter un écran, une carte, un badge, un formulaire ou un tableau, et dès qu'il s'agit de « rendre plus joli », d'aligner, d'espacer ou de choisir une couleur dans le frontend.
---

# Interface RideLog

Le frontend a déjà un système cohérent. **Le plus grand risque n'est pas de mal
dessiner : c'est de réinventer à côté** — une couleur en dur ici, un `padding`
arbitraire là — et de faire diverger l'ensemble écran après écran.

Cette compétence sert à composer avec l'existant, pas à le remplacer.

---

## 1. Règle absolue : aucune couleur en dur

Le thème clair/sombre bascule en changeant les variables CSS. **Une couleur
écrite en dur devient illisible dans l'autre thème** — c'est le seul bug de
style que l'utilisateur voit à coup sûr.

```jsx
style={{ color: '#313a46' }}        // ❌ invisible en sombre
style={{ color: 'var(--text-1)' }}  // ✅
```

| Jeton | Usage |
|---|---|
| `--bg-base` | fond de page |
| `--bg-surface` | fond de carte, champ, encart |
| `--bg-hover` | survol |
| `--text-1` | texte principal, titres, valeurs |
| `--text-2` | texte secondaire, libellés, descriptions |
| `--text-3` | mentions discrètes, aides, unités |
| `--border` | bordures |
| `--accent` / `--accent-light` | couleur principale (bleu) et son fond pastel |
| `--success` / `--danger` / `--warning` (+ `-light`) | états |

Les `-light` sont des fonds pastel : **toujours** les associer à la couleur
pleine correspondante pour le texte (`background: var(--success-light)` +
`color: var(--success)`), jamais l'inverse.

## 2. Utiliser les classes existantes avant d'écrire du style

Définies dans `frontend/src/index.css` (428 lignes) :

| Classe | Rôle |
|---|---|
| `card` | conteneur standard, ombre et rayon inclus (`card no-shadow` pour l'aplat) |
| `btn` + `btn-primary` / `btn-secondary` / `btn-danger` / `btn-success` | boutons |
| `input-field` | champs de saisie et `select` |
| `badge` + `badge-success` / `-danger` / `-warning` / `-info` | pastilles d'état |
| `icon-box` (+ `.success` / `.danger` / `.warning`) | vignette d'icône carrée |
| `stat-number` | grand nombre d'une statistique |
| `card-label` | petit libellé au-dessus d'une valeur |
| `text-secondary` / `text-muted` | raccourcis `--text-2` / `--text-3` |
| `spinner` | indicateur de chargement |

Police : **Nunito**. Rayon des cartes : **6px**. Ne pas introduire d'autre
famille ni d'autre rayon.

## 3. Ce qui rend une page « pas propre »

Les défauts réellement rencontrés sur ce projet, par ordre de fréquence :

**Une boîte étirée pour trois mots.** Une case à cocher ou un encart sur toute
la largeur pour un contenu court paraît vide et casse l'alignement. Utiliser
`inline-flex` et laisser la largeur s'ajuster au contenu.

**Un formulaire collé au bord gauche.** `max-w-lg` seul, sur une page pleine
largeur, tasse le contenu dans un coin. Ajouter `mx-auto` — et donner la
**même largeur** à la bannière d'introduction et à la carte, sinon le décalage
saute aux yeux.

**Une pastille cryptique.** `👁️ consultation` n'apprend rien. Un badge nomme
un état en toutes lettres (`Lecture seule`) ; l'explication va dans une ligne
de `--text-2` en dessous, pas dans le badge.

**La même information trois fois.** Nom du propriétaire dans le titre de
section, puis sur chaque carte, puis dans un badge : n'en garder qu'un.

**Des espacements arbitraires.** S'en tenir à l'échelle Tailwind déjà employée
ici : `gap-2` / `gap-3` / `gap-6`, `p-3` / `p-4` / `p-6`, `mb-4` / `mb-6`.

## 4. Mobile — non négociable

L'application est utilisée au téléphone (navigation fixe en bas, `pb-16 sm:pb-0`).

- Tout tableau desktop a une contrepartie en cartes : `hidden sm:block` /
  `sm:hidden`. **Ajouter une colonne à un tableau oblige à traiter les deux.**
- Les rangées de boutons portent `flex-wrap`.
- Rien ne doit déborder horizontalement : le conteneur racine impose
  `overflow-x: hidden`.

## 5. Écrire en français, et pour un humain

L'interface est intégralement en français. Un libellé dit ce qui va se passer,
pas comment c'est implémenté : « Vous ne verrez plus les véhicules des autres
membres » plutôt que « Supprimer l'appartenance ».

Les émojis servent de repère visuel en tête de titre ou de badge — un seul,
jamais en pleine phrase.

## 6. Vérifier

Le build seul ne prouve rien sur l'apparence. Après modification :

```bash
podman-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --force-recreate frontend
```

⚠️ `--force-recreate` est obligatoire : sans lui l'image est reconstruite mais
le conteneur garde l'ancienne, et on croit tester sa modification.

Puis **regarder la page dans les deux thèmes** — le sélecteur est dans l'en-tête.
Un écart de contraste ne se voit pas autrement.
