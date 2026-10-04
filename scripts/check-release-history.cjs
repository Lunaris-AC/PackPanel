const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const directory = process.env.PACKPANEL_CHECK_DIR;
if (!directory) throw new Error('Set PACKPANEL_CHECK_DIR to the validation directory.');
const session = JSON.parse(fs.readFileSync(path.join(directory, 'validation-session.json')));
const source = '/endpoints/' + session.instance.endpoint_id;
async function api(route, method = 'GET', body) {
  const response = await fetch(session.base + '/api' + route, { method, headers: { Authorization: 'Bearer ' + session.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(route + ': ' + response.status + ' ' + await response.text());
  return response.json();
}
let target;
(async () => {
  const original = (await api(source + '/versions')).versions.find(version => version.is_active);
  assert.ok(original);
  await api('/v2/instances/' + session.instance.id, 'PUT', { serverAddress: 'release-test.invalid:25565' });
  await api(source + '/explorer/save-file', 'POST', { path: 'config/history-check.txt', content: 'history draft\n', commitNow: true });
  await api(source + '/versions/' + original.id + '/rollback', 'POST');
  assert.equal((await api('/v2/instances/' + session.instance.id)).instance.server_address, null);
  assert.ok(!(await api('/v2/instances/' + session.instance.id + '/manifest')).files.some(file => file.path === 'config/history-check.txt'));
  const slug = 'history-check-' + crypto.randomBytes(5).toString('hex');
  target = (await api('/endpoints', 'POST', { name: 'Release history validation', slug })).endpoint;
  await api(source + '/promote', 'POST', { targetEndpointId: target.id });
  const publicConfig = await api('/system/public-config');
  const base = publicConfig.filesBaseUrl || 'https://' + publicConfig.filesFqdn;
  const response = await fetch(base + '/' + slug + '/index.php');
  assert.equal(response.status, 200);
  const manifest = await response.json();
  const files = manifest.filter(file => typeof file.checksumSHA1 === 'string');
  assert.ok(files.length);
  for (const file of files) {
    assert.ok(file.url.startsWith(base + '/' + slug + '/releases/'));
    assert.equal((await fetch(file.url)).status, 200);
  }
  console.log('PASS: rollback restores files and clears direct connection; promotion copies actual public files and rewrites target URLs.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (target) await api('/endpoints/' + target.id, 'DELETE').catch(error => { console.error(error); process.exitCode = 1; });
});
