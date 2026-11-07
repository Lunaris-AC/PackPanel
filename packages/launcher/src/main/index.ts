import { app, BrowserWindow, clipboard, ipcMain, Menu, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { z } from 'zod';
import { AuthProfile, InstanceManifestV2, LauncherConfigV2, LauncherConfigV2Schema } from '@packpanel/protocol';
import {
  MinecraftEngine,
  createOfflineProfile,
  parseJvmArguments,
  MicrosoftAuthenticator,
  DeviceCodeResponse,
  InstanceSynchronizer
} from '@packpanel/engine';
import { PlayerCloud } from './player-cloud';
import { packSummarySchema, redactDiagnostics, summarizePack } from './player-state';
import { downloadLauncherUpgrade, installLauncherUpgrade, installedWindowsRoot, type LauncherUpdateState } from './launcher-updater';

let mainWindow: BrowserWindow | null = null;
let currentProfile: AuthProfile | null = null;
let msAuthSession: { auth: MicrosoftAuthenticator; deviceCode: DeviceCodeResponse } | null = null;

// Determine game directory in user data
const customUserData = app.commandLine.getSwitchValue('user-data-dir');
if (customUserData) app.setPath('userData', path.resolve(customUserData));
const dataDir = path.join(app.getPath('userData'), 'game');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const engine = new MinecraftEngine({ baseDir: dataDir });
let launchInProgress = false;
let upgrading = false;
let configuringBackup = false;
let quitAfterGame = false;
let preparedUpgrade: Awaited<ReturnType<typeof downloadLauncherUpgrade>>;
let updateCheck: Promise<LauncherUpdateState> | undefined;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const settingsSchema = z.object({ ramMb: z.number().int().min(1024).max(65536), customJvmArgs: z.string().max(8192).default('') });
const maximumMemoryMb = Math.min(65536, Math.max(1024, Math.floor(os.totalmem() / 1024 / 1024)));
function readSettings() {
  try {
    const settings = settingsSchema.parse(JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
    return { ...settings, ramMb: Math.min(settings.ramMb, maximumMemoryMb) };
  } catch { return { ramMb: Math.min(4096, maximumMemoryMb), customJvmArgs: '' }; }
}
function configuredInstance() {
  const config = loadLauncherConfig();
  const instance = config.instances.find(instance => instance.isDefault) || config.instances[0];
  if (!instance || !/^[a-z0-9_-]+$/.test(instance.slug)) throw new Error('Instance du launcher absente ou invalide.');
  return instance;
}
function instanceDirectory() { return path.join(dataDir, 'instances', configuredInstance().slug); }
function playerDirectory() { return path.join(app.getPath('userData'), 'packs', configuredInstance().id); }
function writePlayerFile(name: string, content: string) {
  const directory = playerDirectory();
  const filename = path.join(directory, name);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(filename + '.tmp', content, { mode: 0o600 });
  fs.renameSync(filename + '.tmp', filename);
}
function readPlayerFile(name: string) {
  try { return fs.readFileSync(path.join(playerDirectory(), name), 'utf8'); }
  catch { return ''; }
}
const optionalChoicesSchema = z.record(z.boolean());
function readOptionalChoices(): Record<string, boolean> {
  try { return optionalChoicesSchema.parse(JSON.parse(readPlayerFile('optional-files.json'))); }
  catch { return {}; }
}

function playerCloud() {
  return new PlayerCloud(configuredInstance(),
    () => readPlayerFile('player-cloud.json'),
    content => writePlayerFile('player-cloud.json', content));
}

let gameSession: { id: string; player: string; token: string; played?: boolean; saveOptions?: () => Promise<void> } | undefined;

function reportCloudIssue() {
  recordLog('PackPanel: Minecraft options could not be synchronized.');
  mainWindow?.webContents.send('launcher:cloudIssue');
}

async function finishGame(exitCode: number) {
  const session = gameSession;
  gameSession = undefined;
  if (session?.played) {
    const cloud = playerCloud();
    const log = liveLog.split('\n').filter(line => !/\[(?:CHAT|WHISPER)\]/i.test(line)).join('\n').slice(-30_000);
    await Promise.all([
      session.saveOptions?.().catch(reportCloudIssue),
      cloud.sendLog({ id: session.id, player: session.player, exitCode, log })
        .catch(() => recordLog('PackPanel: Minecraft diagnostics could not be sent.'))
    ]);
  }
  launchInProgress = false;
  flushLog();
  if (quitAfterGame && !mainWindow) app.quit();
}

let liveLog = '';
let logTimer: ReturnType<typeof setTimeout> | undefined;
function flushLog() {
  clearTimeout(logTimer);
  logTimer = undefined;
  if (!liveLog) return;
  try { writePlayerFile('last-launch.log', liveLog); }
  catch (error) { console.warn('Could not save launcher diagnostics', error); }
}
function recordLog(line: string) {
  const token = gameSession?.token;
  const cleaned = redactDiagnostics(token && token.length > 12 ? line.split(token).join('[redacted]') : line, os.homedir());
  liveLog = `${liveLog}${cleaned}\n`.slice(-60_000);
  mainWindow?.webContents.send('launcher:log', cleaned);
  logTimer ??= setTimeout(flushLog, 1000);
  logTimer.unref();
}
function beginPreparation() {
  if (launchInProgress || upgrading || configuringBackup) throw new Error('Une instance est déjà en cours de lancement ou d’exécution.');
  launchInProgress = true;
  liveLog = '';
  recordLog(new Date().toISOString());
}
engine.on('log', recordLog);
engine.on('packReady', (manifest: InstanceManifestV2) => {
  const pack = summarizePack(manifest);
  try { writePlayerFile('installed.json', JSON.stringify(pack)); }
  catch (error) { recordLog(String(error)); }
  mainWindow?.webContents.send('launcher:packReady', pack);
});
engine.on('progress', event => {
  if (event.step === 'launching' && gameSession) gameSession.played = true;
  mainWindow?.webContents.send('launcher:progress', event);
});
engine.on('exit', async () => {
  await finishGame(0);
  mainWindow?.webContents.send('launcher:progress', { step: 'stopped', progress: 0, message: 'Minecraft est arrêté.' });
});
engine.on('crash', async ({ exitCode, crashReport }) => {
  recordLog(crashReport ? `Minecraft (${exitCode})\n${crashReport}` : `Minecraft (${exitCode})`);
  await finishGame(exitCode);
  mainWindow?.webContents.send('launcher:crash', { exitCode });
});
engine.on('error', error => recordLog(error.message));

// Embedded or cached launcher configuration
function loadLauncherConfig(): LauncherConfigV2 {
  const resourcesPath = (process as any).resourcesPath || app.getAppPath();
  const embeddedConfigPath = path.join(resourcesPath, 'launcher-config.json');
  const appConfigPath = path.join(app.getAppPath(), 'launcher-config.json');
  for (const configPath of [embeddedConfigPath, appConfigPath]) {
    if (fs.existsSync(configPath)) {
      return LauncherConfigV2Schema.parse(JSON.parse(fs.readFileSync(configPath, 'utf8')));
    }
  }

  throw new Error('Configuration du launcher absente du package téléchargé.');
}

function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/index.js');

  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#101114',
    frame: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });
  mainWindow.once('ready-to-show', () => {
    const token = app.commandLine.getSwitchValue('packpanel-update-health');
    if (token) {
      try {
        const root = installedWindowsRoot(configuredInstance().id, process.execPath);
        if (!root || !/^[a-f0-9-]{36}$/i.test(token) || fs.readFileSync(path.join(root, 'upgrade.pending'), 'utf8') !== token) {
          throw new Error('Invalid launcher upgrade handoff');
        }
        fs.writeFileSync(path.join(root, `upgrade-ready-${token}`), 'ready', { flag: 'wx' });
      } catch (error) {
        console.error(error);
        app.exit(1);
        return;
      }
    }
    mainWindow?.show();
  });
  const notifyWindowState = () => mainWindow?.webContents.send('launcher:windowState', { maximized: mainWindow.isMaximized() });
  mainWindow.on('maximize', notifyWindowState);
  mainWindow.on('unmaximize', notifyWindowState);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());

  // Load renderer
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    if (fs.existsSync(htmlPath)) {
      mainWindow.loadFile(htmlPath);
    } else {
      // Fallback html
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head><title>PackPanel Launcher</title></head>
        <body style="background:#0f172a;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <h1>PackPanel Launcher</h1>
            <p>Moteur PackPanel V2 initialisé avec succès.</p>
          </div>
        </body>
        </html>
      `)}`);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------- IPC Handlers ----------------

