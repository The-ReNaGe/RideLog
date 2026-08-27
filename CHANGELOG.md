# Changelog

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
