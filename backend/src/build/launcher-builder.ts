import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query } from '../db';
import { config, DATA_DIR } from '../config';

function createZipArchive(options: any) {
  const archiverModule = require('archiver');
  if (typeof archiverModule === 'function') {
    return archiverModule('zip', options);
  }
  if (archiverModule.ZipArchive) {
    return new archiverModule.ZipArchive(options);
  }
  if (archiverModule.default && typeof archiverModule.default === 'function') {
    return archiverModule.default('zip', options);
  }
  throw new Error('Unsupported archiver module structure');
}

const BUILDS_DIR = path.join(DATA_DIR, 'builds');

export interface BuildLauncherOptions {
  launcherProjectId: string;
  targetOs: 'windows' | 'linux' | 'macos' | 'all';
  userId?: string;
}

export async function buildLauncherArtifact(options: BuildLauncherOptions): Promise<{
  buildId: string;
  artifactPath: string;
  artifactSize: number;
  artifactSha256: string;
  version: string;
}> {
  const { launcherProjectId, targetOs, userId } = options;

  if (!fs.existsSync(BUILDS_DIR)) {
    fs.mkdirSync(BUILDS_DIR, { recursive: true, mode: 0o755 });
  }

  // 1. Fetch launcher project details
  const projRes = await query('SELECT * FROM launcher_projects WHERE id = $1', [launcherProjectId]);
  if (projRes.rows.length === 0) {
    throw new Error('Projet de launcher introuvable');
  }
  const proj = projRes.rows[0];

  // 2. Count existing builds to generate version e.g. 1.0.1
  const countRes = await query(
    'SELECT COUNT(*) FROM launcher_builds WHERE launcher_project_id = $1',
    [launcherProjectId]
  );
  const buildNum = parseInt(countRes.rows[0].count, 10) + 1;
  const version = `1.0.${buildNum}`;

  // 3. Create build record with status 'building'
  const buildRes = await query(
    `INSERT INTO launcher_builds (
      launcher_project_id, version, target_os, status, logs, created_by_user_id
    ) VALUES ($1, $2, $3, 'building', $4, $5)
    RETURNING id`,
    [
      launcherProjectId,
      version,
      targetOs,
      `[${new Date().toISOString()}] Initialisation du build ${version} pour ${targetOs}...\n`,
      userId || null
    ]
  );
  const buildId = buildRes.rows[0].id;

  try {
    // 4. Fetch linked instances
    const instRes = await query(
      `SELECT i.*, lpi.is_default, e.slug as endpoint_slug
       FROM launcher_project_instances lpi
       JOIN instances i ON i.id = lpi.instance_id
       LEFT JOIN endpoints e ON e.id = i.endpoint_id
       WHERE lpi.launcher_project_id = $1
       ORDER BY lpi.sort_order ASC`,
      [launcherProjectId]
    );

    const launcherConfig = {
      formatVersion: 2,
      launcherId: proj.id,
      name: proj.name,
      slug: proj.slug,
      template: proj.template,
      branding: {
        title: proj.title,
        accentColor: proj.accent_color,
        backgroundUrl: proj.background_url || undefined,
        logoUrl: proj.logo_url || undefined,
        iconUrl: proj.icon_url || undefined,
        discordUrl: proj.discord_url || undefined,
        websiteUrl: proj.website_url || undefined
      },
      auth: {
        microsoft: proj.auth_microsoft,
        offline: proj.auth_offline
      },
      instances: instRes.rows.map(inst => ({
        id: inst.id,
        slug: inst.slug,
        name: inst.name,
        manifestUrl: `https://${config.FILES_FQDN}/${inst.endpoint_slug || inst.slug}/packpanel.json`,
        isDefault: inst.is_default,
        iconUrl: inst.icon_url || undefined
      }))
    };

    const artifactFilename = `launcher-${proj.slug}-${targetOs}-v${version}.zip`;
    const artifactPath = path.join(BUILDS_DIR, artifactFilename);

    // Create zip archive
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(artifactPath);
      const archive = createZipArchive({ zlib: { level: 9 } });

      output.on('close', resolve);
      archive.on('error', reject);

      archive.pipe(output);

      // 1. Config file
      archive.append(JSON.stringify(launcherConfig, null, 2), { name: 'packpanel-launcher.json' });

      // 2. README & Instructions
      const readme = `# ${proj.title}
Version: ${version}
Plateforme cible: ${targetOs}
Généré le: ${new Date().toISOString()}

Ce package autonome contient la configuration et le moteur PackPanel V2.
Instances incluses :
${instRes.rows.map(i => `- ${i.name} (Minecraft ${i.minecraft_version} - ${i.loader_type})`).join('\n')}

Lancement :
- Windows : Exécutez run-launcher.bat
- Linux / macOS : ./run-launcher.sh
`;
      archive.append(readme, { name: 'README.txt' });

      // 3. Execution scripts
      const batScript = `@echo off
title ${proj.title}
echo Lancement du launcher ${proj.title}...
node -v >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Node.js ou Electron requis pour executer le launcher autonome.
    pause
    exit /b 1
)
npx electron .
`;
      archive.append(batScript, { name: 'run-launcher.bat' });

      const shScript = `#!/usr/bin/env bash
set -e
echo "Lancement du launcher ${proj.title}..."
if ! command -v node &> /dev/null; then
    echo "[ERREUR] Node.js ou Electron requis."
    exit 1
fi
npx electron .
`;
      archive.append(shScript, { name: 'run-launcher.sh', mode: 0o755 });

      // 4. Package.json descriptor for standalone execution
      const pkgJson = {
        name: proj.slug,
        version: version,
        main: "index.js",
        description: proj.title,
        dependencies: {}
      };
      archive.append(JSON.stringify(pkgJson, null, 2), { name: 'package.json' });

      archive.finalize();
    });

    // 5. Compute SHA256 and size
    const fileBuf = fs.readFileSync(artifactPath);
    const artifactSize = fileBuf.length;
    const artifactSha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');

    // 6. Update build record
    const finalLogs = `[${new Date().toISOString()}] Compilation réussie.\n` +
      `Fichier: ${artifactFilename}\nTaille: ${artifactSize} octets\nSHA256: ${artifactSha256}\n`;

    await query(
      `UPDATE launcher_builds
       SET status = 'completed',
           artifact_path = $1,
           artifact_size = $2,
           artifact_sha256 = $3,
           logs = logs || $4,
           completed_at = NOW()
       WHERE id = $5`,
      [artifactPath, artifactSize, artifactSha256, finalLogs, buildId]
    );

    return {
      buildId,
      artifactPath,
      artifactSize,
      artifactSha256,
      version
    };
  } catch (err: any) {
    await query(
      `UPDATE launcher_builds
       SET status = 'failed',
           error_message = $1,
           logs = logs || $2,
           completed_at = NOW()
       WHERE id = $3`,
      [err.message || 'Erreur inconnue', `\n[ERREUR] ${err.stack || err.message}\n`, buildId]
    );
    throw err;
  }
}
