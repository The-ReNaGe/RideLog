---
name: ridelog-ui
description: Système de design de RideLog — jetons CSS, jeu d'icônes, classes existantes et règles de composition. À charger AVANT d'écrire ou de modifier le moindre composant React, d'ajouter un écran, une carte, un badge, un formulaire ou un tableau, et dès qu'il s'agit de « rendre plus joli », d'aligner, d'espacer ou de choisir une couleur dans le frontend.
---

# Interface RideLog

Le frontend a un système cohérent. **Le plus grand risque n'est pas de mal
dessiner : c'est de réinventer à côté** — une couleur en dur ici, un `padding`
arbitraire là, un émoji en guise d'icône — et de faire diverger l'ensemble
écran après écran.

Cette compétence sert à composer avec l'existant, pas à le remplacer.

---

## 1. Règle absolue : aucune couleur en dur

Le thème clair/sombre bascule en changeant les variables CSS. **Une couleur
écrite en dur devient illisible dans l'autre thème** — c'est le seul bug de
style que l'utilisateur voit à coup sûr. Les classes de couleur Tailwind
(`text-gray-300`, `bg-white`, `border-red-500`…) sont des couleurs en dur.

```jsx
style={{ color: '#313a46' }}        // ❌ invisible en sombre
className="border border-gray-300"  // ❌ idem
style={{ color: 'var(--text-1)' }}  // ✅
```

| Jeton | Usage |
|---|---|
| `--bg-base` | fond de page |
| `--bg-inset` | zone creusée dans une carte, corps de panneau |
| `--bg-surface` | fond de carte, de champ, d'en-tête |
| `--bg-hover` | survol |
| `--text-1` | texte principal, titres, valeurs |
| `--text-2` | texte secondaire, libellés, descriptions |
| `--text-3` | mentions discrètes, aides, unités |
| `--border` / `--border-strong` / `--border-light` | bordures |
| `--accent` / `--accent-light` | couleur principale et son fond pastel |
| `--success` / `--danger` / `--warning` / `--purple` (+ `-light`) | états et catégories |
| `--radius-sm` (8) / `--radius` (12) / `--radius-lg` (16) | rayons — **il n'y en a pas d'autres** |
| `--plate` | fond clair de la plaque du logo, dans les deux thèmes |
| `--shadow-xs` … `--shadow-lg` | ombres |
| `--focus-ring` | anneau de focus |

Les `-light` sont des fonds pastel : **toujours** les associer à la couleur
pleine correspondante pour le texte (`background: var(--success-light)` +
`color: var(--success)`), jamais l'inverse.

> Une seule couleur littérale est admise dans tout le projet : le fond blanc de
> la plaque du logo (`App.jsx`, `AuthPage.jsx`). Le logo est un tracé sombre sur
> transparent, il disparaît sur une surface sombre. Tout le reste passe par un
> jeton.

La palette suit celle du système d'Apple : gris neutres, bleu système, barre
supérieure translucide et floutée (`.app-bar`).

**Un seul accent, des surfaces en aplat.** Pas de dégradé de fond, pas de halo
teinté, pas de couleur par rubrique : les deux ont été essayés et écartés — le
premier décorait sans rien dire, le second virait à l'arc-en-ciel et noyait
l'élément actif. La couleur marque ce qui est **actif** ou ce qui **alerte**,
rien d'autre.

## 2. Icônes : `components/Icon.jsx`, jamais d'émoji

L'interface n'utilise **aucun émoji**. Le jeu d'icônes maison (~70 tracés,
grille 24×24, trait 1,75 px en `currentColor`) couvre la navigation, les
actions, les états et le vocabulaire véhicule.

```jsx
import Icon from './Icon';
<Icon name="wrench" size={16} />
```

La couleur vient du texte environnant — ne jamais en poser une dans l'icône
elle-même, sauf pour la teinter d'un état (`style={{ color: 'var(--danger)' }}`).
Un nom inconnu ne rend rien : `ICON_NAMES` liste les tracés disponibles.
Ajouter une icône = ajouter une entrée dans la table `P` d'`Icon.jsx`.

## 3. Utiliser les classes existantes avant d'écrire du style

Définies dans `frontend/src/index.css` :

