import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { query, withTransaction } from '../db';
import { config, DATA_DIR, getFilesBaseUrl } from '../config';
import { appendDesktopRuntime } from './desktop-package';
import { hashFile } from '../storage/hasher';
import { JobQueue } from '../jobs/queue';
import { buildWindowsInstaller } from './windows-installer';
import { buildPlayerPackage, playerExtensions } from './player-package';
import { runtimeForInstaller } from './runtime-release';
import { launcherBranding } from './launcher-branding';

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
  targetOs: 'windows' | 'linux' | 'macos' | 'macos-arm64' | 'all';
  userId?: string;
  instanceId: string;
  artifactFormat?: 'zip' | 'installer' | 'native';
}

export async function reserveLauncherBuild(options: BuildLauncherOptions, background: boolean) {
  return withTransaction(async client => {
    const { launcherProjectId, targetOs, userId, instanceId, artifactFormat = 'zip' } = options;
    const project = await client.query('SELECT id FROM launcher_projects WHERE id = $1 FOR UPDATE', [launcherProjectId]);
    if (!project.rowCount) return null;
    const existing = await client.query(
      `SELECT id, version FROM launcher_builds WHERE launcher_project_id = $1 AND target_os = $2
       AND (instance_id = $3 OR instance_id IS NULL) AND status IN ('pending', 'building') AND artifact_format = $4`,
      [launcherProjectId, targetOs, instanceId, artifactFormat]
    );
    if (existing.rowCount) return { ...existing.rows[0], existing: true };

    const count = await client.query('SELECT COUNT(*) FROM launcher_builds WHERE launcher_project_id = $1', [launcherProjectId]);
    const version = `1.0.${Number(count.rows[0].count) + 1}`;
    const result = await client.query(
      `INSERT INTO launcher_builds (launcher_project_id, version, target_os, status, logs, created_by_user_id, instance_id, artifact_format)
       VALUES ($1, $2, $3, $4, '', $5, $6, $7) RETURNING id, version, target_os, status, created_at, instance_id, artifact_format`,
      [launcherProjectId, version, targetOs, background ? 'pending' : 'building', userId ?? null, instanceId, artifactFormat]
    );
    const build = result.rows[0];
    if (background) {
      await JobQueue.enqueue('build_launcher', { buildId: build.id, instanceId }, 0, 1, client.query.bind(client) as typeof query);
    }
    return build;
  });
}

