# Modèle de Sécurité & RBAC - PackPanel

Ce document détaille les garanties, politiques et mécanismes de sécurité intégrés dans **PackPanel**.

---

## 1. Authentification & Contrôle d'Accès (RBAC)

### 1.1 Hachage Cryptographique Argon2id
Tous les mots de passe sont stockés sous forme de hachages **Argon2id**, la fonction de dérivation recommandée par l'OWASP :
- `type: argon2id`
- `memoryCost: 65536` (64 Mio de mémoire par dérivation)
- `timeCost: 3` (3 itérations)
- `parallelism: 4`
- Protection contre les attaques temporelles (*timing attacks*) via comparaison en temps constant.

### 1.2 Gestion des Sessions & Cookies
- Les sessions utilisent des cookies HTTP signés cryptographiquement via une clé secrète de session (`SESSION_SECRET`).
- En-têtes appliqués : `HttpOnly` (inaccessible au JavaScript client, prévention XSS), `SameSite=Lax` (protection CSRF), et `Path=/`.
- Révocation immédiate lors de la déconnexion et expiration configurable.

### 1.3 Matrice des Rôles (RBAC)

| Fonctionnalité | Lecteur (`viewer`) | Opérateur (`operator`) | Administrateur (`admin`) |
| :--- | :---: | :---: | :---: |
| Visualiser le tableau de bord et les statistiques | ✓ | ✓ | ✓ |
| Explorer les fichiers et consulter les manifestes | ✓ | ✓ | ✓ |
| Comparer les versions (*Diff*) | ✓ | ✓ | ✓ |
| Téléverser des fichiers / ZIP (TUS, direct) | ✗ | ✓ | ✓ |
| Éditer ou supprimer des fichiers dans l'explorateur | ✗ | ✓ | ✓ |
| Publier une version ou effectuer un Rollback | ✗ | ✓ | ✓ |
| Créer, modifier ou promouvoir un endpoint | ✗ | ✓ | ✓ |
| Gérer les utilisateurs (création, rôles, suppression)| ✗ | ✗ | ✓ |
| Consulter le journal d'audit complet | ✗ | ✗ | ✓ |
| Annuler des tâches de fond | ✗ | ✓ | ✓ |

---

## 2. Sécurité des Téléversements & Ingestion de Fichiers

### 2.1 Protection Contre les Bombes ZIP (*Zip-Bomb Defense*)
Lors de l'extraction d'une archive ZIP :
- **Taille Décompressée Maximale** : Le décompresseur comptabilise le flux en continu. Si le volume total extrait dépasse `MAX_ZIP_EXTRACT_SIZE_MIB` (défaut : 4096 Mo), l'extraction est immédiatement avortée et les fichiers temporaires purgés.
- **Nombre Maximal d'Entrées** : Si l'archive contient plus de `MAX_ZIP_ENTRY_COUNT` (défaut : 20 000 fichiers), le traitement est rejeté.
- **Ratio d'Expansion Anormal** : Détection des ratios de compression extrêmes.

### 2.2 Prévention des Traversées de Répertoires (*Path Traversal*)
Tous les chemins de fichiers (qu'ils proviennent d'un flux TUS, d'un upload multipart ou d'une entrée ZIP) passent par `assertSanitizedRelativePath()` :
- Rejet catégorique de `..` et `.` dans tous les segments.
- Suppression des barres obliques de début et normalisation en séparateurs UNIX `/`.
- Interdiction des octets nuls (`\0`) et caractères de contrôle CRLF.

### 2.3 Protection de Compatibilité Client Windows
Puisque les clients Minecraft s'exécutent très fréquemment sur Windows, le serveur valide et neutralise les contraintes spécifiques à cet OS :
- **Noms Réservés Windows** : Rejet des noms `CON`, `PRN`, `AUX`, `NUL`, `COM1-COM9`, `LPT1-LPT9` (avec ou sans extension).
- **Caractères Interdits** : Rejet des caractères `< > : " | ? *`.
- **Espaces et Points Finaux** : Rejet des segments se terminant par un point ou un espace (inaccessibles sous Windows).
- **Détection des Collisions de Casse** : Si un lot contient simultanément `config/JEI/recipe.json` et `config/jei/recipe.json`, le lot est rejeté avec une erreur explicite pour éviter l'écrasement aléatoire sur le poste du joueur.

### 2.4 Détection des Archives Nues (Manifestes CurseForge / Modrinth)
Un piège courant consiste à téléverser le petit fichier ZIP de modpack exporté depuis CurseForge (contenant uniquement `manifest.json` sans les fichiers `.jar` de mods). PackPanel analyse l'archive à l'ingestion : s'il s'agit d'un tel export sans mod réel, l'import est rejeté avec un message d'avertissement clair guidant l'utilisateur.

---

## 3. Sécurité Réseau & Conteneurs

1. **Isolation Réseau Docker** :
   - Les conteneurs `postgres`, `api` et `worker` ne publient **aucun port sur l'hôte**.
   - Ils communiquent sur un sous-réseau interne privé `packpanel-internal`.
   - Seul `nginx` publie les ports `8080` et `8081`.

2. **Privilèges et Sockets** :
   - Aucun conteneur ne tourne avec l'indicateur `--privileged`.
   - Le socket Docker de l'hôte (`/var/run/docker.sock`) **n'est jamais monté** dans aucun conteneur applicatif.

3. **Protection des Secrets** :
   - Aucun mot de passe ni clé secrète n'est écrit dans le code source ou dans les images Docker.
   - Les variables sensibles sont injectées via le fichier `.env` sur le serveur avec des permissions restrictives (`chmod 600`).
   - Les fichiers temporaires d'upload sont systématiquement nettoyés lors des échecs ou après le transfert vers le CAS.
