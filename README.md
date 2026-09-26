# PackPanel

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](compose.yaml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-4-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![MineLaunched](https://img.shields.io/badge/MineLaunched-100%25%20Compatible-green.svg)](docs/TEST_REPORT.md)

**PackPanel V2** is an all-in-one, self-hosted modpack distribution platform, independent Minecraft engine, and custom launcher creation suite.

It provides non-developer community administrators with a no-code web console to create Minecraft instances (**Vanilla, Forge, NeoForge, Fabric, Quilt**), manage mods via a web file explorer, configure **Microsoft and Offline** authentication, customize desktop launchers with official templates (**Minimal, Community, Network**), and distribute releases instantly with 100% backward compatibility for **MineLaunched** (`index.php`) and native V2 protocols (`packpanel.json`).

---

## ⚡ Key Highlights of PackPanel V2

- **Independent Minecraft Engine (`@packpanel/engine`)**:
  - **Zero Third-Party SDK Dependencies**: Built from scratch in pure TypeScript without EML, XMCL, or minecraft-launcher-core.
  - Complete version resolution from official Mojang Piston-Meta, Fabric Meta, Quilt Meta, Forge Maven, and NeoForge Maven.
  - Automatic Java provisioning via Eclipse Temurin / Adoptium API (Java 8, 17, 21).
  - Native libraries extraction, rule evaluation, and game process supervision with crash report analysis.
  - **Player Data Protection**: Local player saves (`saves/`), screenshots (`screenshots/`), client options (`options.txt`), and server lists (`servers.dat`) are sanctuarized and never overwritten during modpack synchronizations.

- **Custom Desktop Launcher Creator (`@packpanel/launcher`)**:
  - Secure Electron application (`contextIsolation: true`, typed IPC bridge).
  - 3 official templates: **Minimal** (1-click launch), **Community** (news feed, Discord widget, server status), **Network** (multi-instances sidebar).
  - Full branding customizer from the web panel: accent color picker, title, logo, backgrounds.
  - Dual identity provider support: Microsoft Account OAuth2 (Xbox Live, XSTS) and Offline pseudonym mode.

- **Content-Addressed Storage (CAS) & Dual-Protocol CDN**:
  - Deduplicated physical storage keyed by SHA-256 in `/srv/packpanel/storage/objects/`.
  - Releases assembled using hardlinks—zero duplicate disk space across iterations.
- **Autonomous Static Delivery**:
  - Public listener (port `8081`) serves files directly from disk via Nginx.
  - Distribution remains fully operational even if PostgreSQL, the Node.js API, or the worker are completely stopped.
- **Resilient Upload Engine**:
  - Resumable chunked uploads via **TUS** protocol.
  - Direct ZIP archive import with zip-bomb detection and directory traversal guards.
  - In-browser file explorer with integrated code editor (`.json`, `.toml`, `.cfg`, `.txt`, `.snbt`, `.zs`).
- **Atomic Releases & Rollbacks**:
  - Immutable version identifiers (`r0001`, `r0002`...).
  - Instant one-click rollback by swapping the manifest pointer atomically (`index.php.tmp` -> `index.php`).
  - Visual release diff inspection (files added, modified, removed).
  - Version pinning to prevent automated garbage collection retention purges.
- **Security & Rate Limiting**:
  - Password hashing with **Argon2id**.
  - Dual session resilience: `HttpOnly` cookies + `Authorization: Bearer` support.
  - Anti-brute-force rate limiting: sliding window lock with HTTP 429 and `Retry-After`.
  - OWASP password complexity enforcement with automatic session revocation upon credential changes.
  - Role-Based Access Control (**Admin**, **Operator**, **Viewer**).
  - Complete, tamper-evident audit logging for all management operations.
  - Rejection of directory traversal attacks (`../`, `..\`) and Windows-incompatible reserved names (`CON`, `PRN`, `AUX`, `NUL`, etc.).
- **Modern Sober UI & Internationalization (i18n)**:
  - English & French multilingual support with live language switcher and extensible dictionary structure.
  - First-run interactive **Setup Wizard** guiding administrators through domain configuration, security hardening, and initial endpoint setup.
  - High-density, professional UI design inspired by Linear and Vercel standards (slate/zinc palette, fine borders, responsive layouts, tailored SVG vector identity).
  - User management modal for role modifications, credential rotations, and active session invalidation.

---

## 🎯 Use Cases

### 1. Community Server Networks & SMPs
Host multiple distinct endpoints (`atm9`, `create-smp`, `hardcore`) on a single lightweight VPS. Update mods and configuration files without asking players to redownload full archives or manually sync files.

### 2. Multi-Stage Modpack Development
Maintain separate logical endpoints for testing and production:
- `mypack-dev` : Rapid iteration, auto-publish enabled.
- `mypack-prod`: Stable releases, pinned versions, manual promotion.

### 3. CI/CD & Automated Modpack Pipelines
Integrate modpack builds from GitHub Actions, GitLab CI, or local Gradle builds directly into PackPanel via the built-in CLI or REST API.

---

## 🚀 Quickstart

### System Requirements
- Linux (Ubuntu 22.04+, Debian 12+, AlmaLinux 9+, Alpine 3.19+)
- Docker Engine & Docker Compose v2 (installed automatically if missing)
- Ports `8080` (Admin) and `8081` (Distribution) available

### One-Command Turnkey Installation

```bash
git clone https://github.com/Lunaris-AC/PackPanel.git /opt/packpanel
cd /opt/packpanel
sudo chmod +x install.sh
sudo ./install.sh
```

The installer will:
1. Check dependencies and install Docker / Docker Compose if needed.
2. Prompt for your public domains (or use sensible defaults).
3. Create the `/srv/packpanel` storage hierarchy with restricted permissions (`chmod 750` / `chmod 700`).
4. Generate cryptographically strong random passwords and session secrets.
5. Compile and start the Docker Compose stack.
6. Initialize the PostgreSQL schema and create the primary administrator account.
7. Perform an automated smoke test and display your credentials.

---

## 🏗️ Architecture

```
                                    ┌────────────────────────────────┐
                                    │    MineLaunched Game Client    │
                                    └───────────────┬────────────────┘
                                                    │
                                  HTTP GET /<slug>/index.php & /releases/
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Host Machine                                                                    │
│                                                                                 │
│   ┌───────────────────────────────┐     ┌───────────────────────────────────┐   │
│   │  Listener :8081 (Public CDN)  │     │   Listener :8080 (Admin & API)    │   │
│   │  • Nginx direct disk access   │     │   • React Web Console (SPA)       │   │
│   │  • Zero PHP runtime           │     │   • Fastify REST API              │   │
│   │  • Works even if API is DOWN  │     │   • SSE Live Stream (/api/events) │   │
│   │  • Range Requests (HTTP 206)  │     │   • Resumable TUS & ZIP Uploads   │   │
│   └───────────────┬───────────────┘     └─────────────────┬─────────────────┘   │
│                   │                                       │                     │
│                   ▼                                       ▼                     │
│       /srv/packpanel/storage/               ┌───────────────────────────────┐   │
│       ├── endpoints/<slug>/                 │  Background Worker (Node.js)  │   │
│       │   ├── index.php (manifest)          │  • Dual-hash stream pipeline  │   │
│       │   └── releases/r0001/ (hardlinks)   │  • ZIP safety inspection      │   │
│       └── objects/ (CAS SHA-256 pool)       │  • Atomic manifest sealing    │   │
│                                             └───────────────┬───────────────┘   │
│                                                             │                   │
│                                                             ▼                   │
│                                             ┌───────────────────────────────┐   │
│                                             │   PostgreSQL 16 (Inventory)  │   │
│                                             └───────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🌐 Reverse Proxy & Edge CDN Setup

### 1. Reverse Proxy (Zoraxy, Nginx, Caddy, Traefik)

Forward traffic to the respective local listener ports:

- **Administration (`panel.yourdomain.com`)** -> `http://127.0.0.1:8080`
  - Enable **WebSocket / SSE** forwarding.
  - Disable response buffering (`proxy_buffering off;`).
  - Set request body limit to at least 2 GB (for modpack ZIP imports).
- **Public Files (`cdn.yourdomain.com`)** -> `http://127.0.0.1:8081`
  - Enable **HTTP/2** and Keep-Alive.
  - Forward standard headers (`Host`, `X-Forwarded-For`, `X-Forwarded-Proto`).

### 2. Cloudflare Cache Rules (Recommended)

To protect your origin server bandwidth during major updates:

1. **Manifest Cache Bypass** (Must be fresh):
   - **Condition**: `URI Path ends with "/index.php"`
   - **Action**: **Bypass Cache** (allows launchers to detect newly published releases instantly).
2. **Releases Cache Everything** (Immutable):
   - **Condition**: `URI Path contains "/releases/"`
   - **Action**: **Cache Everything**, Edge Cache TTL: `1 month` (releases are strictly immutable; version updates increment release IDs).
3. **WAF Bypass Rule for Launchers**:
   - **Condition**: `(http.host eq "cdn.yourdomain.com" and (http.request.uri.path contains "/index.php" or http.request.uri.path contains "/releases/"))`
   - **Action**: **Skip** JS Challenge / Managed WAF (MineLaunched is a lightweight Java client that cannot solve interactive browser captchas).

---

## 🛠️ CLI Management

PackPanel includes a standalone CLI tool for automated workflows:

```bash
# Ingest local modpack directory into an endpoint
node backend/dist/cli/packpanel-cli.js import --endpoint mypack --dir /path/to/modpack --commit

# View active releases and status
node backend/dist/cli/packpanel-cli.js status --endpoint mypack

# Run garbage collection on unreferenced objects
node backend/dist/cli/packpanel-cli.js gc
```

---

## 📦 Operational Scripts

- `scripts/backup.sh`: Creates a compressed, consistent backup archive of PostgreSQL and `/srv/packpanel` storage.
- `scripts/restore.sh <backup_tar_gz>`: Full disaster recovery script.
- `scripts/integration-test.sh`: Automated 10-step end-to-end verification suite.

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
