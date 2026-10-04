# Deployment validation — 4 October 2026

The release was checked on an isolated Docker/PostgreSQL deployment before upgrading the existing production deployment. Private server addresses, credentials, validation sessions and backup locations are recorded outside the public repository.

## Verified deployment behavior

- Docker builds the full monorepo, including the panel and compiled launcher; the server requires no host Node.js.
- API, worker, Nginx and PostgreSQL start; HTTP smoke checks include the authenticated API and the separate public static listener.
- The existing upload table is upgraded with the uniqueness index required by ingestion; repeating migrations preserves valid uploads.
- Production accounts and endpoints are preserved. A private backup and previous Docker images are retained for rollback.
- Backup/restore was executed against the isolated database and storage, and checked after restoration.
- The public HTTPS distribution was used to download published files and launch the generated Windows client.

## Player validation

The instance page's Download button supplied a Windows archive with the expected SHA-256. That archive was opened as an application, fetched its pack, started Minecraft, retrieved a published update and started again. Real JVM arguments were inspected; obsolete managed mod files were removed and player saves preserved.

Minecraft 1.21.1 reached renderer/audio initialization with Vanilla, Fabric 0.19.5, Forge 52.1.0, NeoForge 21.1.255 and Quilt 0.24.0. Offline authentication is the validated mode. French/English UI, persistent settings and the custom title-bar controls were exercised in the packaged client.

![Launcher in English](screenshots/launcher-en.png)
![Launcher settings](screenshots/launcher-settings-fr.png)

## Reproduction and limits

Use the [installation instructions](../README.md#installation), [operations guide](OPERATIONS.md) and [release scripts](../README.md#integration-checks). Browser language checks cover instance creation, every instance tab, launcher configuration, dashboard, jobs and users. The selected language survives reloads, and switching preserves form values.

See [TEST_REPORT.md](TEST_REPORT.md) for automated results and the exact runtime matrix. Windows x64/offline is validated. Microsoft sign-in and Linux/macOS desktop startup remain outside that validated scope. Test sessions are revoked and isolated deployments are stopped after checks.