ipcMain.handle('launcher:getWindowState', () => ({ maximized: mainWindow?.isMaximized() || false }));
ipcMain.handle('launcher:windowControl', (event, action: unknown) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
  } else if (action === 'close') mainWindow.close();
});

ipcMain.handle('launcher:getConfig', async () => {
  return loadLauncherConfig();
});
ipcMain.handle('launcher:getSettings', async () => ({ ...readSettings(), gameDirectory: instanceDirectory(), maximumMemoryMb }));
ipcMain.handle('launcher:saveSettings', async (_event: any, settings: unknown) => {
  const parsed = settingsSchema.parse(settings);
  if (parsed.ramMb > maximumMemoryMb) throw new Error('Allocation mémoire invalide.');
  parseJvmArguments(parsed.customJvmArgs);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const temporary = settingsPath + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(parsed), { mode: 0o600 });
  fs.renameSync(temporary, settingsPath);
  return parsed;
});
ipcMain.handle('launcher:openGameDirectory', async () => {
  const directory = instanceDirectory();
  fs.mkdirSync(directory, { recursive: true });
  const error = await shell.openPath(directory);
  if (error) throw new Error(error);
});

ipcMain.handle('launcher:getPackStatus', async () => {
  const instance = configuredInstance();
  let installed = null;
  try { installed = packSummarySchema.parse(JSON.parse(readPlayerFile('installed.json'))); }
  catch { /* The first preparation will record the installed version. */ }
  const latest = await InstanceSynchronizer.fetchManifest(instance.manifestUrl, AbortSignal.timeout(8000))
    .catch(() => null);
  let optionalFiles: Array<{ path: string; enabled: boolean }> = [];
  if (latest) {
    try { optionalFiles = new InstanceSynchronizer(instanceDirectory()).listOptionalFiles(latest, readOptionalChoices()); }
    catch { /* An invalid path will be reported during preparation. */ }
  }
  return { installed, latest: latest ? summarizePack(latest) : null, optionalFiles };
});
ipcMain.handle('launcher:setOptionalFile', async (_event, value: unknown) => {
  if (launchInProgress) throw new Error('Une instance est déjà en cours de lancement ou d’exécution.');
  const choice = z.object({ path: z.string().min(1).max(512), enabled: z.boolean() }).parse(value);
  const choices = { ...readOptionalChoices(), [choice.path]: choice.enabled };
  writePlayerFile('optional-files.json', JSON.stringify(choices));
});
ipcMain.handle('launcher:prepareInstance', async () => {
  const target = configuredInstance();
  beginPreparation();
  try {
    await engine.prepareInstance({ manifestUrl: target.manifestUrl, gameDir: instanceDirectory(), optionalFiles: readOptionalChoices() });
  } catch (error) {
    recordLog(String(error));
    throw error;
  } finally {
    launchInProgress = false;
    flushLog();
    if (quitAfterGame && !mainWindow) app.quit();
  }
});
ipcMain.handle('launcher:getCloudSettings', () => playerCloud().settings());
ipcMain.handle('launcher:configureBackup', async (_event, value: unknown) => {
  if (launchInProgress || configuringBackup) throw new Error('Fermez Minecraft avant de modifier la sauvegarde.');
  configuringBackup = true;
  try { await playerCloud().configureBackup(z.string().max(100).optional().parse(value)); }
  finally { configuringBackup = false; }
});
ipcMain.handle('launcher:copyBackupKey', () => {
  const key = playerCloud().copyKey();
  if (!key) return false;
  clipboard.writeText(key);
  return true;
});
ipcMain.handle('launcher:setShareLogs', (_event, value: unknown) => {
  playerCloud().setShareLogs(z.boolean().parse(value));
});
ipcMain.handle('launcher:getLastLog', async () => liveLog || readPlayerFile('last-launch.log'));
ipcMain.handle('launcher:copyDiagnostics', async () => {
  const log = liveLog || readPlayerFile('last-launch.log');
  if (!log) return false;
  clipboard.writeText(redactDiagnostics(log, os.homedir()));
  return true;
});
ipcMain.handle('launcher:copyServerAddress', async (_event, value: unknown) => {
  const address = z.string().min(1).max(255).regex(/^[a-zA-Z0-9_.:\-\[\]]+$/).parse(value);
  clipboard.writeText(address);
});

