# Rapport de Déploiement en Production - PackPanel

Ce rapport documente l'installation, la configuration et la mise en service effective de **PackPanel** sur le serveur désigné.

---

## 1. Caractéristiques de l'Environnement Serveur

- **Hôte cible** : `192.168.1.171`
- **Type d'instance** : Conteneur Linux Proxmox VE (LXC unprivileged)
- **Système d'exploitation** : Ubuntu 26.04 LTS (x86_64)
- **Ressources allouées** : 4 cœurs vCPU, 4 Go RAM, 127 Go de disque (120 Go d'espace libre)
- **Moteur d'exécution** : Docker Engine v29.1.3 & Docker Compose v2.40.3

---

## 2. Inventaire des Services & Conteneurs Déployés

| Conteneur | Image de Base | Ports Réseau | Rôle Technique |
| :--- | :--- | :--- | :--- |
| **`packpanel-nginx`** | `nginx:alpine` | **`8080`**, **`8081`** (Publics) | Service SPA React (8080), reverse proxy API (8080), distribution statique directe (8081) |
| **`packpanel-api`** | `node:20-bookworm-slim` | Aucun (Interne : 3000) | API REST Fastify, flux SSE, gestion des sessions d'upload TUS |
| **`packpanel-worker`** | `node:20-bookworm-slim` | Aucun | Traitement asynchrone, hachage, extraction ZIP, construction des versions CAS |
| **`packpanel-postgres`** | `postgres:16-alpine` | Aucun (Interne : 5432) | Base de données relationnelle, inventaire CAS, file de tâches persistante |

---

## 3. Structure des Répertoires Installés

### Répertoire Applicatif : `/opt/packpanel`
- `compose.yaml` : Définition des 4 services Docker Compose.
- `Dockerfile` : Définition multi-étapes de compilation et d'exécution Node.js.
- `.env` : Variables d'environnement en production (secrets générés aléatoirement, permissions `600`).
- `frontend/dist/` : Interface utilisateur React compilée pour la production.
- `scripts/` : Scripts de déploiement (`deploy.sh`), smoke test (`smoke-test.sh`), sauvegarde (`backup.sh`) et restauration (`restore.sh`).

### Répertoire de Données : `/srv/packpanel`
- `/srv/packpanel/storage/objects/` : Magasin de stockage physique dédoublonné par SHA-256 (CAS).
- `/srv/packpanel/storage/endpoints/` : Arborescence publique servie par Nginx (`/<slug>/index.php` et `/<slug>/releases/`).
- `/srv/packpanel/storage/uploads/` : Répertoire de travail temporaire pour les morceaux TUS et archives ZIP.
- `/srv/packpanel/backups/` : Archives des sauvegardes complètes avec rétention automatisée.
- `/srv/packpanel/admin_credentials.txt` : Identifiants initiaux du compte administrateur (permissions `600`).

---

## 4. Identifiants & Accès

- **URL d'Administration (Panel & API)** : `http://192.168.1.171:8080/`
- **URL de Distribution (Fichiers & Manifestes)** : `http://192.168.1.171:8081/`
- **Compte Administrateur Initial** :
  - Identifiant : `admin`
  - Mot de passe : `mQMXiXmYSTB6EEfhnYU4Ow` *(Généré et consigné dans `/srv/packpanel/admin_credentials.txt`)*
  - Hachage de sécurité : Argon2id

---

## 5. Vérification & État de Fonctionnement

Le statut opérationnel a été vérifié :
1. Les 4 conteneurs Docker tournent avec le statut `Up` et la base PostgreSQL est `Healthy`.
2. Le script de smoke test confirme que le listener 8080 répond `HTTP 200` sur `/api/health` et sert l'application React.
3. Le listener 8081 retourne bien `HTTP 404` sur les chemins inexistants et isole complètement l'accès à l'API.
4. Un endpoint de test `testpack` a été provisionné et a généré avec succès un manifeste canonique MineLaunched sur `http://192.168.1.171:8081/testpack/index.php`.
5. Le script de sauvegarde `/opt/packpanel/scripts/backup.sh` a été exécuté et a produit une archive valide dans `/srv/packpanel/backups/`.
6. La suite complète des 10 tests d'intégration (`/opt/packpanel/scripts/integration-test.sh`) a été exécutée in-situ avec 100% de succès (10/10 tests validés).
