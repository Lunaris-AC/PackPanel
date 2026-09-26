# Guide Utilisateur — PackPanel V2

Bienvenue sur PackPanel V2. Ce guide explique pas à pas comment un administrateur de communauté peut gérer ses serveurs, modpacks et créer des launchers personnalisés sans aucune ligne de code.

---

## Sommaire

1. [Première Connexion & Sécurité du Compte](#1-première-connexion--sécurité-du-compte)
2. [Créer une Instance Minecraft](#2-créer-une-instance-minecraft)
3. [Déposer ses Fichiers via l'Explorateur Web](#3-déposer-ses-fichiers-via-lexplorateur-web)
4. [Édition et Historique des Modifications (Undo)](#4-édition-et-historique-des-modifications-undo)
5. [Publication et Disponibilité CDN](#5-publication-et-disponibilité-cdn)
6. [Personnaliser son Launcher de Bureau](#6-personnaliser-son-launcher-de-bureau)
7. [Distribution aux Joueurs](#7-distribution-aux-joueurs)

---

## 1. Première Connexion & Sécurité du Compte

1. Connectez-vous sur votre panel d'administration : `http://<IP_OU_DOMAINE>:8080`.
2. Identifiants initiaux : `admin` / mot de passe configuré lors de l'installation.
3. **Sécuriser votre compte** :
   - Cliquez sur l'icône de bouclier en bas à gauche de la barre latérale pour configurer la **Double Authentification (2FA)**.
   - Scannez le QR Code avec votre application d'authentification (Google Authenticator, Aegis, 1Password, etc.).
   - Conservez précieusement les **codes de secours** générés. Ils sont chiffrés sur le serveur et ne seront plus affichés.

---

## 2. Créer une Instance Minecraft

1. Rendez-vous dans l'onglet **Instances Minecraft** dans le menu de gauche.
2. Cliquez sur **Nouvelle Instance**.
3. Remplissez les paramètres :
   - **Nom de l'instance** : ex. `Survie Moddée 1.20`.
   - **Slug d'accès** : généré automatiquement (ex. `survie-moddee-1-20`).
   - **Version Minecraft** : sélectionnez la version souhaitée (ex. `1.20.1`, `1.21.1`, `1.16.5`, etc.).
   - **Mod Loader** : choisissez parmi **Fabric**, **Forge**, **NeoForge**, **Quilt** ou **Vanilla**.
   - **Version Java** : configurée automatiquement selon la version du jeu (Java 8, 17 ou 21).
   - **Connexion directe** : optionnellement, indiquez l'adresse de votre serveur (`play.monserveur.fr:25565`) pour que les joueurs se connectent directement au lancement.
4. Cliquez sur **Créer l'instance**.

---

## 3. Déposer ses Fichiers via l'Explorateur Web

1. Sur la carte de votre instance, cliquez sur **Gérer les fichiers**.
2. Vous accédez à l'**Explorateur de fichiers Web** interactif :
   - **Glisser-Déposer** : glissez simplement vos fichiers JAR de mods, vos dossiers `config/`, `resourcepacks/`, `kubejs/` directement dans la fenêtre.
   - Les dossiers sont automatiquement créés avec l'arborescence exacte de votre ordinateur.
   - Un récapitulatif des transferts s'affiche en temps réel.
3. **Protection des données joueurs** :
   - Les dossiers `saves/`, `screenshots/`, `options.txt` et `servers.dat` sont sanctuarisés.
   - Les mises à jour du pack ne supprimeront ni n'écraseront jamais les mondes solo ou les touches configurées par les joueurs.

---

## 4. Édition et Historique des Modifications (Undo)

1. **Édition de texte intégrée** :
   - Cliquez sur un fichier de configuration (`.json`, `.toml`, `.cfg`, `.txt`, `.yml`) pour l'ouvrir dans l'éditeur de code intégré.
   - Modifiez vos paramètres et cliquez sur **Enregistrer**.
2. **Historique des modifications** :
   - Chaque ajout, modification ou suppression de fichier est consigné dans l'historique.
   - Si une modification pose problème, cliquez sur **Annuler (Undo)** sur la ligne concernée pour restaurer instantanément la version antérieure du fichier.

---

## 5. Publication et Disponibilité CDN

1. Lorsque vos fichiers sont prêts, cliquez sur le bouton vert **Publier une nouvelle version**.
2. Le système effectue :
   - Le calcul d'intégrité (hachage SHA-1 et SHA-256) sans re-télécharger les fichiers identiques grâce au stockage dédupliqué (CAS).
   - La génération du manifeste natif V2 (`packpanel.json`) et du contrat de compatibilité MineLaunched (`index.php`).
   - Le verrouillage atomique garantissant zéro temps d'arrêt pour les joueurs en cours de jeu.
3. Les URLs de distribution sont immédiatement actives sur votre domaine de fichiers (ex. `https://mccdn.inferi.fr/<slug>/packpanel.json`).

---

## 6. Personnaliser son Launcher de Bureau

1. Rendez-vous dans l'onglet **Launchers** dans le menu de gauche.
2. Cliquez sur **Nouveau Launcher**.
3. Personnalisez l'apparence :
   - **Modèle visuel** :
     - *Minimal* : rapide et épuré.
     - *Community* : idéal pour les serveurs (bannière actualités, Discord, état du serveur).
     - *Network* : multi-instances avec barre latérale et console intégrée.
   - **Branding** : choisissez votre couleur d'accent (palette interactive), le titre et vos liens sociaux.
   - **Instances incluses** : cochez les instances Minecraft que vous souhaitez proposer dans ce launcher.
   - **Authentification** : activez ou désactivez la connexion par **Compte Microsoft** et/ou par **Mode Offline (Pseudonyme)**.
4. Cliquez sur **Créer le launcher**.

---

## 7. Distribution aux Joueurs

1. Sur la carte de votre launcher, cliquez sur **Exporter config**.
2. Le fichier `launcher-config.json` est téléchargé.
3. Les joueurs téléchargeant le launcher PackPanel disposent immédiatement de votre charte graphique, de vos instances et de la synchronisation automatique des mods sans aucune configuration manuelle !
