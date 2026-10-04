// Creates disposable fixtures. Run against an isolated deployment, or remove
// the returned instance, endpoint and launcher project after validation.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const base = (process.env.PACKPANEL_API_BASE || 'http://localhost:8080').replace(/\/$/, '');
const token = process.env.PACKPANEL_TOKEN;
if (!token) throw new Error('Set PACKPANEL_TOKEN to an administrator session pair.');
const directory = process.env.PACKPANEL_CHECK_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'packpanel-check-'));
fs.mkdirSync(directory, { recursive: true });
async function api(route, method = 'GET', body) {
  const response = await fetch(base + '/api' + route, { method, headers: { Authorization: 'Bearer ' + token, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 60; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 1000)); }
  throw new Error('Timed out: ' + label);
}
(async () => {
  const slug = 'release-check-' + crypto.randomBytes(5).toString('hex');
  const instance = (await api('/v2/instances', 'POST', { name: 'Release validation', slug, minecraftVersion: '1.21.1', loaderType: 'fabric' })).instance;
  const stateFile = path.join(directory, 'validation-session.json');
  fs.writeFileSync(stateFile, JSON.stringify({ base, token, instance, directory }), { mode: 0o600 });
  for (const loader of ['vanilla', 'forge', 'neoforge', 'quilt', 'fabric']) {
    const changed = (await api('/v2/instances/' + instance.id, 'PUT', { loaderType: loader })).instance;
    assert.equal(changed.loader_type, loader); assert.equal(changed.java_version, 21);
    if (loader !== 'vanilla') assert.ok(changed.loader_version);
  }
  await api('/v2/instances/' + instance.id, 'PUT', { serverAddress: 'example.com:25565' });
  assert.equal((await api('/v2/instances/' + instance.id, 'PUT', { serverAddress: null })).instance.server_address, null);
  const endpoint = '/endpoints/' + instance.endpoint_id;
  const upload = (await api(endpoint + '/uploads/sessions', 'POST', { expectedFilesCount: 1 })).session;
  const form = new FormData(); form.set('sessionId', upload.id); form.set('relativePath', 'config/release-check.txt'); form.set('file', new Blob(['release one\n']), 'check.txt');
  await api(endpoint + '/uploads/direct', 'POST', form);
  await waitFor(async () => (await api(endpoint + '/uploads/sessions/' + upload.id)).files.every(file => file.status === 'verified'), 'direct upload');
  await api('/v2/instances/' + instance.id + '/publish', 'POST');
  let manifest = await api('/v2/instances/' + instance.id + '/manifest');
  const file = manifest.files.find(file => file.path === 'config/release-check.txt'); assert.ok(file);
  const response = await fetch(file.url); assert.equal(response.status, 200); assert.equal(await response.text(), 'release one\n');
  const publicConfig = await api('/system/public-config');
  const filesBase = publicConfig.filesBaseUrl || 'https://' + publicConfig.filesFqdn;
  assert.equal((await fetch(filesBase + '/' + instance.slug + '/packpanel.json')).status, 200);
  const tusSession = (await api(endpoint + '/uploads/sessions', 'POST', { expectedFilesCount: 1 })).session;
  const metadata = Object.entries({ endpointId: instance.endpoint_id, sessionId: tusSession.id, relativePath: 'config/tus-check.txt' }).map(([key, value]) => key + ' ' + Buffer.from(value).toString('base64')).join(',');
  const creation = await fetch(base + '/api/uploads/tus', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Tus-Resumable': '1.0.0', 'Upload-Length': '9', 'Upload-Metadata': metadata } });
  assert.equal(creation.status, 201);
  const resumed = await fetch(new URL(creation.headers.get('location'), base), { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' }, body: 'tus-test\n' });
  assert.equal(resumed.status, 204);
  await waitFor(async () => (await api(endpoint + '/uploads/sessions/' + tusSession.id)).files.some(file => file.status === 'verified'), 'TUS upload');
  await api('/v2/instances/' + instance.id + '/publish', 'POST');
  const zip = new AdmZip(); zip.addFile('config/zip-check.txt', Buffer.from('zip-test\n'));
  const zipForm = new FormData(); zipForm.set('file', new Blob([zip.toBuffer()]), 'test.zip');
  const imported = await api(endpoint + '/uploads/zip', 'POST', zipForm);
  await waitFor(async () => { const job = (await api('/jobs/' + imported.jobId)).job; if (job.status === 'failed') throw new Error(job.error_message); return job.status === 'completed'; }, 'ZIP extraction');
  await waitFor(async () => (await api(endpoint + '/uploads/sessions/' + imported.sessionId)).session.status === 'completed', 'ZIP draft');
  await api('/v2/instances/' + instance.id + '/publish', 'POST');
  manifest = await api('/v2/instances/' + instance.id + '/manifest');
  assert.ok(manifest.files.some(file => file.path === 'config/zip-check.txt'));
  assert.ok(manifest.files.some(file => file.path === 'config/tus-check.txt'));
  await api('/v2/instances/' + instance.id + '/launcher/enable', 'POST');
  await api('/v2/instances/' + instance.id + '/launcher', 'PUT', { title: 'Release Check Launcher', authMicrosoft: false, authOffline: true });
  console.log('API, modloader combinations, uploads, publication and CDN validated. Building Windows runtime...');
  const build = (await api('/v2/instances/' + instance.id + '/launcher/build', 'POST', { targetOs: 'windows' })).build;
  const download = await fetch(base + '/api/v2/instances/' + instance.id + '/launcher/builds/' + build.buildId + '/download', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(download.status, 200);
  const bytes = Buffer.from(await download.arrayBuffer()); assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), build.artifactSha256);
  const artifact = new AdmZip(bytes);
  for (const entry of ['windows/electron.exe', 'windows/resources/app/dist/main/index.js', 'windows/resources/app/dist/renderer/index.html']) assert.ok(artifact.getEntry(entry), entry);
  const zipPath = path.join(directory, 'downloaded-launcher.zip'); fs.writeFileSync(zipPath, bytes);
  fs.writeFileSync(stateFile, JSON.stringify({ base, token, instance, directory, build, zipPath }), { mode: 0o600 });
  console.log('PASS API and downloaded artifact. Validation directory: ' + directory);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