export async function buildLauncherArtifact(buildId: string, instanceId: string): Promise<{
  buildId: string;
  artifactPath: string;
  artifactSize: number;
  artifactSha256: string;
  version: string;
} | null> {
  const buildRes = await query(
    `SELECT p.*, b.version, b.target_os, b.artifact_format FROM launcher_builds b JOIN launcher_projects p ON p.id = b.launcher_project_id
     WHERE b.id = $1 AND b.status IN ('pending', 'building')`, [buildId]);
  const proj = buildRes.rows[0];
  if (!proj) return null;
  const { version, target_os: targetOs } = proj as { version: string; target_os: BuildLauncherOptions['targetOs'] };
  const installer = targetOs === 'windows' && proj.artifact_format === 'installer';
  const native = targetOs !== 'all' && proj.artifact_format === 'native' ? targetOs : undefined;
  const extension = native ? playerExtensions[native] : installer ? '-setup.exe' : '.zip';
  const artifactFilename = `launcher-${proj.slug}-${targetOs}-v${version}-${buildId}${extension}`;
  const artifactPath = path.join(BUILDS_DIR, artifactFilename);
  const temporaryPath = artifactPath + '.part';
  const runtimePath = installer || native ? temporaryPath + '.zip' : temporaryPath;
  try {
    await fs.promises.mkdir(BUILDS_DIR, { recursive: true, mode: 0o755 });
    await query("UPDATE launcher_builds SET status = 'building', logs = $2 WHERE id = $1",
      [buildId, `[${new Date().toISOString()}] Initialisation du build ${version} pour ${targetOs}...\n`]);
    // 4. Fetch linked instances
    const instRes = await query(
      `SELECT i.*, lpi.is_default, e.slug as endpoint_slug
       FROM launcher_project_instances lpi
       JOIN instances i ON i.id = lpi.instance_id
       LEFT JOIN endpoints e ON e.id = i.endpoint_id
       WHERE lpi.launcher_project_id = $1 AND i.id = $2
       ORDER BY lpi.sort_order ASC`,
      [proj.id, instanceId]
    );
    if (instRes.rows.length === 0) throw new Error('Associez au moins une instance au launcher avant de le générer.');

    const launcherConfig = {
      formatVersion: 2,
      launcherId: proj.id,
      name: proj.name,
      slug: proj.slug,
      template: proj.template,
      branding: launcherBranding(proj),
      auth: {
        microsoft: proj.auth_microsoft,
        offline: proj.auth_offline
      },
      instances: instRes.rows.map(inst => ({
        id: inst.id,
        slug: inst.slug,
        name: inst.name,
        manifestUrl: `${getFilesBaseUrl()}/${inst.endpoint_slug || inst.slug}/packpanel.json`,
        isDefault: inst.is_default,
        iconUrl: inst.icon_url || undefined
      }))
    };

    const archive = createZipArchive(installer || native ? { store: true } : { zlib: { level: 3 } });
    const output = fs.createWriteStream(runtimePath);
    const controller = new AbortController();

    archive.append(JSON.stringify(launcherConfig, null, 2), { name: 'packpanel-launcher.json' });

    const readme = `# ${proj.title}
Version: ${version}
Plateforme cible: ${targetOs}
Généré le: ${new Date().toISOString()}

Ce package contient Electron, le programme du launcher et le moteur PackPanel.
Architecture : x64. Aucune installation de Node.js n'est nécessaire.
Instances incluses :
${instRes.rows.map(i => `- ${i.name} (Minecraft ${i.minecraft_version} - ${i.loader_type})`).join('\n')}

Lancement :
- Windows portable : Ouvrez windows/electron.exe
- Linux : Exécutez linux/run-launcher.sh (session graphique requise)
- macOS : Ouvrez macos/Electron.app
`;
    archive.append(readme, { name: 'README.txt' });

    const targets = targetOs === 'all' ? ['windows', 'linux', 'macos'] as const : [targetOs === 'macos-arm64' ? 'macos' : targetOs];
    const architecture = targetOs === 'macos-arm64' ? 'arm64' : 'x64';
    try {
      await Promise.all([pipeline(archive, output), (async () => {
        for (const target of targets) {
          await query('UPDATE launcher_builds SET stage = $2 WHERE id = $1', [buildId, target]);
          await appendDesktopRuntime(archive, target, launcherConfig, controller.signal, installer || native === 'windows' ? await runtimeForInstaller() : undefined, architecture);
        }
        await query("UPDATE launcher_builds SET stage = 'archiving' WHERE id = $1", [buildId]);
        await archive.finalize();
      })()]);
    } catch (error) {
      controller.abort();
      archive.destroy();
      output.destroy();
      throw error;
    }

    if (installer) {
      await query("UPDATE launcher_builds SET stage = 'installer' WHERE id = $1", [buildId]);
      await buildWindowsInstaller(runtimePath, temporaryPath, {
        id: instanceId, slug: instRes.rows[0].slug, title: proj.title, version
      });
    }
    if (native) {
      await query("UPDATE launcher_builds SET stage = 'installer' WHERE id = $1", [buildId]);
      await buildPlayerPackage(runtimePath, temporaryPath, native === 'macos-arm64' ? 'macos' : native, {
        id: instanceId, buildId, slug: instRes.rows[0].slug, title: proj.title, version
      });
    }
    await query("UPDATE launcher_builds SET stage = 'verifying' WHERE id = $1", [buildId]);
    const { sizeBytes: artifactSize, sha256: artifactSha256 } = await hashFile(temporaryPath);
    await fs.promises.rename(temporaryPath, artifactPath);

    // 6. Update build record
    const finalLogs = `[${new Date().toISOString()}] Compilation réussie.\n` +
      `Fichier: ${artifactFilename}\nTaille: ${artifactSize} octets\nSHA256: ${artifactSha256}\n`;

    const updated = await query(
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
    if (!updated.rowCount) {
      await fs.promises.rm(artifactPath, { force: true });
      return null;
    }

    return {
      buildId,
      artifactPath,
      artifactSize,
      artifactSha256,
      version
    };
  } catch (err: any) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
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
  } finally {
    if (runtimePath !== temporaryPath) await fs.promises.rm(runtimePath, { force: true }).catch(() => {});
  }
}
