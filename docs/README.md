# PackPanel - Serveur de Distribution et Panel d'Administration Modpack

PackPanel est une application full-stack moderne, autonome et auto-hébergée, conçue spécifiquement pour administrer et distribuer des modpacks Minecraft conformes au **contrat MineLaunched**.

---

## 1. Fonctionnalités Clés

- **Contrat MineLaunched Strict** : Génération de manifestes `index.php` canoniques garantissant le tri hiérarchique déterministe (dossiers parents avant enfants), empreintes SHA-1 minuscules sur 40 caractères, booléen `false` pour les répertoires, et directives de nettoyage `dirCheckUselessFiles` positionnées en fin de document.
- **Séparation stricte des écoutes (Dual-Listener)** :
  - **Port 8080 (Admin & API)** : Interface web React moderne (thème clair/sombre, responsive, français), API Fastify privée, flux d'événements SSE, téléversements sécurisés.
  - **Port 8081 (Distribution Publique)** : Distribution statique ultra-performante par Nginx direct. Aucun accès à l'administration, fonctionnement autonome garanti même en cas d'arrêt de l'API, du worker ou de PostgreSQL.
- **Stockage Adressé par le Contenu (CAS)** :
  - Stockage physique dédupliqué par SHA-256 avec double hachage en flux unique (SHA-1 + SHA-256 simultanés).
  - Liens matériels (*hardlinks*) pour la composition des versions sans duplication d'espace disque.
- **Téléversements résilients et sécurisés** :
  - Protocole **TUS chunked resumable** résistant aux micro-coupures réseau.
  - Import direct d'archives ZIP avec protection contre les zip-bombs et les traversées de chemins.
  - Deux modes d'ingestion : **Ajout / Remplacement ciblé** (*Add & Replace*) ou **Remplacement complet** (*Full Replace Snapshot*).
- **Gestion des Versions & Rollback Atomique** :
  - Versions immuables identifiées par `r0001`, `r0002`...
  - Retour arrière instantané en un clic avec bascule atomique du manifeste.
  - Outil de comparaison visuel (*Diff*) des ajouts, modifications et suppressions entre versions.
  - Protection contre la purge automatique via épinglage (*Pin*).
- **File de tâches d'arrière-plan résiliente** :
  - Traitements lourds orchestrés via PostgreSQL (`FOR UPDATE SKIP LOCKED`) avec heartbeat et retry backoff exponentiel.

---

## 2. Architecture Technique

| Composant | Technologie | Rôle |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS | Interface utilisateur réactive, accessible, thèmes clair/sombre |
| **Backend API** | Node.js LTS (20), TypeScript, Fastify | API REST modulaire, gestion TUS, Server-Sent Events (SSE) |
| **Background Worker** | Node.js LTS, PostgreSQL Job Queue | Extraction ZIP, hachage, assemblage CAS, ramasse-miettes (GC) |
| **Base de données** | PostgreSQL 16 | Inventaire CAS, versions, sessions d'upload, audit logs, file de tâches |
| **Reverse Proxy & Statique** | Nginx Alpine | Service SPA sur 8080, distribution directe des fichiers/manifestes sur 8081 |

---

## 3. Démarrage Rapide

### Prérequis
- Docker et Docker Compose v2+
- Ports `8080` et `8081` disponibles sur la machine hôte

### Déploiement en une commande
```bash
git clone <repo> /opt/packpanel
cd /opt/packpanel
./scripts/deploy.sh
```

Le script configure automatiquement les répertoires `/srv/packpanel`, génère des secrets forts dans `.env`, compile les conteneurs, applique les migrations PostgreSQL, crée le compte administrateur initial et exécute les tests de conformité.

---

## 4. Documentation Détaillée

- [Architecture détaillée et flux de données](ARCHITECTURE.md)
- [Modèle de sécurité et RBAC](SECURITY.md)
- [Manuel d'exploitation, sauvegardes et maintenance](OPERATIONS.md)
- [Rapport de tests et conformité MineLaunched](TEST_REPORT.md)
- [Rapport de déploiement serveur](DEPLOYMENT_REPORT.md)
- [Configuration Zoraxy et Cloudflare](ZORAXY_CLOUDFLARE.md)
