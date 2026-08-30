/**
 * Audit des traductions.
 *
 * À quoi ça sert
 * ──────────────
 * Le catalogue est indexé sur les chaînes françaises (voir lib/i18n.js). Une
 * chaîne non traduite s'affiche donc en français au lieu de casser la page —
 * c'est voulu, mais ça rend l'oubli INVISIBLE. Sans cet outil, personne ne
 * sait ce qui reste à faire, et un contributeur qui veut ajouter une langue
 * n'a aucun point de départ.
 *
 * Ce que le script fait
 * ─────────────────────
 *   1. extrait toutes les clés réellement utilisées, c'est-à-dire les appels
 *      `t('…')` du code — pas les chaînes du catalogue, qui peuvent avoir
 *      survécu à un renommage ;
 *   2. les compare à chaque catalogue de langue ;
 *   3. signale les MANQUANTES (à traduire) et les ORPHELINES (traduites mais
 *      plus utilisées — typiquement un libellé français renommé sans que le
 *      catalogue suive, ce qui casse silencieusement la traduction).
 *
 * Usage :
 *   node scripts/i18n-audit.mjs          # rapport lisible
 *   node scripts/i18n-audit.mjs --json   # pour un outil
 *   node scripts/i18n-audit.mjs --strict # sort en erreur s'il manque quelque chose
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const LOCALES = join(SRC, 'lib', 'locales');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx?|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Les appels `t('…')` et `t("…")`, y compris `u.t(…)` ou `fmt.t(…)`.
 *
 * Volontairement naïf : une clé construite dynamiquement — `t(item.label)` —
 * n'est pas extractible, et le script la signale à part plutôt que de faire
 * semblant de l'avoir vue.
 */
const CALL = /\bt\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
const DYNAMIC = /\bt\(\s*[A-Za-z_$][\w$.[\]]*\s*[,)]/g;

/**
 * Clés passées dynamiquement — `t(item.label)` — que l'extraction ne peut pas
 * voir. Elles se déclarent dans le code par un commentaire :
 *
 *     // i18n: 'Véhicules', 'Tableau de bord'
 *
 * Déclaration explicite plutôt que devinette : une heuristique du genre
 * « toute valeur de `label:` est une clé » attraperait aussi les libellés qui
 * ne passent jamais par t(), et le rapport deviendrait faux dans les deux
 * sens. Ici, ce qui est déclaré l'est parce que quelqu'un l'a voulu.
 */
