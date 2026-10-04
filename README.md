# PackPanel

PackPanel administers Minecraft instances, publishes immutable modpack releases and generates a standalone desktop launcher for each instance. The web panel supports Vanilla, Fabric, Forge, NeoForge and Quilt through their official catalogues.

The downloaded launcher is dedicated to its instance. Players enter their offline nickname and click **Jouer / Play**. The **Paramètres / Settings** tab contains persistent memory allocation, additional JVM arguments, access to game files and the game log. The custom title bar includes window controls and a persistent French/English switch. Updates are fetched before each launch; saves, screenshots and player options are protected.

The current release is validated on **Windows x64 in offline mode**. Microsoft authentication will be integrated and validated later. Linux/macOS packages can be generated but their desktop startup has not been validated on those operating systems. See [validation details](docs/TEST_REPORT.md) for the tested versions and limits.

## Development

Use Node.js 24 and the single repository lockfile:

```sh
npm ci
npm run build
npm test
npm audit --audit-level=low
```

Build order is explicit: protocol, engine, templates, SDK, launcher, backend, frontend. Workspace installs/builds must run from the repository root.

## Deployment

Docker Compose builds the complete monorepo and embeds the panel and compiled launcher in the images. No host Node.js installation or separately compiled frontend is required.

For an initial installation, configure the public domains and run:

```sh
ADMIN_FQDN=panel.example.com FILES_FQDN=cdn.example.com bash install.sh
```

Docker, its Compose plugin and OpenSSL must already be installed. The installer generates private credentials; retain the initial password it displays. Updates use `bash scripts/deploy.sh`, which builds images, backs up the existing deployment, migrates the database before application startup and runs HTTP smoke checks.

The default listeners are port **8080** for the authenticated panel/API and **8081** for public static distribution. Configure HTTPS at your reverse proxy. Public addresses can be persisted during setup; an explicit `filesBaseUrl` supports a LAN validation deployment. Storage defaults to `/srv/packpanel` and respects `DATA_DIR` from `.env`.

## Release checks

Against an isolated deployment, supply an administrator session pair as `PACKPANEL_TOKEN` and the panel URL as `PACKPANEL_API_BASE`:

```sh
node scripts/check-release.cjs
```

This creates disposable fixtures and checks loader combinations, uploads (direct/TUS/ZIP), worker execution, publication, public file delivery, a real Windows runtime build, download and SHA-256. It prints a validation directory containing a private session file and the downloaded ZIP. Remove the created instance, endpoint and launcher project after use.

On a Windows desktop, use that directory to test the actual downloaded application:

```sh
PACKPANEL_CHECK_DIR=/path/to/validation-directory node scripts/check-downloaded-launcher.cjs
```

The desktop check opens the packaged Electron executable, sets RAM and quoted JVM arguments, starts Minecraft, publishes an update, starts Minecraft again, and checks cleanup and preservation of player data. Screenshots and logs are saved in the validation directory. API checks alone do not establish desktop launch success.

For backups, restoration and rollback, see [operations](docs/OPERATIONS.md).
