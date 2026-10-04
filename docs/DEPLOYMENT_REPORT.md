# Validation et déploiement — 4 octobre 2026

Le candidat est testé dans un environnement isolé sur `192.168.1.171`, ports
18080/18081, avec une base et un stockage distincts de la production.
Les identifiants et sessions de validation restent hors du dépôt.

La production utilise `/opt/packpanel`, `/srv/packpanel`, les ports 8080/8081
et le CDN HTTPS `mccdn.inferi.fr`. Les comptes existants sont conservés.

Les résultats du déploiement final et le chemin de la sauvegarde seront consignés
après vérification de la production. Voir [TEST_REPORT.md](TEST_REPORT.md) pour
la matrice des essais réellement effectués.
