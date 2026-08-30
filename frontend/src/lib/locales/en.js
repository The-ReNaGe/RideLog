/**
 * Catalogue anglais.
 *
 * Les clés sont les chaînes FRANÇAISES telles qu'elles apparaissent dans le
 * code — voir l'en-tête de `lib/i18n.js` pour la raison. Une chaîne absente
 * d'ici s'affiche donc en français, ce qui est le comportement voulu pendant
 * une traduction progressive : l'écran reste lisible au lieu d'afficher une
 * clé technique.
 *
 * `{nom}` marque une valeur interpolée. Les garder identiques des deux côtés.
 *
 * ⚠️ Renommer un libellé français dans un composant SANS le renommer ici casse
 * silencieusement sa traduction. Le catalogue vivant dans le dépôt, la clé
 * orpheline se voit au diff — mais elle ne lève aucune erreur.
 *
 * ── Avancement ────────────────────────────────────────────────────────────
 * Vague 1 : coquille de l'application (navigation, en-tête, pied de page) et
 * onglets des paramètres. Ce sont les libellés visibles depuis tous les
 * écrans, donc ceux dont la traduction se remarque le plus tôt.
 *
 * Restent à faire : AuthPage, les écrans véhicules, entretiens, carburant, et
 * les 82 messages d'erreur du backend (qui demandent d'abord de décider si
 * l'API renvoie des codes ou du texte).
 */

