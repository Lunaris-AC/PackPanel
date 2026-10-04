# PackPanel

[Français](README.fr.md) · [Installation](#installation) · [Operations](docs/OPERATIONS.md) · [Validation](docs/TEST_REPORT.md)

PackPanel manages Minecraft instances, publishes immutable modpack releases and generates a standalone desktop launcher for each instance. Vanilla, Fabric, Forge, NeoForge and Quilt are resolved through their official catalogs.

Players download the launcher from their instance's page, choose an offline nickname and press **Play**. **Settings** contains persistent RAM allocation, additional JVM arguments, access to game files and the game log. The launcher has a custom title bar and a persistent French/English switch. It retrieves pack updates before launching and preserves saves, screenshots and player options. The web panel is also available in French and English.

![PackPanel launcher](docs/screenshots/launcher-en.png)

**Validated release scope: Windows x64, offline authentication.** Minecraft 1.21.1 was actually started with all five engines listed above, including after a pack update. Microsoft authentication is planned for later. Linux/macOS packages can be generated; desktop startup on those platforms is unverified. See the [test report](docs/TEST_REPORT.md) for exact versions and evidence.

## Installation

Use a Linux server with Docker Engine, the Docker Compose plugin, Bash, OpenSSL and curl installed. Run deployment commands as root, or with equivalent Docker and storage permissions. You do not need Node.js on the server: Docker builds the whole project, including the panel and compiled launcher.

```sh
git clone https://github.com/Lunaris-AC/PackPanel.git
cd PackPanel
sudo env ADMIN_FQDN=panel.example.com FILES_FQDN=cdn.example.com bash install.sh
```

Replace the example domains with your own. Alternatively, download the source ZIP from GitHub, extract it and run the same installer from its root directory. Keep the private `.env` and storage directory when updating an installation from an archive.

The installer generates private credentials and prints the initial administrator password once. Save it, sign in and complete setup. The default listeners are **8080** for the panel/API and **8081** for public file distribution; storage defaults to `/srv/packpanel`. Configure HTTPS and your two domains using the [reverse proxy guide](docs/ZORAXY_CLOUDFLARE.md). Public addresses are persisted by the setup wizard; an explicit `filesBaseUrl` can be used for a LAN test.

To update a Git checkout:

```sh
git pull --ff-only origin master
sudo bash scripts/deploy.sh
```

Deployment builds images, takes a backup, applies database migrations and checks HTTP services. Read [operations](docs/OPERATIONS.md) for backups, restoration and rollback. Installation does not create reverse proxy or DNS records automatically.

## Development

Use **Node.js 24** and the single lockfile at the repository root:

```sh
npm ci
npm run build
npm test
npm audit --audit-level=low
```

Build order is protocol, engine, templates, SDK, launcher, backend, frontend. Run workspace installs/builds from the root. See [architecture](docs/ARCHITECTURE.md), [API/SDK reference](docs/API_SDK_REFERENCE.md), [contributing](CONTRIBUTING.md) and the [changelog](CHANGELOG.md).

## Integration checks

Use an **isolated deployment** with a separate database and storage. These checks create and modify disposable instances. Supply an administrator session pair as `PACKPANEL_TOKEN` and the panel URL as `PACKPANEL_API_BASE`:

```sh
node scripts/check-release.cjs
```

This exercises loader combinations, uploads (direct/TUS/ZIP), worker execution, publication, public file delivery, a Windows launcher build, download and SHA-256. It prints a validation directory containing a private session file and downloaded ZIP. Remove the test instance, endpoint, launcher and published fixture files afterward.

On a Windows desktop, set `PACKPANEL_CHECK_DIR` to that directory and run:

```sh
node scripts/check-downloaded-launcher.cjs
node scripts/check-loader-startup.cjs
```

These start the actual downloaded Electron executable and Minecraft, verify RAM/JVM arguments, publish an update, start again and check file cleanup and preservation of player saves. API checks alone do not prove desktop startup.

Browser checks require `npx playwright install chromium`. `check-panel-download.cjs` checks the instance page's Download button. `check-panel-languages.cjs` uses `PACKPANEL_API_BASE` and `PACKPANEL_TOKEN` to check English pages, real instance creation, language persistence and switching back to French without losing form values. `check-permissions.cjs` covers viewer/operator restrictions. `check-release-history.cjs` checks rollback and promotion on the isolated deployment.

## License

[MIT](LICENSE). Report bugs through GitHub Issues with the affected Minecraft/loader versions and sanitized logs. Keep passwords, tokens and private backup archives out of reports; see [security reporting](SECURITY.md).