ipcMain.handle('launcher:loginOffline', async (_event: any, username: string) => {
  if (!loadLauncherConfig().auth.offline) throw new Error('Connexion hors ligne désactivée.');
  const profile = createOfflineProfile(username);
  currentProfile = profile;
  return profile;
});

ipcMain.handle('launcher:startMicrosoftLogin', async () => {
  if (!loadLauncherConfig().auth.microsoft) throw new Error('Connexion Microsoft désactivée.');
  const auth = new MicrosoftAuthenticator();
  const deviceCode = await auth.startDeviceCodeFlow();
  msAuthSession = { auth, deviceCode };

  return {
    userCode: deviceCode.user_code,
    verificationUri: deviceCode.verification_uri,
    expiresIn: deviceCode.expires_in
  };
});

ipcMain.handle('launcher:completeMicrosoftLogin', async () => {
  if (!msAuthSession) {
    throw new Error('Aucune session d\'authentification Microsoft en cours.');
  }

  const { auth, deviceCode } = msAuthSession;
  const msToken = await auth.pollForToken(deviceCode.device_code, deviceCode.interval || 5);
  const profile = await auth.loginWithMicrosoftToken(msToken);
  currentProfile = profile;
  msAuthSession = null;

  return profile;
});

ipcMain.handle('launcher:launchInstance', async (_event: any, options: {
  instanceId?: string;
  ramMb?: number;
  customJavaPath?: string;
}) => {
  if (launchInProgress) throw new Error('Une instance est déjà en cours de lancement ou d’exécution.');
  if (!currentProfile) {
    throw new Error('Veuillez vous connecter avant de lancer le jeu.');
  }

  const targetInstance = configuredInstance();
  if (options.instanceId && options.instanceId !== targetInstance.id) {
    throw new Error('Aucune instance Minecraft configurée dans ce launcher.');
  }
  if (!/^[a-z0-9_-]+$/.test(targetInstance.slug)) throw new Error('Identifiant d’instance invalide.');
  if (options.ramMb !== undefined && (!Number.isInteger(options.ramMb) || options.ramMb < 1024 || options.ramMb > maximumMemoryMb)) throw new Error('Allocation mémoire invalide.');

  const instanceGameDir = path.join(dataDir, 'instances', targetInstance.slug);
  if (!fs.existsSync(instanceGameDir)) {
    fs.mkdirSync(instanceGameDir, { recursive: true });
  }

  beginPreparation();
  const session: NonNullable<typeof gameSession> = {
    id: randomUUID(), player: currentProfile.name, token: currentProfile.accessToken
  };
  gameSession = session;
  try { await engine.launchInstance({
    manifestUrl: targetInstance.manifestUrl,
    gameDir: instanceGameDir,
    profile: currentProfile,
    customJavaPath: options.customJavaPath,
    optionalFiles: readOptionalChoices(),
    maxMemoryMb: options.ramMb || readSettings().ramMb,
    customJvmArgs: parseJvmArguments(readSettings().customJvmArgs),
    beforeLaunch: async () => {
      session.saveOptions = await playerCloud().prepareOptions(instanceGameDir).catch(() => {
        reportCloudIssue();
        return undefined;
      });
    }
  }); } catch (error) {
    recordLog(String(error));
    await finishGame(-1);
    throw error;
  }
});