| Classe | Rôle |
|---|---|
| `card` | conteneur standard : surface, bordure 1 px, rayon, ombre discrète |
| `card-interactive` | **uniquement** sur une carte réellement cliquable (survol + élévation) |
| `panel` + `panel-header` / `panel-body` / `panel-footer` | bloc de section délimité (un garage, un groupe de réglages) |
| `inset` | zone creusée dans une carte (résumé, encart secondaire) |
| `btn` + `btn-primary` / `btn-secondary` / `btn-ghost` / `btn-danger` / `btn-success` (+ `btn-sm` / `btn-lg`) | boutons |
| `btn-icon` (+ `.danger`) | bouton carré ne portant qu'une icône |
| `badge` + `badge-success` / `-danger` / `-warning` / `-info` / `-neutral` | pastilles d'état |
| `chip` / `chip-sep` | ligne de métadonnées séparée par des points médians |
| `tabs` + `tab` / `tab.active` | onglets soulignés (dans une page) |
| `app-bar` + `app-bar-inner` | barre translucide floutée, grille en trois zones |
| `segmented` + `segment` | sélecteur de section façon contrôle segmenté macOS |
| `icon-box` (+ `.sm` / `.lg`, `.success` / `.danger` / `.warning` / `.neutral`) | vignette d'icône carrée |
| `avatar` | pastille ronde portant une initiale |
| `field-label` / `field-hint` | libellé et aide d'un champ |
| `stat-number` / `card-label` / `section-title` / `eyebrow` | typographie |
| `tabular` | chiffres à chasse fixe — **tout nombre en colonne** |
| `photo-container` (+ `.cover`, `.photo-band`, `.hero-media`) | conteneurs d'image — la photo est affichée **entière** par défaut |
| `text-secondary` / `text-muted` / `spinner` | divers |

Composants partagés à réutiliser plutôt qu'à réécrire :
`Icon`, `Notice` (encart d'explication ou de résultat, cinq tons),
`PageHeader` (titre + précision + actions), `CategoryTag` (entretien /
réparation / modification), `VehiclePhoto` (photo authentifiée).

Les champs (`input`, `select`, `textarea`) sont stylés **par élément** : ne
leur ajouter aucune classe de bordure ou de padding. `input-field` n'existe pas.

Police : **Nunito**. Ne pas introduire d'autre famille ni d'autre rayon.

## 4. Ce qui rend une page « pas propre »

Les défauts réellement rencontrés sur ce projet, par ordre de fréquence :

**Un émoji en guise d'icône.** C'est le signe le plus visible d'une interface
bâclée : rendu différent selon l'OS, taille incontrôlable, sens approximatif.
Toujours `Icon`.

**Une photo recadrée — ou réduite à une vignette.** `object-fit: cover` coupe
l'avant ou l'arrière du véhicule ; un cadre trop large la laisse flotter au
milieu de marges floutées. Les cadres photo sont en **3/2**, format proche des
photos réelles, et `backdrop` sur `VehiclePhoto` rattrape l'écart résiduel.

**Une action destructrice sur un élément cliquable.** Une corbeille au coin
d'une carte-lien se déclenche par erreur. Les suppressions vivent dans l'écran
de détail, derrière une confirmation qui énumère ce qui sera perdu.

**Une boîte étirée pour trois mots.** Une carte, une case à cocher ou un
bouton sur toute la largeur pour un contenu court paraît vide et casse
l'alignement. `inline-flex` et la largeur s'ajuste au contenu.

**Un contour coloré sur chaque carte.** Quatre cartes cerclées de rouge et de
vert font un damier. L'état colore une **réglette à gauche** (`borderLeft: 3px`)
ou une petite vignette, pas tout le contour.

**Des colonnes de chiffres qui dansent.** Sans largeur fixe, un encart de
statistiques s'élargit avec sa valeur et le bord droit de la liste devient
irrégulier d'une ligne à l'autre.

**Une pastille cryptique.** `👁️ consultation` n'apprend rien. Un badge nomme
un état en toutes lettres (`Lecture seule`) ; l'explication va dans une ligne
de `--text-2` en dessous.

**La même information trois fois.** Nom du propriétaire dans le titre de
section, puis sur chaque carte, puis dans un badge : n'en garder qu'un. Idem
pour un titre de page qui répète l'onglet de navigation actif.

**Des espacements arbitraires.** S'en tenir à l'échelle déjà employée ici :
`gap-2` / `gap-3` / `gap-4`, `p-3` / `p-4`, `mb-4` / `mb-5`.

## 5. Mobile — non négociable

L'application est utilisée au téléphone (navigation fixe en bas, `pb-16 sm:pb-0`).

- Tout tableau desktop a une contrepartie en cartes : `hidden sm:block` /
  `sm:hidden`. **Ajouter une colonne oblige à traiter les deux.**
- Les rangées de boutons portent `flex-wrap`.
- Une largeur maximale utile sur grand écran (`max-width: 280px` sur un
  visuel, par exemple) doit être posée **dans une media query**, sinon elle
  laisse un bloc étroit calé à gauche sur mobile.
- Rien ne doit déborder horizontalement.

## 6. Écrire en français, et pour un humain

L'interface est intégralement en français. Un libellé dit ce qui va se passer,
pas comment c'est implémenté : « Vous ne verrez plus les véhicules des autres
membres » plutôt que « Supprimer l'appartenance ».

## 7. Vérifier

Le build seul ne prouve rien sur l'apparence. Après modification :

```bash
podman-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --force-recreate frontend
```

⚠️ `--force-recreate` est obligatoire : sans lui l'image est reconstruite mais
le conteneur garde l'ancienne, et on croit tester sa modification. Le
navigateur garde aussi l'`index.html` en cache : recharger avec un paramètre
d'URL jetable (`/?n=<timestamp>`).

Puis **regarder la page dans les deux thèmes** — le sélecteur est dans l'en-tête.
Un écart de contraste ne se voit pas autrement.
