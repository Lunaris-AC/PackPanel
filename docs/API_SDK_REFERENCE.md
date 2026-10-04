# API and SDK reference

Administrative routes require a session cookie (`packpanel_session`) or `Authorization: Bearer <sessionId>:<token>`. Use the authenticated panel origin, not the public files domain. Catalog routes also require authentication. Public player distribution uses static manifests and files on the separate files origin.

## Instance workflow

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v2/instances` | List instances |
| GET | `/api/v2/instances/:id` | Instance details |
| POST | `/api/v2/instances` | Create an instance |
| PUT | `/api/v2/instances/:id` | Save draft configuration |
| POST | `/api/v2/instances/:id/publish` | Publish files and game configuration |
| DELETE | `/api/v2/instances/:id` | Delete the instance record (administrator) |
| GET | `/api/v2/instances/:id/manifest` | Authenticated V2 manifest |
| POST | `/api/v2/instances/:id/launcher/enable` | Enable the dedicated launcher |
| POST | `/api/v2/instances/:id/launcher/disable` | Disable the dedicated launcher |
| PUT | `/api/v2/instances/:id/launcher` | Save branding/configuration |
| POST | `/api/v2/instances/:id/launcher/media` | Upload an image |
| POST | `/api/v2/instances/:id/launcher/build` | Build a downloadable runtime |
| GET | `/api/v2/instances/:id/launcher/builds` | Build history |
| GET | `/api/v2/instances/:id/launcher/builds/:buildId/download` | Download an authenticated archive |

Operators need the associated endpoint's write or publish permission for the corresponding action. Viewers cannot mutate instances. Administrators manage accounts and permissions. Deleting an instance record is not a filesystem purge of its separately managed endpoint; remove or withdraw the distribution separately when retiring a pack.

Example creation body (resolve the current compatible loader version from the catalog before sending):

```json
{
  "name": "Community Survival",
  "slug": "community-survival",
  "minecraftVersion": "1.21.1",
  "loaderType": "fabric",
  "loaderVersion": "0.19.5",
  "javaVersion": 21,
  "javaArgs": "-Xms2G -Xmx4G",
  "serverAddress": "play.example.com:25565"
}
```

Use `null` to explicitly clear optional server configuration on update. Publish after editing to distribute a changed configuration to players. Vanilla does not need a loader version.

## Official catalogs

| Route | Parameters |
| --- | --- |
| GET `/api/v2/catalog/minecraft` | `type=release`, `snapshot` or `all` |
| GET `/api/v2/catalog/loaders` | `minecraftVersion` (alias `mcVersion`) |
| GET `/api/v2/catalog/loader-versions` | `loader`, `minecraftVersion` |
| GET `/api/v2/catalog/requirements` | `minecraftVersion`, optional `loader` |
| POST `/api/v2/catalog/validate` | JSON: `minecraftVersion`, `loader`, optional `loaderVersion` |

Loader compatibility entries use `available`; Java responses use `requirements`. A validation response can return HTTP 200 with `valid: false` and `error`; check the result before creating an instance.

## Public distribution

The player launcher fetches `https://cdn.example.com/<slug>/packpanel.json`. This V2 manifest describes the game, loader, Java requirement, server settings, file policies and downloadable file hashes. Release file URLs refer to `/<slug>/releases/<release-id>/...` and remain immutable. Active pointers must bypass intermediary caches.

Legacy `index.php` and `index.json` distribution is retained. The runtime schemas and field definitions are maintained in [`packages/protocol/src/index.ts`](../packages/protocol/src/index.ts); see [architecture](ARCHITECTURE.md) for publication and [operations](OPERATIONS.md) for storage/configuration.

## SDK

The SDK is an internal workspace built from the repository root. `PackPanelApiClient` exposes `getHealth()`, `getInstanceManifest(idOrSlug)` and `getLauncherConfig(idOrSlug)`. The last two require an authenticated API token:

```ts
import { PackPanelApiClient } from '@packpanel/sdk';

const client = new PackPanelApiClient({
  baseUrl: 'https://panel.example.com',
  apiToken: process.env.PACKPANEL_TOKEN
});
const manifest = await client.getInstanceManifest('community-survival');
```

Use the public CDN manifest directly in a player application; do not embed administrator tokens in distributed launchers. `createLauncherEngine()` and `createOfflineProfile()` expose engine/offline helpers. Microsoft exports are a future integration scaffold; a completed Microsoft sign-in is not part of the validated release. Legacy template configuration fields do not imply separate news or multi-instance screens in the current launcher.
