import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../../config';
import { query } from '../../db';
import { launcherBranding } from '../../build/launcher-branding';
import { NativeLauncherPlatformSchema } from '@packpanel/protocol/launcher-update';

interface Archive {
  artifact_path: string | null;
  artifact_sha256: string | null;
}

export async function launcherArchivePath(file: string | null) {
  if (!file || path.resolve(path.dirname(file)) !== path.resolve(DATA_DIR, 'builds')) return null;
  const stat = await fs.promises.lstat(file).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  return stat?.isFile() ? { file, size: stat.size } : null;
}

export async function sendLauncherArchive(req: FastifyRequest, reply: FastifyReply, archive: Archive) {
  const entry = await launcherArchivePath(archive.artifact_path);
  if (!entry) return reply.status(404).send({ error: 'Fichier artefact indisponible sur le serveur' });

  const { file, size } = entry;
  const etag = archive.artifact_sha256 ? `"${archive.artifact_sha256}"` : undefined;
  reply.header('Cache-Control', 'private, no-store').header('Accept-Ranges', 'bytes');
  if (etag) reply.header('ETag', etag);

  let start = 0;
  let end = size - 1;
  const range = req.headers.range;
  if (range && (!req.headers['if-range'] || req.headers['if-range'] === etag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && match[1]) {
      start = Number(match[1]);
      end = match[2] ? Math.min(end, Number(match[2])) : end;
    } else if (match && match[2]) {
      start = Math.max(0, size - Number(match[2]));
    }
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || start > end) {
      return reply.status(416).header('Content-Range', `bytes */${size}`).send();
    }
    reply.status(206).header('Content-Range', `bytes ${start}-${end}/${size}`);
  }

  const filename = path.basename(file);
  const mime = filename.endsWith('.zip') ? 'application/zip'
    : filename.endsWith('.dmg') ? 'application/x-apple-diskimage' : 'application/octet-stream';
  reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    .type(mime)
    .header('Content-Length', Math.max(0, end - start + 1));
  if (req.method === 'HEAD' || !size) return reply.send();
  return reply.send(fs.createReadStream(file, { start, end }));
}

const sharedBuilds = `
  FROM instances i
  JOIN releases r ON r.endpoint_id = i.endpoint_id AND r.is_active
  JOIN launcher_builds b ON b.instance_id = i.id AND b.launcher_project_id = i.launcher_project_id
  WHERE i.slug = $1 AND i.launcher_enabled AND b.status = 'completed' AND b.shared_at IS NOT NULL`;

export async function playerRoutes(server: FastifyInstance) {
  server.addHook('onRequest', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex');
  });

  server.get<{ Params: { slug: string } }>('/play/:slug/launcher', async (req, reply) => {
    const { rows: [project] } = await query(
      `SELECT i.id AS instance_id, i.name AS instance_name, p.id AS launcher_id, p.title, p.accent_color,
              p.background_url, p.logo_url, p.icon_url, p.discord_url, p.website_url
       FROM instances i JOIN launcher_projects p ON p.id = i.launcher_project_id
       WHERE i.slug = $1 AND i.launcher_enabled
         AND EXISTS (SELECT 1 FROM releases r WHERE r.endpoint_id = i.endpoint_id AND r.is_active)`,
      [req.params.slug]
    );
    if (!project) return reply.status(404).send({ error: 'Launcher indisponible' });
    return {
      launcherId: project.launcher_id,
      instanceId: project.instance_id,
      instanceName: project.instance_name,
      branding: launcherBranding(project)
    };
  });

  server.get<{ Params: { slug: string; platform: string } }>('/play/:slug/updates/:platform', async (req, reply) => {
    const { slug, platform } = req.params;
    if (!NativeLauncherPlatformSchema.safeParse(platform).success) return reply.status(404).send();
    const { rows: [build] } = await query(
      `SELECT b.artifact_path ${sharedBuilds} AND b.target_os = $2 AND b.artifact_format = 'native'
       ORDER BY b.shared_at DESC, b.id DESC LIMIT 1`, [slug, platform]
    );
    const artifact = build && await launcherArchivePath(build.artifact_path);
    if (!artifact) return reply.status(404).send();
    const envelope = await fs.promises.readFile(artifact.file + '.update.json', 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!envelope) return reply.status(404).send();
    return reply.type('application/json').send(envelope);
  });

  server.get<{ Params: { slug: string } }>('/play/:slug', async (req, reply) => {
    const { slug } = req.params;
    const result = await query(`
      SELECT i.name, i.description, r.release_id, r.release_notes, r.published_at, r.game_config,
             b.id, b.target_os, b.version, b.artifact_path, b.artifact_size, b.artifact_sha256, b.artifact_format
      ${sharedBuilds}
      ORDER BY b.shared_at DESC, b.id DESC`, [slug]);
    const available = [];
    const platforms = new Set<string>();
    for (const build of result.rows) {
      if (platforms.has(build.target_os) || !await launcherArchivePath(build.artifact_path)) continue;
      platforms.add(build.target_os);
      available.push({
        platform: build.target_os,
        format: build.artifact_format,
        extension: path.extname(build.artifact_path),
        version: build.version,
        bytes: Number(build.artifact_size),
        sha256: build.artifact_sha256,
        url: `/play-api/${encodeURIComponent(slug)}/downloads/${build.id}`
      });
    }
    if (!available.length) return reply.status(404).send({ error: 'Téléchargement indisponible' });

    const pack = result.rows[0];
    return {
      name: pack.name,
      description: pack.description,
      release: {
        id: pack.release_id,
        notes: pack.release_notes,
        publishedAt: pack.published_at,
        minecraftVersion: pack.game_config?.minecraft_version,
        loader: pack.game_config?.loader_type
      },
      downloads: available
    };
  });

  server.route<{ Params: { slug: string; buildId: string } }>({
    method: ['GET', 'HEAD'],
    url: '/play/:slug/downloads/:buildId',
    async handler(req, reply) {
      const { slug, buildId } = req.params;
      const result = await query(`SELECT b.artifact_path, b.artifact_sha256 ${sharedBuilds} AND b.id::text = $2`, [slug, buildId]);
      if (!result.rows[0]) return reply.status(404).send({ error: 'Téléchargement indisponible' });
      return sendLauncherArchive(req, reply, result.rows[0]);
    }
  });
}
