const api = window.packpanel;
const el = id => document.getElementById(id);
const translations = {
  fr: {
    minimize: 'Réduire', maximize: 'Agrandir', restore: 'Restaurer', close: 'Fermer', yourSpace: 'VOTRE ESPACE', play: 'Jouer', settings: 'Paramètres', website: 'Communauté',
    adventure: 'VOTRE PROCHAINE AVENTURE', heroDescription: 'Un monde à explorer.\nUne histoire à construire.', madeForYou: 'Votre communauté. Votre monde.',
    readyTitle: 'L’aventure vous attend.', readyDescription: 'Choisissez votre pseudo, on s’occupe du reste.', nickname: 'VOTRE PSEUDO', nicknamePlaceholder: 'Pseudo Minecraft',
    microsoft: 'Connexion Microsoft', stop: 'Arrêter', syncNote: 'Votre jeu se met à jour automatiquement avant chaque lancement.', makeItYours: 'À VOTRE FAÇON',
    settingsDescription: 'Les bons réglages, pour votre façon de jouer.', memoryTitle: 'Mémoire du jeu', memoryDescription: 'Donnez à votre monde la place dont il a besoin.',
    megabytes: 'Mo', gigabytes: 'Go', memoryHint: '4096 Mo = 4 Go. Votre ordinateur dispose de {total} Go de mémoire.', argumentsTitle: 'Arguments JVM supplémentaires',
    argumentsDescription: 'Ils s’ajoutent aux réglages de l’instance. La mémoire se règle ci-dessus.', save: 'Enregistrer', saved: 'Paramètres enregistrés.',
    filesTitle: 'Les fichiers de votre jeu', filesDescription: 'Mods, captures d’écran et sauvegardes : tout est ici.', logs: 'Journal du jeu', offline: 'MODE OFFLINE',
    ready: 'Prêt à jouer.', preparing: 'Préparation…', runningButton: 'Jeu en cours', stopping: 'Arrêt en cours…', stopped: 'Minecraft est arrêté.',
    resolving_version: 'Vérification de Minecraft et du modloader…', syncing_files: 'Mise à jour des fichiers du jeu…', checking_java: 'Vérification de Java…',
    downloading_java: 'Téléchargement de Java…', downloading_assets: 'Préparation des fichiers Minecraft…', launching: 'Démarrage de Minecraft…', running: 'Minecraft est en cours d’exécution.',
    downloadingFile: 'Téléchargement : {file}', assets: 'Textures et sons {count}', libraries: 'Bibliothèques {count}',
    crash: 'Le jeu s’est arrêté avec une erreur ({code}). Consultez le journal dans les paramètres.', nicknameError: 'Choisissez un pseudo de 3 à 16 caractères : lettres, chiffres et tiret bas.',
    memoryError: 'Choisissez une allocation mémoire valide, entre 1024 Mo et la mémoire disponible.', argumentError: 'Vérifiez les guillemets de vos arguments JVM.',
    genericError: 'Une erreur est survenue. Consultez le journal dans les paramètres.', missingInstance: 'Aucune instance configurée.', device: 'Ouvrez {url} et saisissez le code {code}.'
  },
  en: {
    minimize: 'Minimize', maximize: 'Maximize', restore: 'Restore', close: 'Close', yourSpace: 'YOUR SPACE', play: 'Play', settings: 'Settings', website: 'Community',
    adventure: 'YOUR NEXT ADVENTURE', heroDescription: 'A world to explore.\nA story to build.', madeForYou: 'Your community. Your world.',
    readyTitle: 'Your adventure awaits.', readyDescription: 'Choose your nickname. We’ll take care of the rest.', nickname: 'YOUR NICKNAME', nicknamePlaceholder: 'Minecraft nickname',
    microsoft: 'Sign in with Microsoft', stop: 'Stop game', syncNote: 'Your game updates automatically before every launch.', makeItYours: 'MAKE IT YOURS',
    settingsDescription: 'The right settings for the way you play.', memoryTitle: 'Game memory', memoryDescription: 'Give your world the room it needs.',
    megabytes: 'MB', gigabytes: 'GB', memoryHint: '4096 MB = 4 GB. Your computer has {total} GB of memory.', argumentsTitle: 'Additional JVM arguments',
    argumentsDescription: 'These are added to the instance settings. Adjust memory above.', save: 'Save settings', saved: 'Settings saved.',
    filesTitle: 'Your game files', filesDescription: 'Mods, screenshots and saves: everything is here.', logs: 'Game log', offline: 'OFFLINE MODE',
    ready: 'Ready to play.', preparing: 'Preparing…', runningButton: 'Game running', stopping: 'Stopping…', stopped: 'Minecraft has stopped.',
    resolving_version: 'Checking Minecraft and the mod loader…', syncing_files: 'Updating game files…', checking_java: 'Checking Java…',
    downloading_java: 'Downloading Java…', downloading_assets: 'Preparing Minecraft files…', launching: 'Starting Minecraft…', running: 'Minecraft is running.',
    downloadingFile: 'Downloading: {file}', assets: 'Textures and sounds {count}', libraries: 'Libraries {count}',
    crash: 'The game stopped with an error ({code}). Check the game log in Settings.', nicknameError: 'Choose a nickname with 3–16 characters: letters, numbers and underscores.',
    memoryError: 'Choose a valid memory allocation, between 1024 MB and your available memory.', argumentError: 'Check the quotation marks in your JVM arguments.',
    genericError: 'Something went wrong. Check the game log in Settings.', missingInstance: 'No instance configured.', device: 'Open {url} and enter the code {code}.'
  }
};
let language = localStorage.getItem('packpanel_language') || (navigator.language.startsWith('fr') ? 'fr' : 'en');
if (!translations[language]) language = 'en';
const t = (key, variables = {}) => (translations[language][key] || key).replace(/\{(\w+)\}/g, (_, name) => variables[name] ?? '');
let busy = false;
let config;
let settings;
let microsoftProfile = false;
let maximized = false;
let progressEvent;
let statusKey = 'ready';
let statusVariables = {};
let statusError = false;
let saved = false;
const log = line => { el('logs').textContent = (el('logs').textContent + line + '\n').slice(-60000); el('logs').scrollTop = el('logs').scrollHeight; };
function status(key, variables = {}, error = false) {
  statusKey = key; statusVariables = variables; statusError = error;
  el('status').textContent = t(key, variables); el('status').className = error ? 'error' : '';
}
function renderProgress(event) {
  el('progress').value = event.progress; el('progress-value').textContent = Math.round(event.progress) + '%';
  const count = event.message?.match(/\(\d+\/\d+\)/)?.[0];
  if (event.step === 'syncing_files' && event.message?.startsWith('Téléchargement : ')) status('downloadingFile', { file: event.message.slice('Téléchargement : '.length) });
  else if (event.step === 'downloading_assets' && count) status(event.message.startsWith('Textures') ? 'assets' : 'libraries', { count });
  else status(event.step === 'idle' ? 'stopping' : event.step in translations.en ? event.step : 'preparing');
}
function updateButtons() {
  el('play').disabled = !config || busy || (!config.auth.offline && !microsoftProfile);
  el('username').disabled = busy; el('stop').hidden = !busy; document.body.dataset.busy = String(busy);
  el('play-label').textContent = t(busy ? (progressEvent?.step === 'running' ? 'runningButton' : 'preparing') : 'play');
}
function updateMemory() {
  const memory = Number(el('ram').value);
  const gigabytes = new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(memory / 1024);
  el('memory-value').textContent = gigabytes + ' ';
  const unit = document.createElement('small'); unit.textContent = t('gigabytes'); el('memory-value').append(unit);
  el('ram-range').value = memory;
  if (settings) el('memory-hint').textContent = t('memoryHint', { total: Math.floor(settings.maximumMemoryMb / 1024) });
}
function setLanguage(value) {
  language = value; localStorage.setItem('packpanel_language', value); document.documentElement.lang = value;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach(node => { node.title = t(node.dataset.i18nTitle); node.setAttribute('aria-label', node.title); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  el('language-fr').setAttribute('aria-pressed', String(value === 'fr')); el('language-en').setAttribute('aria-pressed', String(value === 'en'));
  el('window-maximize').title = t(maximized ? 'restore' : 'maximize'); el('window-maximize').setAttribute('aria-label', el('window-maximize').title);
  if (saved) el('settings-status').textContent = t('saved');
  if (progressEvent && busy) renderProgress(progressEvent); else status(statusKey, statusVariables, statusError);
  updateMemory(); updateButtons();
}
el('language-fr').onclick = () => setLanguage('fr'); el('language-en').onclick = () => setLanguage('en');
for (const name of ['minimize', 'maximize', 'close']) el('window-' + name).onclick = () => action(() => api.windowControl(name));
function windowState(state) {
  maximized = state.maximized;
  el('window-maximize').title = t(maximized ? 'restore' : 'maximize'); el('window-maximize').setAttribute('aria-label', el('window-maximize').title);
  el('maximize-icon').classList.toggle('maximized', maximized);
}
api.onWindowState(windowState); api.getWindowState().then(windowState).catch(error => log(error.message));
const values = () => ({ ramMb: Number(el('ram').value), customJvmArgs: el('jvm-args').value.trim() });
async function action(fn) {
  try { await fn(); } catch (error) {
    log(error.message);
    const message = error.message || '';
    const key = /pseudo|username|nom d.utilisateur/i.test(message) ? 'nicknameError' : /guillemet/i.test(message) ? 'argumentError' : /mémoire|ramMb/i.test(message) ? 'memoryError' : 'genericError';
    status(key, {}, true);
  }
}
function tab(showSettings) {
  el('home-panel').hidden = showSettings; el('settings-panel').hidden = !showSettings;
  el('home-tab').classList.toggle('selected', !showSettings); el('settings-tab').classList.toggle('selected', showSettings);
  el('home-tab').setAttribute('aria-pressed', String(!showSettings)); el('settings-tab').setAttribute('aria-pressed', String(showSettings));
}
el('home-tab').onclick = () => tab(false); el('settings-tab').onclick = () => tab(true);
el('ram').oninput = updateMemory;
el('ram-range').oninput = () => { el('ram').value = el('ram-range').value; updateMemory(); };
el('settings-form').onsubmit = event => { event.preventDefault(); action(async () => { await api.saveSettings(values()); saved = true; el('settings-status').textContent = t('saved'); }); };
el('open-folder').onclick = () => action(() => api.openGameDirectory());
el('username').value = localStorage.getItem('packpanel_username') || '';
el('username').onkeydown = event => { if (event.key === 'Enter' && !el('play').disabled) el('play').click(); };
el('microsoft').onclick = () => action(async () => {
  const device = await api.startMicrosoftLogin(); el('device').hidden = false;
  el('device').textContent = t('device', { url: device.verificationUri, code: device.userCode });
  await api.completeMicrosoftLogin(); microsoftProfile = true; el('device').hidden = true; updateButtons();
});
el('play').onclick = () => action(async () => {
  if (config.auth.offline && !/^[a-zA-Z0-9_]{3,16}$/.test(el('username').value.trim())) { status('nicknameError', {}, true); return; }
  if (!Number.isInteger(values().ramMb) || values().ramMb < 1024 || values().ramMb > settings.maximumMemoryMb) { tab(true); status('memoryError', {}, true); return; }
  busy = true; progressEvent = undefined; updateButtons(); status('preparing'); el('progress-area').hidden = false;
  try {
    if (config.auth.offline) { const name = el('username').value.trim(); await api.loginOffline(name); localStorage.setItem('packpanel_username', name); }
    await api.saveSettings(values()); await api.launchInstance({});
  } catch (error) { busy = false; updateButtons(); el('progress-area').hidden = true; throw error; }
});
el('stop').onclick = () => action(async () => { await api.stopInstance(); status('stopping'); });
api.onProgress(event => {
  progressEvent = event; renderProgress(event);
  if (event.step === 'stopped') { busy = false; el('progress-area').hidden = true; }
  updateButtons();
});
api.onLog(log);
api.onCrash(crash => { busy = false; updateButtons(); el('progress-area').hidden = true; status('crash', { code: crash.exitCode }, true); if (crash.crashReport) log(crash.crashReport); });
setLanguage(language);
action(async () => {
  config = await api.getConfig(); settings = await api.getSettings();
  document.title = config.branding.title; el('title').textContent = config.branding.title; el('window-title').textContent = config.branding.title;
  const instance = config.instances.find(instance => instance.isDefault) || config.instances[0];
  if (!instance) throw new Error(t('missingInstance'));
  el('instance-name').textContent = instance.name;
  if (/^#[0-9a-f]{6}$/i.test(config.branding.accentColor)) document.documentElement.style.setProperty('--accent', config.branding.accentColor);
  if (config.branding.logoUrl && /^https?:/.test(config.branding.logoUrl)) { el('logo').src = config.branding.logoUrl; el('logo').hidden = false; el('default-logo').setAttribute('hidden', ''); }
  if (config.branding.backgroundUrl && /^https?:/.test(config.branding.backgroundUrl)) { el('custom-background').style.backgroundImage = 'url(' + JSON.stringify(config.branding.backgroundUrl) + ')'; el('custom-background').hidden = false; }
  el('ram').value = settings.ramMb; el('ram').max = settings.maximumMemoryMb; el('ram-range').max = settings.maximumMemoryMb; el('jvm-args').value = settings.customJvmArgs;
  el('microsoft').hidden = !config.auth.microsoft; el('username-field').hidden = !config.auth.offline;
  if (!config.auth.offline) el('status-mode').hidden = true;
  for (const [id, url] of [['discord', config.branding.discordUrl], ['website', config.branding.websiteUrl]]) if (url && /^https?:\/\//.test(url)) { el(id).href = url; el(id).hidden = false; }
  updateMemory(); updateButtons();
});
