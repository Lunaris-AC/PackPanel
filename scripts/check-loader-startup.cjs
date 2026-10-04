// Run after check-release.cjs, using its downloaded Windows application.
const fs = require('node:fs');
const path = require('node:path');
const { _electron } = require('playwright');
const directory = process.env.PACKPANEL_CHECK_DIR;
if (!directory) throw new Error('Set PACKPANEL_CHECK_DIR to the validation directory.');
const session = JSON.parse(fs.readFileSync(path.join(directory, 'validation-session.json')));
const root = path.join(directory, 'packpanel-desktop-check');
let app;
async function api(route, method, body) {
  const response = await fetch(session.base + '/api' + route, {
    method, headers: { Authorization: 'Bearer ' + session.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw new Error(route + ': ' + response.status + ' ' + await response.text());
  return response.json();
}
async function setLoader(loader) {
  const result = await api('/v2/instances/' + session.instance.id, 'PUT', { loaderType: loader });
  await api('/v2/instances/' + session.instance.id + '/publish', 'POST');
  return result.instance;
}
(async () => {
  app = await _electron.launch({ executablePath: path.join(root, 'windows', 'electron.exe'), args: ['--user-data-dir=' + path.join(root, 'user-data')], timeout: 60000 });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !document.getElementById('play').disabled);
  await page.locator('#language-en').click();
  await page.locator('#username').fill('ReleaseCheck');
  for (const loader of ['vanilla', 'forge', 'neoforge', 'quilt']) {
    const instance = await setLoader(loader);
    console.log('Testing ' + loader + ' ' + (instance.loader_version || '') + ' on Minecraft ' + instance.minecraft_version);
    await page.evaluate(() => document.getElementById('logs').textContent = '');
    await page.locator('#play').click();
    let started = false;
    let lastMessage = 0;
    const begin = Date.now();
    while (Date.now() - begin < 600000) {
      const state = await page.evaluate(() => ({ status: document.getElementById('status').textContent, error: document.getElementById('status').className, logs: document.getElementById('logs').textContent }));
      if (Date.now() - lastMessage > 20000) { console.log(loader + ': ' + state.status); lastMessage = Date.now(); }
      if (state.error === 'error') throw new Error(loader + ': ' + state.status + '\n' + state.logs.slice(-12000));
      if (/Created:.*textures\/atlas\/(?:gui|blocks)|OpenAL initialized on device|Sound engine started/.test(state.logs)) {
        fs.writeFileSync(path.join(directory, 'packpanel-game-' + loader + '.log'), state.logs);
        started = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!started) throw new Error(loader + ': timed out waiting for actual game startup');
    console.log('PASS actual Minecraft startup: ' + loader);
    await page.screenshot({ path: path.join(directory, 'packpanel-launcher-' + loader + '.png') });
    await page.locator('#stop').click();
    await page.waitForFunction(() => !document.getElementById('play').disabled);
  }
  await setLoader('fabric');
  await app.close();
})().catch(async error => {
  console.error(error);
  if (app) {
    const page = await app.firstWindow().catch(() => null);
    if (page) await page.evaluate(() => window.packpanel.stopInstance()).catch(() => {});
    await app.close().catch(() => {});
  }
  process.exitCode = 1;
});
