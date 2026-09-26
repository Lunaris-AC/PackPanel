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

## 3. Démarrage & Installation Rapide

### Prérequis
- Système Linux (Ubuntu, Debian, AlmaLinux, Rocky, Alpine, etc.)
- Ports `8080` (Admin) et `8081` (Distribution) disponibles
- Docker et Docker Compose (installés automatiquement par le script si absents)

### Installation Automatisée en une commande

```bash
git clone https://github.com/<votre-organisation>/packpanel.git /opt/packpanel
cd /opt/packpanel
sudo chmod +x install.sh
sudo ./install.sh
```

Le script automatisé prend en charge l'intégralité du cycle de mise en service :
1. Détection et installation automatique des dépendances (Docker, Compose, OpenSSL).
2. Configuration guidée (ou automatique en variables d'environnement) des domaines et ports.
3. Préparation des répertoires de stockage `/srv/packpanel` avec permissions strictes (`0750` / `0700`).
4. Génération de mots de passe cryptographiques forts et d'un secret de session aléatoire.
5. Compilation multi-étapes sécurisée des conteneurs applicatifs et du frontend.
6. Initialisation du schéma PostgreSQL 16 et du compte administrateur avec hachage Argon2id.
7. Exécution d'un test de conformité immédiat (*smoke test*) pour valider les deux listeners.
8. Consignation sécurisée des identifiants dans `/srv/packpanel/admin_credentials.txt` (chmod 600).

---

## 4. Documentation Détaillée

- [Architecture détaillée et flux de données](docs/ARCHITECTURE.md)
- [Modèle de sécurité et RBAC](docs/SECURITY.md)
- [Manuel d'exploitation, sauvegardes et maintenance](docs/OPERATIONS.md)
- [Rapport de tests et conformité MineLaunched](docs/TEST_REPORT.md)
- [Rapport de déploiement serveur](docs/DEPLOYMENT_REPORT.md)
- [Configuration Zoraxy et Cloudflare](docs/ZORAXY_CLOUDFLARE.md)
