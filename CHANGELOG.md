# Changelog

## [2.7.1](https://github.com/The-ReNaGe/RideLog/compare/v2.7.0...v2.7.1) (2026-09-14)


### Bug Fixes

* **docker:** images reconstruites sans les CVE critiques de perl-base ([4003413](https://github.com/The-ReNaGe/RideLog/commit/400341343ee0da902871f0157d9d1b786f101f43))

## [2.7.0](https://github.com/The-ReNaGe/RideLog/compare/v2.6.0...v2.7.0) (2026-09-14)


### Features

* **notifications:** envoie aussi les rappels sur Gotify ([ba4be12](https://github.com/The-ReNaGe/RideLog/commit/ba4be1232e0c83ce9aed5d6c43190d744ce3e8c8))
* **notifications:** envoie les rappels sur ntfy, en push sur le téléphone ([3ac24b3](https://github.com/The-ReNaGe/RideLog/commit/3ac24b305fbabb761f96cb140da2726583fe5013))
* **notifications:** rappels en push sur le téléphone, ntfy et Gotify aux côtés de Discord ([228ee18](https://github.com/The-ReNaGe/RideLog/commit/228ee18ea833c824c42f20c427ba34a8b82375a2))
* **paramètres:** Gotify dans le choix du service de notification ([05e4b46](https://github.com/The-ReNaGe/RideLog/commit/05e4b468c1b43dd919dd170fd3303bbd02deae2e))
* **paramètres:** l'onglet Discord devient Notifications, avec le choix du service ([8f3af9f](https://github.com/The-ReNaGe/RideLog/commit/8f3af9f4a1c83ae894b2d52649f48254c5fd6483))

## [2.6.0](https://github.com/The-ReNaGe/RideLog/compare/v2.5.0...v2.6.0) (2026-09-14)


### Features

* **carnet:** dit qui a réalisé chaque intervention, dans le PDF et le CSV ([a47cba4](https://github.com/The-ReNaGe/RideLog/commit/a47cba4d64a58891bc4f82576d57d5bd9bae6379))
* **entretien:** enregistre qui a réalisé l'intervention, professionnel ou soi-même ([5ec3ddf](https://github.com/The-ReNaGe/RideLog/commit/5ec3ddfdbae7ea88f9690dc84242a1a06044d970))
* **entretien:** qui a réalisé chaque intervention, du formulaire au carnet de vente ([20f7d21](https://github.com/The-ReNaGe/RideLog/commit/20f7d2197bffee7d988ee33121da63650eb5c350))
* **historique:** choisit et affiche qui a fait le travail ([d4c785c](https://github.com/The-ReNaGe/RideLog/commit/d4c785c98f96cebb1327c23d428386a1a4c71c6d))


### Bug Fixes

* **historique:** deux interventions d'un même jour, la dernière saisie en tête ([c5ac477](https://github.com/The-ReNaGe/RideLog/commit/c5ac477d5271aed6ab6a0fc654f92ee6c7e7e8a0))

## [2.5.0](https://github.com/The-ReNaGe/RideLog/compare/v2.4.3...v2.5.0) (2026-09-11)


### Features

* **carnet:** un récapitulatif PDF à remettre lors d'une vente ([4cd49f5](https://github.com/The-ReNaGe/RideLog/commit/4cd49f5d80a9e89e48b9f0e213c9f92888453df2))
* **véhicule:** enregistre la plaque au lieu de la jeter après le décodage ([48bc582](https://github.com/The-ReNaGe/RideLog/commit/48bc582d0dcea07f46d675553d437c618ea013db))


### Bug Fixes

* **fiche-véhicule:** retire l'icône euro posée devant un montant en dollars ([f745860](https://github.com/The-ReNaGe/RideLog/commit/f7458603fd465b1ec33d496ea09267ed5b8e6723))
* **récapitulatif:** renvoie la devise de chaque ligne, pas seulement celle du total ([04b1ff6](https://github.com/The-ReNaGe/RideLog/commit/04b1ff68f4005807556e43b9dc3e701bdd14084e))

## [2.4.3](https://github.com/The-ReNaGe/RideLog/compare/v2.4.2...v2.4.3) (2026-09-10)


### Bug Fixes

* **libellés:** supprime les pluriels entre parenthèses ([72cf183](https://github.com/The-ReNaGe/RideLog/commit/72cf1830b1310c7025426b40157a4a0aa393b615))
* **planning:** liste les échéances dépassées, absentes de la grille ([bffa545](https://github.com/The-ReNaGe/RideLog/commit/bffa545e241c642f5f3262745669131a45f01350))
* **planning:** place les échéances dépassées sous le calendrier ([b322e66](https://github.com/The-ReNaGe/RideLog/commit/b322e66bf4b39151fded75f3992dab93da8220e7))
* **style:** quatre couleurs en dur et des espacements hors échelle ([51608d5](https://github.com/The-ReNaGe/RideLog/commit/51608d51697d33d6c0c842bb786aa932d3318483))
* **tableau-de-bord:** aligne le bas des deux colonnes ([ff4cda5](https://github.com/The-ReNaGe/RideLog/commit/ff4cda5687db220b64d9136dd5830757d389bb99))
* **tableau-de-bord:** la ligne de mesures rejoint une carte de résumé ([2b80441](https://github.com/The-ReNaGe/RideLog/commit/2b8044141585e1e61b8b2e08152c78efb7586863))
* **tableau-de-bord:** le graphique annuel occupe sa carte au lieu d'en déborder ([8291945](https://github.com/The-ReNaGe/RideLog/commit/8291945826e57e7de6596a5dc70aabe4b9d28d0d))

## [2.4.2](https://github.com/The-ReNaGe/RideLog/compare/v2.4.1...v2.4.2) (2026-09-09)


### Bug Fixes

* **deps:** corrige des CVE sur PyJWT, python-multipart et axios ([e33f53d](https://github.com/The-ReNaGe/RideLog/commit/e33f53d4b0fb49ee916231458f94f6d6c55094f8))

## [2.4.1](https://github.com/The-ReNaGe/RideLog/compare/v2.4.0...v2.4.1) (2026-09-08)


### Bug Fixes

* connecte l'intégration Home Assistant au port de l'interface web ([5fa2568](https://github.com/The-ReNaGe/RideLog/commit/5fa25682415209830c295512d0c92c14daeb8e42))
* nomme la cause d'un échec de configuration Home Assistant ([3c07567](https://github.com/The-ReNaGe/RideLog/commit/3c075674f04e58d94cc8b934d4a0136fd30679a9))
* plafonne les tentatives sur la route d'initialisation Home Assistant ([583e2e9](https://github.com/The-ReNaGe/RideLog/commit/583e2e945c8694ce26af11dec2387e8fe8e88fea))
* rétablit la copie du YAML Lovelace hors HTTPS ([f9d59f9](https://github.com/The-ReNaGe/RideLog/commit/f9d59f9edf8af58e231affd33d7ca776bee0d691))
* sort la clé d'initialisation de l'URL, où les journaux la recopiaient ([f74305e](https://github.com/The-ReNaGe/RideLog/commit/f74305ed8aca4df8f4d9c6320f2ec636543fbaae))

## [2.4.0](https://github.com/The-ReNaGe/RideLog/compare/v2.3.1...v2.4.0) (2026-08-30)


### Features

* affiche chaque montant dans la devise où il a été saisi ([9b92ee0](https://github.com/The-ReNaGe/RideLog/commit/9b92ee03fb76184f6c56d0dc4cd773db542361e5))
* affiche les kilométrages dans l'unité choisie ([b59fde8](https://github.com/The-ReNaGe/RideLog/commit/b59fde8484c2e36188e8d1ef4dd98e13e7f36fe6))
* ajoute le choix de la devise, euro et dollar ([c95d4c7](https://github.com/The-ReNaGe/RideLog/commit/c95d4c75394bbacedc2a6604fae049ba16345bbe))
* ajoute un moteur de traduction dont les clés sont les chaînes françaises ([b4d2fd2](https://github.com/The-ReNaGe/RideLog/commit/b4d2fd21377a2ce787ff5ac5550cb11cad6bab39))
* applique l'unité choisie à tous les kilométrages, affichage et saisie ([844eb5b](https://github.com/The-ReNaGe/RideLog/commit/844eb5b8051380f6b79f53f904a7c500924dd248))
* choisit le pays de l'instance depuis les paramètres ([c00acb5](https://github.com/The-ReNaGe/RideLog/commit/c00acb52d64cbc89e6e426610cc3f260c5367dc8))
* convertit les distances en miles sans jamais passer par une virgule ([51f3083](https://github.com/The-ReNaGe/RideLog/commit/51f3083fba10505f0fccb0407ff7600921db9b14))
* convertit les montants vers une autre devise, au taux choisi ([8f26183](https://github.com/The-ReNaGe/RideLog/commit/8f261839366d804ad011595ee0e352adbfeddda2))
* dessine les drapeaux de pays dans un composant à part ([fe7afa1](https://github.com/The-ReNaGe/RideLog/commit/fe7afa12231b5b646b0859a278fce01d6bd86941))
* enregistre la devise de chaque montant saisi ([6ac82cd](https://github.com/The-ReNaGe/RideLog/commit/6ac82cd94e3b36e740e49b53e5b68814e9490758))
* expose le pays du véhicule et la devise dans l'interface ([e8358c9](https://github.com/The-ReNaGe/RideLog/commit/e8358c921ce1e560597e26ebc404937b79b11857))
* expose un formateur d'unités lié aux préférences ([c9be971](https://github.com/The-ReNaGe/RideLog/commit/c9be9716df65cb3b399957f0a3ed9d0f2e72c6c8))
* expose un formateur de date et de nombre lié à la langue ([37ed7b3](https://github.com/The-ReNaGe/RideLog/commit/37ed7b3e91f97226fd93422fa9e0e1fe4ae6c6c9))
* rattache le contrôle technique au pays du véhicule ([ef6f1ec](https://github.com/The-ReNaGe/RideLog/commit/ef6f1ec0293784086834c5d581fc4e452057c8cc))
* retient aussi le système d'unités, et fait du pays le défaut des deux ([b054add](https://github.com/The-ReNaGe/RideLog/commit/b054add8140f0150161f9ef926d44c663377b90f))
* retient la langue d'interface choisie par chaque utilisateur ([08abecf](https://github.com/The-ReNaGe/RideLog/commit/08abecfaabb2cc42de58dcfaab9b871cdcd60205))
* réunit pays, langue et unités dans un onglet Préférences ([5721d00](https://github.com/The-ReNaGe/RideLog/commit/5721d00177f3e5e9073ac66a4a6883114ea130fb))
* signale à l'écran ce qui dépend du pays ([8d19f51](https://github.com/The-ReNaGe/RideLog/commit/8d19f5165dd04e8afd123050f8f1276138c7228c))
* traduit l'écran de connexion, le garage, le tableau de bord et l'entretien ([393c875](https://github.com/The-ReNaGe/RideLog/commit/393c875e16bbe21d7fe544209d296d15928e25c5))
* traduit la console d'administration ([231b44a](https://github.com/The-ReNaGe/RideLog/commit/231b44a4c9ffa31a27f6727783f158c4cfdc088d))
* traduit la coquille de l'application et ouvre le choix de la langue ([659fb20](https://github.com/The-ReNaGe/RideLog/commit/659fb20fc09141bcc9016484d1c14f6977726c49))


### Bug Fixes

* fait lire à l'audit i18n le texte reçu à l'exécution ([35d966b](https://github.com/The-ReNaGe/RideLog/commit/35d966be87879dc017a87d544cee05697a518de0))
* intitule la page du garage d'après le nom du foyer ([03c4039](https://github.com/The-ReNaGe/RideLog/commit/03c4039257a1d93420dbc4f32f08fd337b129cbf))
* marque la devise d'un montant modifié qui n'en portait pas ([9bd219d](https://github.com/The-ReNaGe/RideLog/commit/9bd219d640d5a4c02f8876e346fc824101ca31e3))
* refuse un pays d'immatriculation que cette version ne connaît pas ([6b241f8](https://github.com/The-ReNaGe/RideLog/commit/6b241f8afb0a70cd1cdfb0c11baecad6bacecdc9))
* rend le bloc de décodage VIN lisible en thème sombre ([0342bb5](https://github.com/The-ReNaGe/RideLog/commit/0342bb5ac016879386c7a66bef8c4a176e91131a))
* rétablit t() dans les composants qui ne l'avaient pas ([fbf23ae](https://github.com/The-ReNaGe/RideLog/commit/fbf23ae446e7f38727e72ca43ea7dea11886cf15))
* signale les statistiques carburant qui enjambent deux devises ([acf3ae9](https://github.com/The-ReNaGe/RideLog/commit/acf3ae98a62258522cdda79272d21405bb4572d9))
* ventile les totaux du tableau de bord au lieu de les additionner ([396e0c4](https://github.com/The-ReNaGe/RideLog/commit/396e0c402ffef670ef56f53695d584f3a70733d9))
* ventile les totaux qui enjambent deux devises au lieu de les additionner ([b58eb12](https://github.com/The-ReNaGe/RideLog/commit/b58eb12d6e6236bf068fa693d7d1c93e743b2ec5))
* écrit les dates dans la langue de l'interface, plus en français ([fa476b6](https://github.com/The-ReNaGe/RideLog/commit/fa476b644454bc95f39a2554008ee006e8fcf58a))

## [2.3.1](https://github.com/The-ReNaGe/RideLog/compare/v2.3.0...v2.3.1) (2026-08-30)


### Bug Fixes

* corrige la commande de build du guide de contribution ([4869702](https://github.com/The-ReNaGe/RideLog/commit/4869702f040fbf9bfdb17e707d4850363d15261a))

## [2.3.0](https://github.com/The-ReNaGe/RideLog/compare/v2.2.1...v2.3.0) (2026-08-27)


### Features

* ajoute des entretiens récurrents absents du catalogue ([f8cb15e](https://github.com/The-ReNaGe/RideLog/commit/f8cb15e2301eedc3dd1c2b86009165c9a455153e))
* commande le plan d'entretien depuis l'onglet « À venir » ([1ced79f](https://github.com/The-ReNaGe/RideLog/commit/1ced79f30951dba816e8b69cb808b19277c3e7e6))
* écarte les entretiens qui ne concernent pas un véhicule ([0eeff7e](https://github.com/The-ReNaGe/RideLog/commit/0eeff7e84b4424251e23fe98a1df62b92be22ba8))
* rend modifiable la périodicité du contrôle technique ([950c27c](https://github.com/The-ReNaGe/RideLog/commit/950c27c88aaf70286ac55587b9c147ca4313d33f))

## [2.2.1](https://github.com/The-ReNaGe/RideLog/compare/v2.2.0...v2.2.1) (2026-08-27)


### Bug Fixes

* signale sur l'accueil les véhicules dont un entretien est en retard ([ec684a8](https://github.com/The-ReNaGe/RideLog/commit/ec684a8283c731597ba54c48619b19f52ac44916))
* signale sur l'accueil les véhicules dont un entretien est en retard ([98b3a26](https://github.com/The-ReNaGe/RideLog/commit/98b3a2617eba06614ad2c9816a0844dc5998a927))

## [2.2.0](https://github.com/The-ReNaGe/RideLog/compare/v2.1.0...v2.2.0) (2026-08-26)


### Features

* remplace les émojis de l'interface par un jeu d'icônes SVG ([754c60e](https://github.com/The-ReNaGe/RideLog/commit/754c60eff855a7c6a2998882ced85309205196ba))
* regroupe chaque garage dans un bloc délimité, en-tête et décompte compris ([754c60e](https://github.com/The-ReNaGe/RideLog/commit/754c60eff855a7c6a2998882ced85309205196ba))
* affiche les photos de véhicule en entier, dans des cadres au format 3/2 ([754c60e](https://github.com/The-ReNaGe/RideLog/commit/754c60eff855a7c6a2998882ced85309205196ba))
* réaligne l'interface sur les codes macOS : palette, barre translucide, sélecteur de section centré ([754c60e](https://github.com/The-ReNaGe/RideLog/commit/754c60eff855a7c6a2998882ced85309205196ba))
* déplace la suppression d'un véhicule de la liste vers sa fiche, pour éviter les clics involontaires ([754c60e](https://github.com/The-ReNaGe/RideLog/commit/754c60eff855a7c6a2998882ced85309205196ba))


### Bug Fixes

* rétablit sept jetons CSS jamais définis, dont les encarts s'affichaient sans fond ([754c60e](https://github.com/The-ReNaGe/RideLog/commit/754c60eff855a7c6a2998882ced85309205196ba))
* rétablit le chevron des listes déroulantes en thème sombre ([754c60e](https://github.com/The-ReNaGe/RideLog/commit/754c60eff855a7c6a2998882ced85309205196ba))
* charge les photos du tableau de bord avec le jeton d'authentification ([754c60e](https://github.com/The-ReNaGe/RideLog/commit/754c60eff855a7c6a2998882ced85309205196ba))
* retire les couleurs Tailwind figées, illisibles en thème sombre ([754c60e](https://github.com/The-ReNaGe/RideLog/commit/754c60eff855a7c6a2998882ced85309205196ba))

## [2.1.0](https://github.com/The-ReNaGe/RideLog/compare/v2.0.2...v2.1.0) (2026-08-26)


### Features

* clarifie la vue partagée, recadre deux blocs et fixe le système de design ([3561aca](https://github.com/The-ReNaGe/RideLog/commit/3561acaec8dc9448f3ef08d3c18a347712800775))
* gestion des groupes famille et de leurs invitations ([940ea77](https://github.com/The-ReNaGe/RideLog/commit/940ea776c924350957af12e09db96f84ffa9bf31))
* groupes famille — partage en lecture des véhicules du foyer ([a5d9df5](https://github.com/The-ReNaGe/RideLog/commit/a5d9df568dff1f7b2ae0243ed7013ab0a3ddca72))
* interface de gestion du groupe famille ([234c38c](https://github.com/The-ReNaGe/RideLog/commit/234c38cbf392ba28a80af563e7379ba762521879))
* modèle de données des groupes famille ([71d21b6](https://github.com/The-ReNaGe/RideLog/commit/71d21b6866b84d5c9c62346c856bd0f479ba0673))
* partage en lecture des véhicules du groupe famille ([e3f2187](https://github.com/The-ReNaGe/RideLog/commit/e3f2187c4f77e328b787df16109225b828c61d76))
* regroupe la liste par garage et recadre la case « véhicule privé » ([4cc2005](https://github.com/The-ReNaGe/RideLog/commit/4cc20052d8b54947c5b85a682a545f300a433d54))
* réserve l'inscription aux admins et ouvre le renommage à tous ([f104cec](https://github.com/The-ReNaGe/RideLog/commit/f104ceca6e79ce72f6006e4d92e257b7828984d7))
* unifie la largeur des paramètres et resserre la liste des membres ([26b7a57](https://github.com/The-ReNaGe/RideLog/commit/26b7a575d2f5742556653f47c0446a9d44cfa87b))

## [2.0.2](https://github.com/The-ReNaGe/RideLog/compare/v2.0.1...v2.0.2) (2026-08-25)


### Bug Fixes

* re-résout le backend au lieu de figer son IP au démarrage de nginx ([892364f](https://github.com/The-ReNaGe/RideLog/commit/892364f42e5f0693315d3098405ea1b76ce6881f))
* re-résout le backend au lieu de figer son IP au démarrage de nginx ([4cdc102](https://github.com/The-ReNaGe/RideLog/commit/4cdc10244d0bb7948039dabb21c542f9edbcaef5))

## [2.0.1](https://github.com/The-ReNaGe/RideLog/compare/v2.0.0...v2.0.1) (2026-08-14)


### Bug Fixes

* publie l'image de version, que release-please n'arrivait pas à déclencher ([c64a6dd](https://github.com/The-ReNaGe/RideLog/commit/c64a6ddad4b3b7d9e6b1f3be0924e83cb7e51ad1))
* publie l'image de version, que release-please n'arrivait pas à déclencher ([ae313ea](https://github.com/The-ReNaGe/RideLog/commit/ae313ea094d3bff4f3756e75d0731cc4fb6148a8))

## [2.0.0](https://github.com/The-ReNaGe/RideLog/compare/v1.9.0...v2.0.0) (2026-08-14)


### ⚠ BREAKING CHANGES

* `docker compose up -d --build` ne construit plus le code du dépôt. La mise à jour devient `docker compose pull && docker compose up -d`, et toute modification locale du code reste sans effet sans la surcharge docker-compose.dev.yml. Les données ne sont pas concernées : elles vivent dans ./data, en dehors des images. Procédure détaillée dans le README.

### Features

* distribue des images publiées plutôt qu'un build local ([80bec74](https://github.com/The-ReNaGe/RideLog/commit/80bec744115e74999dfe82da99a6819f550c45f4)), closes [#13](https://github.com/The-ReNaGe/RideLog/issues/13)

## [1.9.0](https://github.com/The-ReNaGe/RideLog/compare/v1.8.0...v1.9.0) (2026-08-14)


### Features

* renseigne la clé technique à l'enregistrement d'un entretien ([5738016](https://github.com/The-ReNaGe/RideLog/commit/5738016c38673fc1ae33b898f8c5f05e7e9ba763))
* stocke la clé technique d'intervention en base ([b6b267a](https://github.com/The-ReNaGe/RideLog/commit/b6b267a492b64da7176887c86589c2fd33cbf3e7))


### Bug Fixes

* fait foi de la clé stockée plutôt que du libellé affiché ([f8df7f9](https://github.com/The-ReNaGe/RideLog/commit/f8df7f9d7fcdcd122f5d4d7c09fb2f54d65cc44f))

## [1.8.0](https://github.com/The-ReNaGe/RideLog/compare/v1.7.4...v1.8.0) (2026-08-14)


### Features

* versionne les migrations de schéma et vérifie leur intégrité ([dcad773](https://github.com/The-ReNaGe/RideLog/commit/dcad77303cacb3ee83ea884826361ef8c703dda9))
* versionne les migrations de schéma et vérifie leur intégrité ([a0dedba](https://github.com/The-ReNaGe/RideLog/commit/a0dedba99cd0473a14ff4233de5abf97ab07f958))

## [1.7.4](https://github.com/The-ReNaGe/RideLog/compare/v1.7.3...v1.7.4) (2026-08-13)


### Bug Fixes

* exige une authentification sur les stations essence et met en cache /search ([821a351](https://github.com/The-ReNaGe/RideLog/commit/821a3511ee4c9f2f0ecec4654bab75c9afed26d4))
* n'expose plus l'existence d'un compte à l'inscription ([e430b6d](https://github.com/The-ReNaGe/RideLog/commit/e430b6df7eda0ba4da020ae668a34f93a9616150))

## [1.7.3](https://github.com/The-ReNaGe/RideLog/compare/v1.7.2...v1.7.3) (2026-08-13)


### Bug Fixes

* durcit l'instance pour une exposition Internet ([28d99e5](https://github.com/The-ReNaGe/RideLog/commit/28d99e5b72b3113db287134b705a9adc696ec779))

## [1.7.2](https://github.com/The-ReNaGe/RideLog/compare/v1.7.1...v1.7.2) (2026-08-13)


### Bug Fixes

* corrige 4 failles de sécurité (rate limiter, JWT, photos, dépend… ([e21fae4](https://github.com/The-ReNaGe/RideLog/commit/e21fae425e6bafce37d193a4def5ce7c3900b2e3))
* corrige 4 failles de sécurité (rate limiter, JWT, photos, dépendance morte) ([f0bfbff](https://github.com/The-ReNaGe/RideLog/commit/f0bfbffe590dafa8db264f8f76db138d7c80620e))

## [1.7.1](https://github.com/The-ReNaGe/RideLog/compare/v1.7.0...v1.7.1) (2026-08-12)


### Bug Fixes

* corrige 3 bugs dans le calcul des échéances d'entretien ([24ecb20](https://github.com/The-ReNaGe/RideLog/commit/24ecb20b19ca43580917a95881852c02941a4250))

## [1.7.0](https://github.com/The-ReNaGe/RideLog/compare/v1.6.0...v1.7.0) (2026-08-12)


### Features

* changement de mot de passe en libre-service ([#3](https://github.com/The-ReNaGe/RideLog/issues/3)) ([ecfe1ae](https://github.com/The-ReNaGe/RideLog/commit/ecfe1ae8bff004f8510feda49b402d831f9d90c0))
* invalide les JWT après un changement de mot de passe ([e622210](https://github.com/The-ReNaGe/RideLog/commit/e6222103a5c0f63abe10852d7f978bd2a262fc35))
* réinitialisation de mot de passe par un admin, sans SMTP (closes [#3](https://github.com/The-ReNaGe/RideLog/issues/3)) ([0725fac](https://github.com/The-ReNaGe/RideLog/commit/0725fac78b7a0e6be7b3395ea32dd1cc660d1bad))
* réinitialisation de mot de passe sans SMTP ([#3](https://github.com/The-ReNaGe/RideLog/issues/3)) ([b9f2114](https://github.com/The-ReNaGe/RideLog/commit/b9f2114ef17b0332efc749aa0b27be1a80c58af8))

## [1.6.0](https://github.com/The-ReNaGe/RideLog/compare/v1.5.3...v1.6.0) (2026-08-12)


### Features

* add car revision checklist modal triggered on oil change ([0633c25](https://github.com/The-ReNaGe/RideLog/commit/0633c2532a60c135a8f98dbb28d42dde2d9c6f39))
* Ajout edition des intervention sur la modif ([a04241e](https://github.com/The-ReNaGe/RideLog/commit/a04241e36f4bfa94beb08988f91fa36178696cc9))
* Ajout edition des intervention sur la modif ([e92ef5a](https://github.com/The-ReNaGe/RideLog/commit/e92ef5a560534547bdbe0bc41ee4e1fbe96a898d))
* checklist de révision voiture/moto en popup avec regroupement d'historique ([465bb95](https://github.com/The-ReNaGe/RideLog/commit/465bb954571a223644b6872052ad009193b23a57))
* checklist de révision voiture/moto en popup avec regroupement historique ([3040293](https://github.com/The-ReNaGe/RideLog/commit/30402935451d40a296297f0c5622a38f98f6485e))
* filtrer checklist voiture selon motorisation + renommer vidange en entretien général ([ba7ee63](https://github.com/The-ReNaGe/RideLog/commit/ba7ee631703c96b88eb0810b5dddc1f560c2e922))
* group all revision items into single maintenance history entry ([779e8dd](https://github.com/The-ReNaGe/RideLog/commit/779e8dd2d0f2e9f4ad6a7de53e3bebd028043229))
* v1.5.0 ([e1079d8](https://github.com/The-ReNaGe/RideLog/commit/e1079d850a771269abf9694b7898da331d6e6ea0))


### Bug Fixes

* Correction de la méthode de calcul en dernier entretien + interval ([65363e5](https://github.com/The-ReNaGe/RideLog/commit/65363e54b17d9256aab6b4d03d982821defcfc95))
* Correction des invitations qui ne marchaient plus ([b28960c](https://github.com/The-ReNaGe/RideLog/commit/b28960c072f22fa6191ab16a5d31392259ee89aa))
* Correction inscription mode privé ([42edf65](https://github.com/The-ReNaGe/RideLog/commit/42edf65126edb4570e192d488d91d81623772423))
* corrige les inscriptions (copie du lien d'invitation + création de compte en mode privé) ([83a64ca](https://github.com/The-ReNaGe/RideLog/commit/83a64ca737992e06da09c680a7fcc170b6004973))
* corriger le déclenchement de la checklist voiture sur vidange ([f01a24f](https://github.com/The-ReNaGe/RideLog/commit/f01a24fb2c43795d6be12fa73c5ac4098c8eb6d6))
* v1.5.1 ([6231dbd](https://github.com/The-ReNaGe/RideLog/commit/6231dbde02e0f221861cdc65de7a300317f78793))
* vidange non pris en compte ([69b4c0c](https://github.com/The-ReNaGe/RideLog/commit/69b4c0c712e09d98537964eb28779751af5e3003))