const DECLARED = /\/\/\s*i18n:\s*(.+)$/gm;
const QUOTED = /(['"])((?:\\.|(?!\1)[^\\])*)\1/g;

/**
 * Le texte tel que `t()` le recevra À L'EXÉCUTION, et non tel qu'il est écrit
 * dans le fichier.
 *
 * La distinction n'est pas cosmétique : une clé contenant `\n` s'écrit avec
 * une barre oblique inverse dans la source, et le moteur la reçoit comme un
 * vrai saut de ligne. Sans cette conversion, une chaîne multi-lignes était
 * signalée **à la fois** manquante (la source ne correspond à aucune clé) et
 * orpheline (la clé du catalogue ne correspond à aucune source) — deux
 * signaux faux pour une traduction parfaitement correcte, et de quoi faire
 * douter de tout le rapport.
 */
function unescape(raw) {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (match, escaped) => {
    if (escaped[0] === 'u') return String.fromCharCode(parseInt(escaped.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' }[escaped] ?? escaped;
  });
}

const used = new Map();   // clé → [fichiers]
const dynamic = [];       // sites d'appel non extractibles

for (const file of walk(SRC)) {
  if (file.startsWith(LOCALES)) continue;
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  for (const m of text.matchAll(CALL)) {
    const key = unescape(m[2]);
    if (!used.has(key)) used.set(key, []);
    used.get(key).push(rel);
  }
  for (const _ of text.matchAll(DYNAMIC)) dynamic.push(rel);
  for (const decl of text.matchAll(DECLARED)) {
    for (const q of decl[1].matchAll(QUOTED)) {
      const key = unescape(q[2]);
      if (!used.has(key)) used.set(key, []);
      used.get(key).push(`${rel} (déclarée)`);
    }
  }
}

const catalogues = readdirSync(LOCALES)
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.replace(/\.js$/, ''));

const report = { used: used.size, dynamicSites: dynamic.length, languages: {} };

for (const lang of catalogues) {
  const mod = await import(join(LOCALES, `${lang}.js`));
  const catalogue = mod[lang.toUpperCase()] || mod.default || {};
  const keys = new Set(Object.keys(catalogue));
  const missing = [...used.keys()].filter((k) => !keys.has(k));
  const orphans = [...keys].filter((k) => !used.has(k));
  report.languages[lang] = {
    translated: keys.size,
    missing,
    orphans,
    coverage: used.size ? Math.round(((used.size - missing.length) / used.size) * 100) : 100,
  };
}

/**
 * Ce qui n'est PAS encore enveloppé dans t().
 *
 * C'est la mesure qui compte pour savoir où on en est : la couverture du
 * catalogue ne dit que « parmi les chaînes déjà enveloppées, combien sont
 * traduites » — elle atteint 100 % alors que l'essentiel de l'interface n'a
 * même pas été touché.
 *
 * Heuristique assumée : une chaîne est candidate si elle contient un accent
 * français ou un mot outil français, et qu'elle n'est pas déjà dans un t().
 * Elle produit des faux positifs (un commentaire, un nom de champ API) — d'où
 * le mot « candidates » dans le rapport, et non « manquantes ».
 */
const FRENCH = /[àâçéèêëîïôûùüœÀÂÇÉÈÊËÎÏÔÛÙÜŒ]|\b(le|la|les|un|une|des|du|de|et|ou|pour|par|sur|dans|avec|sans|est|sont|aucun|aucune|tous|toutes|votre|vos|cette|plus|moins|vous|votre)\b/i;
const LITERAL = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const JSX_TEXT = />([^<>{}\n]{4,})</g;

function todoScan() {
  const perFile = {};
  let total = 0;
  for (const file of walk(SRC)) {
    if (file.startsWith(LOCALES) || file.includes('scripts')) continue;
    const text = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);
    const wrapped = new Set();
    for (const m of text.matchAll(CALL)) wrapped.add(unescape(m[2]));

    const found = new Set();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      // Commentaires : ils ne s'affichent pas.
      if (/^(\/\/|\*|\/\*)/.test(trimmed)) continue;
      for (const m of line.matchAll(LITERAL)) {
        const v = m[2].trim();
        if (v.length < 4 || wrapped.has(v)) continue;
        if (/^(https?:|\/|var\(|--|[\w.-]+$)/.test(v)) continue;
        if (FRENCH.test(v)) found.add(v);
      }
      for (const m of line.matchAll(JSX_TEXT)) {
        const v = m[1].trim();
        if (v.length < 4 || wrapped.has(v)) continue;
        if (FRENCH.test(v)) found.add(v);
      }
    }
    if (found.size) { perFile[rel] = [...found]; total += found.size; }
  }
  return { total, perFile };
}

const todo = todoScan();
report.notWrapped = todo.total;

const todoArg = process.argv.find((a) => a.startsWith('--todo'));
if (todoArg) {
  // `--todo=Auth` détaille les chaînes des fichiers dont le chemin contient
  // « Auth ». Sans filtre, on n'a que le décompte par fichier.
  const filter = todoArg.includes('=') ? todoArg.split('=')[1] : null;
  if (filter) {
    for (const [file, items] of Object.entries(todo.perFile)) {
      if (!file.includes(filter)) continue;
      console.log(`── ${file} (${items.length})`);
      for (const v of items) console.log(`  ${JSON.stringify(v)}: '',`);
    }
  } else {
    console.log(`Chaînes françaises candidates, pas encore dans t() : ${todo.total}\n`);
    const sorted = Object.entries(todo.perFile).sort((a, b) => b[1].length - a[1].length);
    for (const [file, items] of sorted) {
      console.log(`${String(items.length).padStart(4)}  ${file}`);
    }
  }
  process.exit(0);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Clés utilisées dans le code : ${report.used}`);
  if (report.dynamicSites) {
    const uniq = [...new Set(dynamic)];
    console.log(`Appels dynamiques (clé non extractible) : ${report.dynamicSites} dans ${uniq.length} fichier(s)`);
    console.log(`  ${uniq.join(', ')}`);
  }
  console.log(`Chaînes françaises pas encore enveloppées dans t() : ${todo.total} (voir --todo)`);
  for (const [lang, r] of Object.entries(report.languages)) {
    console.log(`\n── ${lang} : ${r.coverage}% (${r.translated} traduites, ${r.missing.length} manquantes)`);
    if (r.missing.length) {
      console.log('  MANQUANTES :');
      for (const k of r.missing.slice(0, 40)) console.log(`    ${JSON.stringify(k)}: '',`);
      if (r.missing.length > 40) console.log(`    … et ${r.missing.length - 40} autres`);
    }
    if (r.orphans.length) {
      console.log('  ORPHELINES (traduites mais plus utilisées — libellé renommé ?) :');
      for (const k of r.orphans) console.log(`    ${JSON.stringify(k)}`);
    }
  }
}

if (process.argv.includes('--strict')) {
  const incomplete = Object.entries(report.languages)
    .filter(([, r]) => r.missing.length || r.orphans.length);
  if (incomplete.length) process.exit(1);
}
