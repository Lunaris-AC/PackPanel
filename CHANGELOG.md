# Changelog

## 2.0.0 — 2026-10-04

- Restored instance creation with official Fabric, Forge, NeoForge and Quilt compatibility/version resolution; corrected Java requirements and catalog response fields.
- Added a standalone launcher dedicated to one instance, with offline nickname/Play, RAM/JVM settings, game files/logs, a custom title bar and persistent French/English UI.
- Corrected ingestion jobs, legacy upload uniqueness migrations, upload integrity, publication of drafts, rollback/promotion and protected player-file synchronization.
- Repaired instance archive downloads, permissions and authenticated request handling.
- Completed English panel text for instances, files, publications, launcher configuration, tasks, dialogs and API messages; localized dates and sizes.
- Updated Docker builds, installation/deployment, backup/restore and public documentation.

Validated desktop scope: Windows x64, Minecraft 1.21.1, offline authentication. Real starts covered Vanilla, Fabric 0.19.5, Forge 52.1.0, NeoForge 21.1.255 and Quilt 0.24.0. Microsoft integration and Linux/macOS desktop validation remain future work. See [test details](docs/TEST_REPORT.md).