export const EN = {
  // ── Navigation ──────────────────────────────────────────────────────────
  'Véhicules': 'Vehicles',
  'Tableau de bord': 'Dashboard',
  'Bilan': 'Summary',
  'Stations': 'Stations',
  'Planning': 'Planning',
  'Paramètres': 'Settings',
  'Réglages': 'Settings',
  'Admin': 'Admin',

  // ── En-tête ─────────────────────────────────────────────────────────────
  'Passer en mode nuit': 'Switch to dark mode',
  'Passer en mode jour': 'Switch to light mode',
  'Connecté en tant que {name}': 'Signed in as {name}',
  'Se déconnecter': 'Sign out',

  // ── Pied de page ────────────────────────────────────────────────────────
  "suivi d'entretien open source": 'open-source maintenance tracker',
  'connecté en tant que {name}': 'signed in as {name}',

  // ── Onglets des paramètres ──────────────────────────────────────────────
  'Préférences': 'Preferences',
  'Discord': 'Discord',
  'Home Assistant': 'Home Assistant',
  'Rappels': 'Reminders',
  'Famille': 'Household',
  'Compte': 'Account',
  'Inscription': 'Registration',
  'API': 'API',

  // ── Écran Préférences ───────────────────────────────────────────────────
  'Pays': 'Country',
  "Décide du format de plaque d'immatriculation, du service qui la décode et du calendrier du contrôle technique. S'applique à toute l'instance.":
    'Sets the licence-plate format, the service that decodes it, and the roadworthiness-test schedule. Applies to the whole instance.',
  "Seul un administrateur peut changer le pays de l'instance.":
    'Only an administrator can change the country of this instance.',
  "La France est pour l'instant le seul pays pris en charge. D'autres apparaîtront ici sans qu'aucun réglage ne soit à refaire.":
    'France is the only supported country for now. Others will appear here with nothing to reconfigure.',

  'Langue': 'Language',
  'Ne vaut que pour votre compte. Par défaut, celle de {country}.':
    'Applies to your account only. Defaults to the language of {country}.',
  'Ne vaut que pour votre compte.': 'Applies to your account only.',
  'La traduction anglaise est en cours : certains écrans sont encore en français.':
    'The English translation is a work in progress — some screens are still in French.',

  'Unités': 'Units',
  "Ne vaut que pour votre compte, et ne change que l'affichage : vos données restent enregistrées en kilomètres et en litres.":
    'Applies to your account only, and changes the display alone — your data stays stored in kilometres and litres.',
  'Kilomètres': 'Kilometres',
  'Miles': 'Miles',
  // ── Authentification ────────────────────────────────────────────────────
  "Suivi d'entretien véhicules": 'Vehicle maintenance tracking',
  'Connexion': 'Sign in',
  'Créer un compte': 'Create an account',
  'Identifiant': 'Username',
  'Mot de passe': 'Password',
  'Valider': 'Sign in',
  'Chargement…': 'Loading…',
  'Bloqué ({seconds}s)': 'Locked ({seconds}s)',
  'Trop de tentatives. Veuillez patienter.': 'Too many attempts. Please wait.',
  'Mot de passe oublié ?': 'Forgotten password?',
  'Votre identifiant': 'Your username',
  'Envoyer': 'Send',
  'Erreur de connexion': 'Sign-in failed',
  'Erreur lors de la création du compte': 'Could not create the account',
  'Compte créé avec succès ! Connectez-vous maintenant.': 'Account created. You can sign in now.',
  '3 à 50 caractères, unique': '3 to 50 characters, must be unique',
  'Toto Dupont': 'Jane Smith',
  'Minimum 6 caractères': 'At least 6 characters',
  'Création…': 'Creating…',
  'Le premier compte créé sera administrateur': 'The first account created becomes an administrator',
  'Il pourra ensuite promouvoir ou rétrograder les suivants.':
    'It can then promote or demote the accounts that follow.',
  'Invitation valide — créez votre compte ci-dessus.': 'Valid invitation — create your account above.',
  'Invitation invalide ou expirée.': 'Invalid or expired invitation.',
  'Inscription ouverte — créez votre compte librement.': 'Registration is open — create your account freely.',
  'Inscription sur invitation uniquement': 'Registration by invitation only',
  "Demandez un lien d'invitation à un administrateur.": 'Ask an administrator for an invitation link.',
  "Instance auto-hébergée — aucune donnée n'est partagée à l'extérieur.":
    'Self-hosted instance — no data is shared with anyone outside it.',
  "Pas d'email de réinitialisation ici : l'application est auto-hébergée. Votre identifiant sera signalé aux administrateurs, qui pourront réinitialiser votre mot de passe depuis la console.":
    'No reset email here — the application is self-hosted. Your username will be flagged to the administrators, who can reset your password from the console.',
  'Connectez-vous pour rejoindre le groupe {name} et consulter les véhicules de ses membres.':
    'Sign in to join the {name} household and see its members\' vehicles.',
  'Connectez-vous pour rejoindre le groupe famille auquel vous avez été invité.':
    'Sign in to join the household you were invited to.',
  "Ce lien ne crée pas de compte. Si vous n'en avez pas encore, demandez-en un à l'administrateur de cette instance.":
    'This link does not create an account. If you do not have one yet, ask this instance\'s administrator.',

  // ── Liste des véhicules ─────────────────────────────────────────────────
  'Mon garage': 'My garage',
  'Garage de {name}': "{name}'s garage",
  'un membre du groupe': 'a household member',
  'son propriétaire': 'its owner',
  'Partagé avec vous — seul {name} peut y enregistrer un entretien ou un plein.':
    'Shared with you — only {name} can log servicing or refuelling here.',
  'Lecture seule': 'Read-only',
  'Aucun véhicule': 'No vehicles',
  '1 véhicule': '1 vehicle',
  '{count} véhicules': '{count} vehicles',
  'Votre garage est vide pour le moment.': 'Your garage is empty for now.',
  'Ajouter un véhicule': 'Add a vehicle',
  'Impossible de charger les véhicules': 'Could not load the vehicles',
  'Chargement du garage…': 'Loading the garage…',
  'Annuler': 'Cancel',
  'Ajouter': 'Add',

  // ── Carte véhicule ──────────────────────────────────────────────────────
  '{count} entretien(s) en retard': '{count} overdue service(s)',
  '{count} entretien(s) urgent(s)': '{count} urgent service(s)',
  '{count} entretien(s) à surveiller': '{count} service(s) to watch',
  'À jour': 'Up to date',
  'Exclu du partage avec votre groupe famille': 'Excluded from household sharing',
  'Essence': 'Petrol',
  'Diesel': 'Diesel',
  'Hybride': 'Hybrid',
  'Électrique': 'Electric',
  'Thermique': 'Combustion',
  'Accessible': 'Budget',
  'Généraliste': 'Mainstream',
  'Premium': 'Premium',

  // ── Tableau de bord ─────────────────────────────────────────────────────
  'Impossible de charger le tableau de bord': 'Could not load the dashboard',
  'Chargement du tableau de bord…': 'Loading the dashboard…',
  "Vue d'ensemble du garage": 'An overview of the garage',
  "Vue d'ensemble du garage de {name}": "An overview of {name}'s garage",
  'Coût total': 'Total cost',
  'Distance totale': 'Total distance',
  "Valeur d'achat": 'Purchase value',
  "Prix d'achat": 'Purchase price',
  'Dépenses': 'Spending',
  'État': 'Status',
  'Alertes': 'Alerts',
  'Activité récente': 'Recent activity',
  'Aucune activité': 'No activity',
  'Dépenses mensuelles': 'Monthly spending',
  'Dépenses annuelles': 'Yearly spending',
  'Aucune donnée': 'No data',
  'en retard': 'overdue',
  'urgent': 'urgent',
  'à prévoir': 'coming up',
  '{count} en retard': '{count} overdue',
  '{count} urgent(s)': '{count} urgent',
  '{count} à prévoir': '{count} coming up',

  // ── Planning ────────────────────────────────────────────────────────────
  'Toutes les échéances de votre parc, mois par mois.':
    'Every due date across your fleet, month by month.',
  'Chargement du planning…': 'Loading the planner…',
  'Erreur de chargement': 'Could not load',
  'Mois précédent': 'Previous month',
  'Mois suivant': 'Next month',
  'Janvier': 'January', 'Février': 'February', 'Mars': 'March', 'Avril': 'April',
  'Mai': 'May', 'Juin': 'June', 'Juillet': 'July', 'Août': 'August',
  'Septembre': 'September', 'Octobre': 'October', 'Novembre': 'November', 'Décembre': 'December',
  'Lun': 'Mon', 'Mar': 'Tue', 'Mer': 'Wed', 'Jeu': 'Thu', 'Ven': 'Fri', 'Sam': 'Sat', 'Dim': 'Sun',
  'En retard': 'Overdue',
  'Urgent': 'Urgent',
  'À surveiller': 'To watch',
  'Planifié': 'Scheduled',

  // ── Entretien : formulaire et historique ────────────────────────────────
  'Enregistrer une intervention': 'Log a service',
  "Type d'intervention": 'Service type',
  'Sélectionnez une intervention…': 'Select a service…',
  "Titre d'intervention": 'Service title',
  'Ex. : remplacement silencieux, réparation moteur…': 'e.g. silencer replacement, engine repair…',
  '{count} élément(s) sélectionné(s)': '{count} item(s) selected',
  'Aucun détail sélectionné': 'No details selected',
  'Aucun élément sélectionné': 'No items selected',
  'Prix estimé :': 'Estimated price:',
  'Date': 'Date',
  'Distance': 'Distance',
  '(optionnel — estimé si absent)': '(optional — estimated if left blank)',
  'Laisser vide pour une estimation automatique': 'Leave blank for an automatic estimate',
  'Coût': 'Cost',
  'Optionnel': 'Optional',
  "Catégorie d'intervention": 'Service category',
  'Entretien': 'Servicing',
  'Réparation / panne': 'Repair / breakdown',
  'Modification du véhicule': 'Vehicle modification',
  'Remarques': 'Notes',
  'Notes additionnelles…': 'Additional notes…',
  'Factures (PDF / images)': 'Invoices (PDF / images)',
  "Jusqu'à 10 fichiers, 10 Mo maximum chacun": 'Up to 10 files, 10 MB each at most',
  'Ajouter des factures': 'Add invoices',
  "Impossible de créer l'enregistrement d'entretien": 'Could not save the service record',
  'Supprimer cette intervention ?': 'Delete this service record?',
  'Supprimer cette intervention': 'Delete this service record',
  'Modifier cette intervention': 'Edit this service record',
  'Impossible de supprimer cette intervention': 'Could not delete this service record',
  'Impossible de modifier cette intervention': 'Could not edit this service record',
  "Chargement de l'historique…": 'Loading the history…',
  'Aucune intervention enregistrée pour le moment.': 'No service recorded yet.',
  // ── Devise et pays du véhicule ──────────────────────────────────────────
  'Devise': 'Currency',
  "Change le symbole affiché, rien d'autre : aucun montant déjà enregistré n'est converti.":
    'Changes the symbol shown, nothing else — no amount already recorded is converted.',
  "Seul un administrateur peut changer la devise de l'instance.":
    'Only an administrator can change the currency of this instance.',
  "Chaque montant garde la devise dans laquelle il a été saisi : une révision payée 200 $ continue de s'afficher « 200 $ » même après un passage à l'euro. Changer ce réglage ne recalcule rien.":
    'Every amount keeps the currency it was entered in: a service paid $200 still shows as “$200” after a switch to euros. Changing this setting recalculates nothing.',

  'Plusieurs devises dans cet historique': 'Several currencies in this history',
  'Les répartitions par catégorie additionnent des montants saisis dans des devises différentes. Un administrateur peut tout ramener à une seule devise depuis Paramètres → Préférences.':
    'The per-category breakdowns add up amounts entered in different currencies. An administrator can bring everything back to a single currency from Settings → Preferences.',
  'Euro': 'Euro',
  'Dollar américain': 'US dollar',
  "Pays d'immatriculation": 'Country of registration',
  'Décide du calendrier de contrôle technique de ce véhicule.':
    "Sets this vehicle's roadworthiness-test schedule.",
  "Pays de l'instance ({code})": 'Instance country ({code})',
  'À renseigner seulement si ce véhicule est immatriculé ailleurs.':
    'Only fill this in if the vehicle is registered elsewhere.',

  // ── Montants ────────────────────────────────────────────────────────────
  'Coût payé': 'Cost paid',
  'Montant payé': 'Amount paid',
  'Montant': 'Amount',
  'Prix au litre': 'Price per litre',
  'Prix/L': 'Price/L',
  'Dépensé ce mois :': 'Spent this month:',
  'Moyenne mensuelle :': 'Monthly average:',
  '/mois': '/month',
  'Évolution du coût': 'Cost trend',
  'Total :': 'Total:',

  // ── Administration ──────────────────────────────────────────────────────
  'Administration': 'Administration',
  'Comptes, rôles et mots de passe de cette instance.':
    'Accounts, roles and passwords for this instance.',
  'Accès refusé': 'Access denied',
  'Cette console est réservée aux administrateurs.': 'This console is for administrators only.',
  'Gestion des utilisateurs': 'User management',
  'Aucun utilisateur.': 'No users.',
  'Utilisateur': 'User',
  'Nom affiché': 'Display name',
  'Nom affiché*': 'Display name*',
  'Identifiant*': 'Username*',
  'Rôle': 'Role',
  'Créé le': 'Created',
  'Actions': 'Actions',
  '(vous)': '(you)',
  'Service': 'Service',
  'Fermer': 'Close',
  'Nouveau compte': 'New account',
  'Créer le compte': 'Create the account',
  "Créer en tant qu'administrateur": 'Create as an administrator',
  'Laisser vide pour génération automatique': 'Leave empty to generate one',
  '(optionnel — généré automatiquement si laissé vide, affiché une seule fois pour que vous le transmettiez)':
    '(optional — generated automatically if left empty, shown once so you can pass it on)',
  "Le mode d'inscription est « Sur invitation ». Pour faire entrer quelqu'un, générez un lien depuis Paramètres → Inscription, ou changez le mode d'inscription.":
    'Registration is set to “By invitation”. To let someone in, generate a link from Settings → Registration, or change the registration mode.',
  'Compte @{name} créé.': 'Account @{name} created.',
  "Mot de passe généré — copiez-le maintenant et transmettez-le à l'utilisateur par un canal sécurisé (il ne sera plus jamais affiché) :":
    'Generated password — copy it now and pass it on over a secure channel (it will never be shown again):',

  'Réinitialisation de mot de passe': 'Password reset',
  "Les admins peuvent réinitialiser le mot de passe d'un utilisateur (pas de SMTP/lien par email disponible).":
    'Admins can reset a user’s password (no SMTP or email link is available).',
  'Désactivée : aucun admin ne peut réinitialiser un mot de passe actuellement.':
    'Disabled: no admin can reset a password right now.',
  'Patientez…': 'Please wait…',
  'Activé': 'Enabled',
  'Désactivé': 'Disabled',
  'Cliquer pour désactiver': 'Click to disable',
  'Cliquer pour activer': 'Click to enable',
  'Mot de passe de @{name} réinitialisé.': 'Password for @{name} has been reset.',
  "Copiez-le maintenant et transmettez-le à l'utilisateur par un canal sécurisé (il ne sera plus jamais affiché) :":
    'Copy it now and pass it on over a secure channel (it will never be shown again):',
  'Reset demandé': 'Reset requested',
  'Demande de réinitialisation le {date}': 'Reset requested on {date}',
  'Doit encore choisir son propre mot de passe': 'Still has to choose their own password',
  'Mot de passe temporaire': 'Temporary password',
  'Rétrograder en utilisateur': 'Demote to user',
  'Promouvoir administrateur': 'Promote to administrator',
  'Rétrograder': 'Demote',
  'Promouvoir': 'Promote',
  'Compte protégé': 'Protected account',
  "Réinitialiser le mot de passe (utile en l'absence d'email)":
    'Reset the password (useful with no email available)',
  'Réinitialiser': 'Reset',
  'Supprimer @{name}': 'Delete @{name}',
  'Supprimer cet utilisateur': 'Delete this user',
  'Impossible : compte de service protégé': 'Not possible: protected service account',
  "Impossible : rétrogradez-le d'abord": 'Not possible: demote them first',

  'Erreur lors du chargement des utilisateurs': 'Could not load the users',
  'Erreur lors du changement de statut': 'Could not change the status',
  'Erreur lors de la suppression': 'Could not delete',
  'Le changement de rôle a échoué.': 'The role change failed.',
  'Erreur lors de la réinitialisation du mot de passe': 'Could not reset the password',
  'Réactiver la réinitialisation de mot de passe par les admins ?':
    'Let admins reset passwords again?',
  "Désactiver la réinitialisation de mot de passe ?\n\nAucun admin (y compris vous) ne pourra plus réinitialiser un mot de passe tant que ce n'est pas réactivé ici.":
    'Disable password resets?\n\nNo admin — including you — will be able to reset a password until this is turned back on here.',
  "Êtes-vous sûr de vouloir supprimer l'utilisateur « {name} » ?\n\nSes véhicules et données seront supprimés.":
    'Delete the user “{name}”?\n\nTheir vehicles and data will be deleted too.',
  'Rétrograder « {name} » en simple utilisateur ?': 'Demote “{name}” to a plain user?',
  'Promouvoir « {name} » administrateur ?': 'Promote “{name}” to administrator?',
  "Réinitialiser le mot de passe de « {name} » ?\n\nUn nouveau mot de passe aléatoire sera généré et affiché une seule fois. Toutes ses sessions en cours seront invalidées — l'utilisateur devra se reconnecter avec le nouveau mot de passe.":
    'Reset the password for “{name}”?\n\nA new random password will be generated and shown once. All their current sessions will be invalidated — they will have to sign in again with the new password.',

  "Ce que cette console permet, et ce qu'elle interdit": 'What this console allows, and what it does not',
  "Le premier compte créé sur l'instance est automatiquement administrateur.":
    'The first account created on the instance is automatically an administrator.',
  'Un administrateur peut promouvoir ou rétrograder les autres, mais pas lui-même.':
    'An administrator can promote or demote others, but never themselves.',
  'En mode « Privé » ou « Ouvert », un administrateur crée un compte directement ; en mode « Sur invitation », il passe par un lien (Paramètres → Inscription).':
    'In “Private” or “Open” mode an administrator creates an account directly; in “By invitation” mode they go through a link (Settings → Registration).',
  'Un mot de passe créé ou réinitialisé par un administrateur est temporaire : la personne devra en choisir un à sa prochaine connexion, et ses sessions en cours sont déconnectées.':
    'A password created or reset by an administrator is temporary: the person will have to choose their own at next sign-in, and their current sessions are ended.',
  "Depuis l'écran de connexion, un utilisateur peut signaler un mot de passe oublié : un badge apparaît ici. Il n'y a pas d'envoi d'email en self-hosted.":
    'From the sign-in screen a user can report a forgotten password: a badge shows up here. Nothing is emailed in a self-hosted setup.',
  "Un administrateur ne peut pas réinitialiser son propre mot de passe ici — il risquerait de se déconnecter sans pouvoir revenir. Passez par Paramètres → Compte.":
    'An administrator cannot reset their own password here — they could lock themselves out. Use Settings → Account instead.',
  "Les administrateurs ne peuvent pas être supprimés : rétrogradez-les d'abord.":
    'Administrators cannot be deleted: demote them first.',
  'Supprimer un utilisateur supprime aussi tous ses véhicules.':
    'Deleting a user deletes all their vehicles too.',

  // ── Garage ──────────────────────────────────────────────────────────────
  'Mes véhicules': 'My vehicles',
  'Les véhicules du foyer, un garage par membre.':
    'The household’s vehicles, one garage per member.',
  "Vos véhicules et leur état d'entretien.": 'Your vehicles and their service status.',
};
