# Release validation — 4 October 2026

## Automated checks

`npm run build`, `npm test` and `npm audit --audit-level=low` pass. The workspace suite contains **67 tests**: engine 15, desktop launcher 6, protocol 4, SDK 2, templates 2, backend 33 and frontend 5. The launcher test command now runs real lifecycle/settings tests instead of printing a success message. The npm audit reports zero known vulnerabilities for the installed dependency tree at validation time.

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

The downloaded launcher was also exercised through initial pack retrieval and a second launch after publication of changed content. The updated configuration was retrieved, an obsolete file under `mods` was removed, and a sentinel under `saves` remained intact.

The simplified client exposes nickname/Jouer and a settings tab. Persistent RAM and quoted custom JVM arguments are checked by `scripts/check-downloaded-launcher.cjs`, including the arguments received by the actual Java process. The game directory action is restricted to the embedded instance's directory.

## Scope

The runtime matrix above covers Minecraft 1.21.1 on Windows x64. Catalogue compatibility and unit tests cover additional version rules; they do not prove startup of every historical version or every third-party modpack. Linux/macOS desktop startup and Microsoft account authentication have not been validated. The current release/test scope is offline authentication; Microsoft integration is deferred at the user's request.

Reproduction commands and fixture cleanup requirements are described in the repository README. Validation tokens and player data are stored outside the repository and are not committed.
