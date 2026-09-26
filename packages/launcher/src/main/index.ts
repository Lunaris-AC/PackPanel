import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { AuthProfile, LauncherConfigV2 } from '@packpanel/protocol';
import {
  MinecraftEngine,
  createOfflineProfile,
  MicrosoftAuthenticator,
  DeviceCodeResponse
} from '@packpanel/engine';

let mainWindow: BrowserWindow | null = null;
let currentProfile: AuthProfile | null = null;
let msAuthSession: { auth: MicrosoftAuthenticator; deviceCode: DeviceCodeResponse } | null = null;

// Determine game directory in user data
const dataDir = path.join(app.getPath('userData'), 'game');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const engine = new MinecraftEngine({ baseDir: dataDir });

// Embedded or cached launcher configuration
function loadLauncherConfig(): LauncherConfigV2 {
  const resourcesPath = (process as any).resourcesPath || app.getAppPath();
  const embeddedConfigPath = path.join(resourcesPath, 'launcher-config.json');
  if (fs.existsSync(embeddedConfigPath)) {
    try {
      return JSON.parse(fs.readFileSync(embeddedConfigPath, 'utf8'));
    } catch (e) {}
  }

  // Default fallback configuration
  return {
    formatVersion: 2,
    launcherId: '00000000-0000-0000-0000-000000000001',
    name: 'PackPanel Community Launcher',
    slug: 'packpanel-community-launcher',
    template: 'community',
    branding: {
      title: 'PackPanel Launcher',
      accentColor: '#6366f1',
      discordUrl: 'https://discord.gg/minecraft'
    },
    auth: {
      microsoft: true,
      offline: true
    },
    instances: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        slug: 'default-modpack',
        name: 'Pack Minecraft Principal',
        manifestUrl: 'https://mccdn.inferi.fr/default-modpack/packpanel.json',
        isDefault: true
      }
    ]
  };
}

function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/index.js');

  mainWindow = new BrowserWindow({
    width: 1080,
    height: 680,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    frame: true,
    titleBarStyle: 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

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

ipcMain.handle('launcher:getConfig', async () => {
  return loadLauncherConfig();
});

ipcMain.handle('launcher:loginOffline', async (_event: any, username: string) => {
  const profile = createOfflineProfile(username);
  currentProfile = profile;
  return profile;
});

ipcMain.handle('launcher:startMicrosoftLogin', async () => {
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
  instanceId: string;
  ramMb?: number;
  customJavaPath?: string;
}) => {
  if (!currentProfile) {
    throw new Error('Veuillez vous connecter avant de lancer le jeu.');
  }

  const config = loadLauncherConfig();
  const targetInstance = config.instances.find(i => i.id === options.instanceId) || config.instances[0];
  if (!targetInstance) {
    throw new Error('Aucune instance Minecraft configurée dans ce launcher.');
  }

  const instanceGameDir = path.join(dataDir, 'instances', targetInstance.slug);
  if (!fs.existsSync(instanceGameDir)) {
    fs.mkdirSync(instanceGameDir, { recursive: true });
  }

  await engine.launchInstance({
    manifestUrl: targetInstance.manifestUrl,
    gameDir: instanceGameDir,
    profile: currentProfile,
    customJavaPath: options.customJavaPath,
    maxMemoryMb: options.ramMb || 4096
  });
});

ipcMain.handle('launcher:stopInstance', async () => {
  engine.stopInstance();
});

// App lifecycle
app.whenReady().then(() => {
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
