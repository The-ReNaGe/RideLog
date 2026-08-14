# Changelog

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
