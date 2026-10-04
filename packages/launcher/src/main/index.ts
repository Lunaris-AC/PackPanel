import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { z } from 'zod';
import { AuthProfile, LauncherConfigV2, LauncherConfigV2Schema } from '@packpanel/protocol';
import {
  MinecraftEngine,
  createOfflineProfile,
  parseJvmArguments,
  MicrosoftAuthenticator,
  DeviceCodeResponse
} from '@packpanel/engine';

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
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const settingsSchema = z.object({ ramMb: z.number().int().min(1024).max(65536), customJvmArgs: z.string().max(8192).default('') });
function readSettings() {
  try { return settingsSchema.parse(JSON.parse(fs.readFileSync(settingsPath, 'utf8'))); }
  catch { return { ramMb: Math.min(4096, Math.max(1024, Math.floor(os.totalmem() / 1024 / 1024))), customJvmArgs: '' }; }
}
function configuredInstance() {
  const config = loadLauncherConfig();
  const instance = config.instances.find(instance => instance.isDefault) || config.instances[0];
  if (!instance || !/^[a-z0-9_-]+$/.test(instance.slug)) throw new Error('Instance du launcher absente ou invalide.');
  return instance;
}
function instanceDirectory() { return path.join(dataDir, 'instances', configuredInstance().slug); }
engine.on('exit', () => { launchInProgress = false; });
engine.on('crash', () => { launchInProgress = false; });
engine.on('error', () => { launchInProgress = false; });

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
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  const notifyWindowState = () => mainWindow?.webContents.send('launcher:windowState', { maximized: mainWindow.isMaximized() });
  mainWindow.on('maximize', notifyWindowState);
  mainWindow.on('unmaximize', notifyWindowState);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());

  // Forward engine events to renderer
  engine.on('progress', (event) => {
    mainWindow?.webContents.send('launcher:progress', event);
  });

  engine.on('log', (line) => {
    mainWindow?.webContents.send('launcher:log', line);
  });

  engine.on('crash', (data) => {
    mainWindow?.webContents.send('launcher:crash', data);
  });
  engine.on('exit', () => mainWindow?.webContents.send('launcher:progress', { step: 'stopped', progress: 0, message: 'Minecraft est arrêté.' }));
  engine.on('error', error => mainWindow?.webContents.send('launcher:crash', { exitCode: -1, crashReport: error.message }));

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
ipcMain.handle('launcher:getSettings', async () => ({ ...readSettings(), gameDirectory: instanceDirectory(), maximumMemoryMb: Math.min(65536, Math.max(1024, Math.floor(os.totalmem() / 1024 / 1024))) }));
ipcMain.handle('launcher:saveSettings', async (_event: any, settings: unknown) => {
  const parsed = settingsSchema.parse(settings);
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
  if (options.ramMb !== undefined && (!Number.isInteger(options.ramMb) || options.ramMb < 1024 || options.ramMb > 65536)) throw new Error('Allocation mémoire invalide.');

  const instanceGameDir = path.join(dataDir, 'instances', targetInstance.slug);
  if (!fs.existsSync(instanceGameDir)) {
    fs.mkdirSync(instanceGameDir, { recursive: true });
  }

  launchInProgress = true;
  try { await engine.launchInstance({
    manifestUrl: targetInstance.manifestUrl,
    gameDir: instanceGameDir,
    profile: currentProfile,
    customJavaPath: options.customJavaPath,
    maxMemoryMb: options.ramMb || readSettings().ramMb,
    customJvmArgs: parseJvmArguments(readSettings().customJvmArgs)
  }); } catch (error) { launchInProgress = false; throw error; }
});

ipcMain.handle('launcher:stopInstance', async () => {
  engine.stopInstance();
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
