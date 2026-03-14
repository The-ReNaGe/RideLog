// update-version.js
// Synchronise la version du fichier VERSION dans tous les fichiers critiques du projet

const fs = require('fs');
const path = require('path');

const version = fs.readFileSync('VERSION', 'utf8').trim();

const replacements = [
    {
      file: 'frontend/src/version.js',
      regex: /export default "[0-9.]+";/,
      replace: `export default "${version}";`,
    },
    {
    file: 'README.md',
    regex: /\| Version\s*\|.*$/m,
    replace: `| Version | RideLog v${version}`,
    },
  {
    file: 'backend/main.py',
    regex: /version="[0-9.]+"/,
    replace: `version="${version}"`,
  },
  {
    file: 'frontend/package.json',
    regex: /"version": "[0-9.]+"/,
    replace: `"version": "${version}"`,
  },
  {
    file: 'frontend/src/App.jsx',
    regex: /v[0-9.]+/g,
    replace: `v${version}`,
  },
  {
    file: 'ha-integration/hacs.json',
    regex: /"version": "[0-9.]+"/,
    replace: `"version": "${version}"`,
  },
  {
    file: 'ha-integration/custom_components/ridelog/manifest.json',
    regex: /"version": "[0-9.]+"/,
    replace: `"version": "${version}"`,
  },
];

for (const { file, regex, replace } of replacements) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const newContent = content.replace(regex, replace);
    fs.writeFileSync(file, newContent);
    console.log(`[update-version] ${file} mis à jour → ${version}`);
  } else {
    console.warn(`[update-version] Fichier non trouvé : ${file}`);
  }
}
