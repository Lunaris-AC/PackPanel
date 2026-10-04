# PackPanel

[English](README.md) · [Exploitation](docs/OPERATIONS.md) · [Rapport de tests](docs/TEST_REPORT.md)

PackPanel administre vos instances Minecraft, publie des versions immuables de vos modpacks et génère un launcher autonome dédié à chaque instance. Vanilla, Fabric, Forge, NeoForge et Quilt utilisent leurs catalogues officiels.

Les joueurs téléchargent le launcher depuis la page de leur instance, choisissent un pseudo offline et cliquent sur **Jouer**. Les **Paramètres** donnent accès à la RAM, aux arguments JVM supplémentaires, aux fichiers du jeu et au journal. La barre de titre est personnalisée et la langue français/anglais est mémorisée. Le launcher récupère les mises à jour avant le lancement et protège les sauvegardes et options des joueurs. Le webpanel est également disponible en français et en anglais.

![Launcher PackPanel](docs/screenshots/launcher-fr.png)

**Périmètre validé : Windows x64, authentification offline.** Minecraft 1.21.1 a réellement démarré avec les cinq moteurs, y compris après une mise à jour du pack. Microsoft sera intégré plus tard. Les packages Linux/macOS peuvent être générés, mais leur démarrage sur ces plateformes reste à valider. Le [rapport de tests](docs/TEST_REPORT.md) précise les versions testées.

## Installation

Prévoyez un serveur Linux avec Docker Engine, le plugin Docker Compose, Bash, OpenSSL et curl. Exécutez les commandes avec les droits nécessaires pour Docker et le stockage. Le serveur n'a pas besoin de Node.js : Docker compile l'ensemble du projet.

```sh
git clone https://github.com/Lunaris-AC/PackPanel.git
cd PackPanel
sudo env ADMIN_FQDN=panel.example.com FILES_FQDN=cdn.example.com bash install.sh
```

Remplacez les domaines par les vôtres. Vous pouvez aussi télécharger le ZIP du dépôt, l'extraire et lancer l'installateur depuis son dossier racine. Pour mettre à jour une installation provenant d'une archive, conservez le fichier privé `.env` et le répertoire des données.

L'installateur génère les identifiants et affiche une fois le mot de passe administrateur initial. Conservez-le puis terminez l'assistant de configuration. Les ports par défaut sont **8080** pour le panel/API et **8081** pour les fichiers publics ; les données sont dans `/srv/packpanel`. Configurez HTTPS et vos domaines selon le [guide du reverse proxy](docs/ZORAXY_CLOUDFLARE.md). Les adresses publiques sont enregistrées par l'assistant. Une URL HTTP explicite est possible pour un test en réseau local.

Pour mettre à jour une installation Git :

```sh
git pull --ff-only origin master
sudo bash scripts/deploy.sh
```

Le déploiement compile les images, sauvegarde l'installation, applique les migrations et vérifie les services HTTP. Les instructions de sauvegarde et restauration sont dans [Operations](docs/OPERATIONS.md). DNS et reverse proxy sont à configurer séparément.

## Développement et tests

Depuis la racine, avec Node.js 24 :

```sh
npm ci
npm run build
npm test
npm audit --audit-level=low
```

Un seul lockfile est utilisé pour tous les workspaces. Le README anglais décrit les scripts d'intégration, les essais du launcher téléchargé et les tests de langue du webpanel. Exécutez ces scripts sur un environnement isolé : ils créent et modifient des données jetables.

Consultez [l'architecture](docs/ARCHITECTURE.md), [l'API/SDK](docs/API_SDK_REFERENCE.md), [les changements](CHANGELOG.md) et [les contributions](CONTRIBUTING.md). Licence [MIT](LICENSE). Pour un problème, ouvrez une issue avec les versions concernées et des journaux expurgés des identifiants ; [signalement de sécurité](SECURITY.md).
