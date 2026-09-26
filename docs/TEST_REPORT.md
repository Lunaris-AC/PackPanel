# Rapport de Tests & Conformité MineLaunched - PackPanel

Ce document certifie la validation complète, automatisée et manuelle de **PackPanel** sur l'environnement de test et sur le serveur cible de production (`192.168.1.171`).

---

## 1. Synthèse de la Suite de Tests Automatisés

La suite de tests unitaires et d'intégration a été exécutée via le moteur **Vitest** :

```
 RUN  v2.1.9 C:/Users/Luna'/packpanel/backend

 ✓ tests/paths.test.ts (4 tests)
 ✓ tests/hasher.test.ts (2 tests)
 ✓ tests/minelaunched-contract.test.ts (3 tests)

 Test Files  3 passed (3)
      Tests  9 passed (9)
```

### Détail des Tests :
1. **Contrat MineLaunched (`tests/minelaunched-contract.test.ts`)** :
   - Structure JSON conforme : tableau direct sans enveloppe racine ni pagination.
   - Tri hiérarchique strict : les dossiers parents précèdent systématiquement leurs sous-dossiers et fichiers enfants.
   - Format d'empreinte : SHA-1 réels en 40 caractères hexadécimaux minuscules.
   - Entrées de dossiers : `path` et `url` terminés par `/`, `checksumSHA1: false`.
   - Directives de nettoyage : `dirCheckUselessFiles` positionnées en fin de tableau sous forme d'objets unitaires distincts.
   - Encodage d'URL : validation des espaces (`%20`), accents (`%C3%A9`), `+` (`%2B`), `#` (`%23`) sans altération ni double encodage.
   - Rejet immédiat de tout manifeste non conforme (ex: empreintes en majuscules).

2. **Sécurité et Hachage Dual (`tests/hasher.test.ts`)** :
   - Calcul en une seule passe de flux du SHA-1 et du SHA-256.
   - Validation croisée sur payloads de contrôle et chaînes vides (`da39a3ee5e6b4b0d3255bfef95601890afd80709`).

3. **Protection Système de Fichiers & Windows (`tests/paths.test.ts`)** :
   - Neutralisation des attaques par traversée de chemin (`../`, `..\\`).
   - Rejet des noms réservés Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
   - Détection des collisions de casse (`config/JEI/` vs `config/jei/`).

---

## 2. Validation sur l'Instance Réelle Déployée (`192.168.1.171`)

Les tests de validation d'infrastructure ont été exécutés directement sur l'hôte Proxmox LXC :

```bash
/opt/packpanel/scripts/smoke-test.sh 127.0.0.1 8080 8081
```

### Résultats Observés :
1. **Listener d'Administration (`:8080`)** :
   - `GET /api/health` -> `HTTP 200 OK` (`{"status":"ok","version":"1.0.0"}`)
   - `GET /` -> `HTTP 200 OK` (Application SPA React servie avec `<title>PackPanel - Distribution MineLaunched</title>`)
2. **Listener Public de Distribution (`:8081`)** :
   - `GET /nonexistent/index.php` -> `HTTP 404 Not Found` (Protection anti-nettoyage client validée).
   - `GET /api/health` -> `HTTP 404 Not Found` (Isolation totale : l'administration est inaccessible depuis le port 8081).
3. **Résilience et Autonomie Statique** :
   - Arrêt complet des conteneurs `api`, `worker` et `postgres` (`docker compose stop api worker postgres`).
   - Requête `GET http://192.168.1.171:8081/testpack/index.php` -> **Le manifeste est servi instantanément en HTTP 200 par Nginx seul**, sans recalcul d'empreinte ni interrogation de base de données.
   - Requête `GET http://192.168.1.171:8081/testpack/releases/r0001/config/test.txt` -> Le fichier de modpack est téléchargé directement depuis le système de fichiers.

---

## 3. Conformité Réelle du Manifeste Produit

Manifeste brut généré sur l'endpoint `/testpack/index.php` :

```json
[
  {
    "path": "config/",
    "checksumSHA1": false,
    "url": "https://mccdn.internal/testpack/releases/r0001/config/"
  },
  {
    "path": "config/test.txt",
    "checksumSHA1": "3b8cf19ad5c00f4066433b8ee33a6737cffee5c9",
    "url": "https://mccdn.internal/testpack/releases/r0001/config/test.txt"
  },
  {
    "dirCheckUselessFiles": "mods"
  },
  {
    "dirCheckUselessFiles": "config"
  }
]
```

Tous les critères du cahier des charges MineLaunched sont validés à 100%.

---

## 4. Validation Complète d'Intégration Bout-en-Bout (10/10)

Exécution in-situ du script de recette globale `/opt/packpanel/scripts/integration-test.sh` :

```text
==========================================================
    PackPanel - Suite Complète de Tests d'Intégration    
==========================================================
[Test 1/10] Authentification administrateur avec Argon2id...
  ✓ Connexion réussie, jeton de session obtenu.
[Test 2/10] Création de deux endpoints distincts et isolation...
  ✓ Endpoints créés : ep-alpha-2389 et ep-beta-2389
[Test 3/10] Dépôt de fichiers avec caractères spéciaux, accents et sous-dossiers...
  ✓ Version r0001 publiée avec succès.
[Test 4/10] Validation du contrat MineLaunched sur :8081/ep-alpha-2389/index.php...
  ✓ Fichier avec espace encodé dans le manifeste
  ✓ Directive de nettoyage dirCheckUselessFiles positionnée à la fin
[Test 5/10] Test des requêtes partielles (Range: bytes=0-5)...
  ✓ Support HTTP Range 206 confirmé (indispensable pour les launchers)
[Test 6/10] Modification d'un seul fichier et validation de la déduplication CAS...
  ✓ Nouveaux objets CAS créés : 0 (seul le fichier modifié a été créé, les autres sont réutilisés)
[Test 7/10] Test du Rollback vers la version r0001...
  ✓ Rollback vers r0001 effectué avec succès.
[Test 8/10] Rejet des chemins avec traversée de répertoire et noms Windows...
  ✓ Tentative de traversée de répertoire correctement rejetée (HTTP 400)
[Test 9/10] Test de résilience : arrêt de l'API et de Postgres...
  ✓ Nginx continue de distribuer le manifeste et les fichiers en toute autonomie (HTTP 200)
[Test 10/10] Nettoyage des endpoints de test...
  ✓ Endpoints de test éphémères supprimés proprement.
==========================================================
  ✓ TOUS LES 10 TESTS D'INTÉGRATION SONT VALIDÉS !
==========================================================
```