ipcMain.handle('launcher:stopInstance', async () => {
  await engine.stopInstance();
});

ipcMain.handle('launcher:checkProgramUpdate', async (): Promise<LauncherUpdateState> => {
  if (preparedUpgrade) return { state: 'ready' };
  if (updateCheck) return updateCheck;
  const root = installedWindowsRoot(configuredInstance().id, process.execPath);
  if (!root || !fs.existsSync(path.join(root, 'app', 'resources', 'app', 'launcher-runtime.json'))) return { state: 'idle' };
  updateCheck = downloadLauncherUpgrade(root, state => mainWindow?.webContents.send('launcher:programUpdate', state))
    .then(update => {
      preparedUpgrade = update;
      return { state: update ? 'ready' : 'idle' } as const;
    })
    .catch(error => { recordLog(`Launcher update: ${error.message}`); return { state: 'failed' } as const; })
    .finally(() => { updateCheck = undefined; });
  return updateCheck;
});

ipcMain.handle('launcher:applyProgramUpdate', async () => {
  if (launchInProgress || upgrading || !preparedUpgrade) throw new Error('Fermez Minecraft avant de mettre à jour le launcher.');
  const instanceId = configuredInstance().id;
  const root = installedWindowsRoot(instanceId, process.execPath);
  if (!root) throw new Error('Installation Windows introuvable.');
  upgrading = true;
  try {
    await installLauncherUpgrade(root, instanceId, customUserData ? app.getPath('userData') : '', preparedUpgrade);
    app.quit();
  } catch (error) {
    upgrading = false;
    recordLog(`Launcher update: ${String(error)}`);
    throw error;
  }
});

// App lifecycle
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  if (launchInProgress) quitAfterGame = true;
  else app.quit();
});
app.on('before-quit', event => {
  if (launchInProgress) event.preventDefault();
  flushLog();
});
