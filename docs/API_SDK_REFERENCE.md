# PackPanel V2 — API & SDK Reference

Cette référence documente l'ensemble des APIs REST V2, des bibliothèques internes et du SDK développeur PackPanel.

---

## 1. Protocole & Endpoints API V2

Toutes les requêtes d'administration sont authentifiées par cookie de session `packpanel_session` ou en-tête `Authorization: Bearer <sessionId>:<token>`.

### Instances Minecraft (`/api/v2/instances`)

| Méthode | Route | Description | Rôles requis |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v2/instances` | Liste toutes les instances Minecraft | Authentifié |
| `GET` | `/api/v2/instances/:id` | Récupère le détail d'une instance | Authentifié |
| `POST` | `/api/v2/instances` | Crée une nouvelle instance (Vanilla, Forge, NeoForge, Fabric, Quilt) | `admin`, `operator` |
| `PUT` | `/api/v2/instances/:id` | Met à jour la configuration d'une instance | `admin`, `operator` |
| `DELETE` | `/api/v2/instances/:id` | Supprime une instance | `admin` |
| `GET` | `/api/v2/instances/:id/manifest` | Génère et renvoie le manifeste complet V2 (`packpanel.json`) | Public / Authentifié |

#### Schéma d'une Instance (Payload de création)

```json
{
  "name": "Inferi Survie 1.20",
  "slug": "inferi-survie",
  "description": "Modpack officiel de la communauté",
  "minecraftVersion": "1.20.1",
  "loaderType": "fabric",
  "loaderVersion": "0.16.5",
  "javaVersion": 17,
  "javaArgs": "-Xms2G -Xmx4G",
  "serverAddress": "play.inferi.fr:25565",
  "serverName": "Inferi Principal",
  "filePolicies": {
    "protected_paths": [
      "saves/",
      "screenshots/",
      "options.txt",
      "optionsof.txt",
      "usercache.json",
      "servers.dat"
    ],
    "optional_mods": []
  }
}
```

---

### Launchers Personnalisés (`/api/v2/launchers`)

| Méthode | Route | Description | Rôles requis |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v2/launchers` | Liste tous les projets de launchers | Authentifié |
| `GET` | `/api/v2/launchers/:id` | Récupère la configuration et les instances liées | Authentifié |
| `POST` | `/api/v2/launchers` | Crée un nouveau projet de launcher | `admin`, `operator` |
| `PUT` | `/api/v2/launchers/:id` | Modifie le branding, le template ou les instances | `admin`, `operator` |
| `DELETE` | `/api/v2/launchers/:id` | Supprime un projet de launcher | `admin` |
| `GET` | `/api/v2/launchers/:id/config` | Exporte le JSON `launcher-config.json` pour le client | Public / Authentifié |

#### Modèles visuels disponibles (Templates)
- **`minimal`** : Interface compacte et légère, bouton Jouer immédiat, barre de progression épurée.
- **`community`** : Idéal pour les serveurs et communautés (bannière actualités, statut du serveur en direct, widget Discord).
- **`network`** : Navigation multi-instances avec panneau latéral, moniteur de serveurs et console de jeu intégrée.

---

## 2. Spécification du Manifeste V2 (`packpanel.json`)

Le fichier `packpanel.json` est servi statiquement et de manière immuable par Nginx sous l'URL `https://<FILES_FQDN>/<slug>/packpanel.json`.

```json
{
  "formatVersion": 2,
  "instanceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "instanceName": "Inferi Survie 1.20",
  "slug": "inferi-survie",
  "minecraftVersion": "1.20.1",
  "loader": {
    "type": "fabric",
    "version": "0.16.5"
  },
  "java": {
    "majorVersion": 17,
    "recommendedMemoryMb": 4096,
    "jvmArgs": ["-Xms2G", "-Xmx4G"]
  },
  "server": {
    "address": "play.inferi.fr",
    "port": 25565,
    "name": "Serveur Officiel"
  },
  "protectedPaths": [
    "saves/",
    "screenshots/",
    "options.txt",
    "optionsof.txt",
    "usercache.json",
    "servers.dat"
  ],
  "cleanupRules": ["mods"],
  "files": [
    {
      "path": "mods/fabric-api-0.92.2+1.20.1.jar",
      "sha1": "6c4d7d91e3e7fbd9c8b7f032247c7c10b4293f7a",
      "size": 2048500,
      "url": "https://mccdn.inferi.fr/inferi-survie/releases/r0001/mods/fabric-api-0.92.2%2B1.20.1.jar",
      "policy": "required"
    }
  ],
  "updatedAt": "2026-09-26T22:00:00.000Z"
}
```

---

## 3. Moteur Minecraft Indépendant (`@packpanel/engine`)

Le moteur Minecraft est codé en pur TypeScript sans **aucune dépendance à des SDKs tiers** (zéro EML, zéro XMCL, zéro minecraft-launcher-core).

### Initialisation

```typescript
import { MinecraftEngine, createOfflineProfile, MicrosoftAuthenticator } from '@packpanel/engine';

const engine = new MinecraftEngine({
  baseDir: '/path/to/game/directory'
});

// Écoute des événements
engine.on('progress', (event) => {
  console.log(`[${event.step}] ${event.progress}% : ${event.message}`);
});

engine.on('log', (line) => {
  console.log(`[Minecraft] ${line}`);
});

engine.on('crash', (data) => {
  console.error(`Jeu arrêté avec code ${data.exitCode}. Rapport de crash :`, data.crashReport);
});
```

### Authentification

#### Mode Offline (Pseudonyme)
Génère un profil officiel conforme avec l'algorithme UUIDv3 :
```typescript
const profile = createOfflineProfile('Steve');
// profile.id -> "b50ad385829d3141a2167e7d7539ba7f"
```

#### Mode Microsoft (OAuth2 Device Code)
```typescript
const auth = new MicrosoftAuthenticator();
const deviceCode = await auth.startDeviceCodeFlow();

console.log(`Rendez-vous sur ${deviceCode.verification_uri} et saisissez le code : ${deviceCode.user_code}`);

const msToken = await auth.pollForToken(deviceCode.device_code);
const profile = await auth.loginWithMicrosoftToken(msToken);
console.log(`Connecté en tant que ${profile.name} (${profile.id})`);
```

### Lancement d'une Instance

```typescript
await engine.launchInstance({
  manifestUrl: 'https://mccdn.inferi.fr/inferi-survie/packpanel.json',
  gameDir: '/path/to/instances/inferi-survie',
  profile: profile,
  maxMemoryMb: 4096
});
```

---

## 4. SDK Développeur (`@packpanel/sdk`)

Pour intégrer PackPanel dans une application externe :

```typescript
import { PackPanelApiClient, createLauncherEngine } from '@packpanel/sdk';

const client = new PackPanelApiClient({
  baseUrl: 'https://packpanel.inferi.fr',
  apiToken: 'mon_token_optionnel'
});

// Récupérer la configuration du launcher
const launcherConfig = await client.getLauncherConfig('inferi-community');

// Instancier le moteur local
const engine = createLauncherEngine('/mon/chemin/local');
```
