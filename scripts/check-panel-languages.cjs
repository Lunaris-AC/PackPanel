const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.PACKPANEL_API_BASE;
const token = process.env.PACKPANEL_TOKEN;
if (!base || !token) throw new Error('Set PACKPANEL_API_BASE and PACKPANEL_TOKEN for an isolated deployment.');
const directory = process.env.PACKPANEL_CHECK_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'packpanel-languages-'));
fs.mkdirSync(directory, { recursive: true });
let browser;
let instance;
async function request(route, method = 'GET') {
  const response = await fetch(base + '/api' + route, { method, headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status}`);
  return response.status === 204 ? {} : response.json();
}

(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.evaluate(token => {
    localStorage.setItem('packpanel_token', token);
    localStorage.setItem('packpanel_lang', 'en');
    localStorage.setItem('packpanel_setup_completed', 'true');
  }, token);
  await page.goto(base + '/instances/new');
  await page.getByRole('button', { name: '1.21.1', exact: true }).click();
  await page.getByText('Fabric', { exact: true }).click();
  await page.waitForFunction(() => document.querySelector('select')?.options.length > 0);
  const name = `Language check ${Date.now()}`;
  await page.getByPlaceholder('e.g. Survival 1.21').fill(name);
  await page.getByRole('button', { name: 'FR', exact: true }).click();
  await page.getByText("Identité de l'instance", { exact: false }).waitFor();
  assert.equal(await page.getByPlaceholder('e.g. Survival 1.21').count(), 0);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  assert.equal(await page.getByPlaceholder('e.g. Survival 1.21').inputValue(), name);
  await page.screenshot({ path: path.join(directory, 'panel-wizard-en.png'), fullPage: true });
  const creation = page.waitForResponse(response => response.url().endsWith('/api/v2/instances') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create instance', exact: true }).click();
  const response = await creation;
  assert.equal(response.ok(), true, await response.text());
  instance = (await response.json()).instance;
  await page.getByRole('button', { name: 'Files & mods', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  const tabs = [
    ['overview', 'packpanel.json manifest distribution'],
    ['files', 'No files in this endpoint'],
    ['publications', 'Release history & rollback'],
    ['settings', 'General settings & game engine'],
    ['launcher', 'Custom launcher for']
  ];
  for (const [route, text] of tabs) {
    await page.goto(base + `/instances/${instance.id}/${route}`);
    await page.getByText(text, { exact: route !== 'launcher' }).first().waitFor();
    const visible = await page.locator('main').innerText();
    fs.writeFileSync(path.join(directory, `panel-${route}-en.txt`), visible);
    assert.doesNotMatch(visible, /\b(Paramètres|Téléverser|Supprimer|Enregistrer|Aucune|Brouillon|Publié|fichiers|Créer|Rechercher|Sélectionner)\b/, `${route}: ${visible}`);
  }
  await page.goto(base + `/instances/${instance.id}/launcher`);
  await page.getByRole('button', { name: 'Enable launcher for this instance', exact: true }).click();
  await page.getByText('Appearance & branding', { exact: true }).waitFor();
  await page.getByText('Generate launcher executables', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(directory, 'panel-launcher-en.png'), fullPage: true });
  for (const [route, text] of [['dashboard', 'Dashboard'], ['jobs', 'Background tasks'], ['users', 'Users & Audit Logs']]) {
    await page.goto(base + '/' + route);
    await page.locator('main').getByText(text, { exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('main').innerText(), /\b(Aucune|Tâches|Supprimer|Enregistrer|Rechercher)\b/, route);
  }
  await page.reload();
  assert.equal(await page.evaluate(() => localStorage.getItem('packpanel_lang')), 'en');
  await page.getByRole('button', { name: 'FR', exact: true }).click();
  await page.locator('main').getByText('Utilisateurs & Journal d’audit', { exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
  assert.deepEqual(errors, []);
  console.log('PASS: English creation, all instance tabs, launcher settings, dashboard, jobs, users; French switching, form preservation and language persistence.');
  console.log(`Screenshots: ${directory}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (instance) {
    const current = (await request(`/v2/instances/${instance.id}`)).instance;
    await request(`/v2/instances/${instance.id}`, 'DELETE');
    const launcherId = current.launcher_project_id || current.launcher?.id;
    if (launcherId) await request(`/v2/launchers/${launcherId}`, 'DELETE');
    if (instance.endpoint_id) await request(`/endpoints/${instance.endpoint_id}`, 'DELETE');
  }
});
