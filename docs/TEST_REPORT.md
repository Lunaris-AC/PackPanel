# Release validation — 4 October 2026

## Automated checks

`npm run build`, `npm test` and `npm audit --audit-level=low` pass. The workspace suite contains **74 tests**: engine 15, desktop launcher 6, protocol 4, SDK 2, templates 2, backend 34 and frontend 11. The launcher test command now runs real lifecycle/settings tests instead of printing a success message. The npm audit reports zero known vulnerabilities for the installed dependency tree at validation time.

The frontend catalogue test exercises the actual frontend API client against the backend routes, covering their field names, Java requirements and validation payloads. Engine tests cover launch arguments, corrupted downloads, protected player data, path traversal and quoted additional JVM arguments.

## Real integration checks

An isolated Docker/PostgreSQL deployment on the target server was used before updating production. HTTP checks cover authenticated APIs, the panel, public static delivery, CDN/API isolation, resumable uploads, ZIP extraction and explicit publication of drafts. Viewer and operator restrictions, malformed tokens, invalid Java combinations and unsupported Minecraft versions were exercised through the real API.

A Windows ZIP was built by the server and downloaded. Its SHA-256 was checked. Its included Electron executable was opened on a Windows desktop, without using a local source checkout as the launcher. Minecraft reached client renderer/audio initialization with these configurations:

| Minecraft | Loader | Loader version | Java |
| --- | --- | --- | --- |
| 1.21.1 | Fabric | 0.19.5 | 21 |
| 1.21.1 | Forge | 52.1.0 | 21 |
| 1.21.1 | NeoForge | 21.1.255 | 21 |
| 1.21.1 | Quilt | 0.24.0 | 21 |
| 1.21.1 | Vanilla | — | 21 |

The downloaded launcher was also exercised through initial pack retrieval and a second launch after publication of changed content. The updated configuration was retrieved, an obsolete file under `mods` was removed, and a sentinel under `saves` remained intact.

The simplified client exposes nickname/Jouer and a settings tab. Persistent RAM and quoted custom JVM arguments are checked by `scripts/check-downloaded-launcher.cjs`, including the arguments received by the actual Java process. The game directory action is restricted to the embedded instance's directory. French/English UI, localized progress, language persistence and the custom window controls were exercised in the packaged application.

After production deployment, the instance page's actual Download button was
clicked in a browser. That ZIP matched the server SHA-256 and was used for
initial launch, a published update and a second launch. Vanilla and all four
modloaders in the matrix above were then started through the same production
download. Public files were retrieved through the real HTTPS CDN.

A full backup and restore was exercised on the isolated deployment. The
legacy-database upgrade was tested with the upload uniqueness constraint
removed, followed by two migrations to verify repeatability. Production
uploads confirmed the repaired constraint. Column definitions were compared
between the production and validation databases.

Rollback was tested against the isolated API: earlier file contents and a null
direct-connect address were restored. Promotion was tested by retrieving the
target's public files and checking that their URLs belonged to the target.

## Web panel languages

The browser check created an instance in English and visited overview, files, releases, settings and launcher configuration, plus dashboard, jobs and users. Switching to French and back preserved form values; the selected language survived a reload. API messages, dates and byte units use the selected language. Translation tests check dictionary coverage and dynamic values.

## Installer and updates

A clean source archive was installed with the actual installer in an isolated Compose project, separate database/storage and separate ports. Checks covered automatic private credential generation, administrator sign-in, cleared bootstrap environment and service readiness. Running the installer again preserved the environment, account and session, created a backup and reapplied migrations. The final API restart now waits for health before printing the initial credentials.

## Scope

The runtime matrix above covers Minecraft 1.21.1 on Windows x64. Catalogue compatibility and unit tests cover additional version rules; they do not prove startup of every historical version or every third-party modpack. Linux/macOS desktop startup and Microsoft account authentication have not been validated. The current release/test scope is offline authentication; Microsoft integration is deferred at the user's request.

Reproduction commands and fixture cleanup requirements are described in the repository README. Validation tokens and player data are stored outside the repository and are not committed.
