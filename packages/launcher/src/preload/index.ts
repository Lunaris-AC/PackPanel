import { contextBridge, ipcRenderer } from 'electron';
import { AuthProfile, EngineProgressEvent, LauncherConfigV2 } from '@packpanel/protocol';

export interface PackPanelApi {
  getWindowState: () => Promise<{ maximized: boolean }>;
  windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
  onWindowState: (callback: (state: { maximized: boolean }) => void) => () => void;
  getSettings: () => Promise<{ ramMb: number; customJvmArgs: string; gameDirectory: string; maximumMemoryMb: number }>;
  saveSettings: (settings: { ramMb: number; customJvmArgs: string }) => Promise<{ ramMb: number; customJvmArgs: string }>;
  openGameDirectory: () => Promise<void>;
  getConfig: () => Promise<LauncherConfigV2>;
  loginOffline: (username: string) => Promise<AuthProfile>;
  startMicrosoftLogin: () => Promise<{ userCode: string; verificationUri: string; expiresIn: number }>;
  completeMicrosoftLogin: () => Promise<AuthProfile>;
  launchInstance: (options: {
    instanceId?: string;
    ramMb?: number;
    customJavaPath?: string;
  }) => Promise<void>;
  stopInstance: () => Promise<void>;
  onProgress: (callback: (event: EngineProgressEvent) => void) => () => void;
  onLog: (callback: (logLine: string) => void) => () => void;
  onCrash: (callback: (crashData: { exitCode: number; crashReport?: string }) => void) => () => void;
}

const api: PackPanelApi = {
  getWindowState: () => ipcRenderer.invoke('launcher:getWindowState'),
  windowControl: action => ipcRenderer.invoke('launcher:windowControl', action),
  onWindowState: callback => {
    const subscription = (_event: any, state: { maximized: boolean }) => callback(state);
    ipcRenderer.on('launcher:windowState', subscription);
    return () => ipcRenderer.removeListener('launcher:windowState', subscription);
  },
  getSettings: () => ipcRenderer.invoke('launcher:getSettings'),
  saveSettings: settings => ipcRenderer.invoke('launcher:saveSettings', settings),
  openGameDirectory: () => ipcRenderer.invoke('launcher:openGameDirectory'),
  getConfig: () => ipcRenderer.invoke('launcher:getConfig'),
  loginOffline: (username: string) => ipcRenderer.invoke('launcher:loginOffline', username),
  startMicrosoftLogin: () => ipcRenderer.invoke('launcher:startMicrosoftLogin'),
  completeMicrosoftLogin: () => ipcRenderer.invoke('launcher:completeMicrosoftLogin'),
  launchInstance: (options) => ipcRenderer.invoke('launcher:launchInstance', options),
  stopInstance: () => ipcRenderer.invoke('launcher:stopInstance'),
  onProgress: (callback) => {
    const subscription = (_event: any, value: EngineProgressEvent) => callback(value);
    ipcRenderer.on('launcher:progress', subscription);
    return () => ipcRenderer.removeListener('launcher:progress', subscription);
  },
  onLog: (callback) => {
    const subscription = (_event: any, value: string) => callback(value);
    ipcRenderer.on('launcher:log', subscription);
    return () => ipcRenderer.removeListener('launcher:log', subscription);
  },
  onCrash: (callback) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('launcher:crash', subscription);
    return () => ipcRenderer.removeListener('launcher:crash', subscription);
  }
};

contextBridge.exposeInMainWorld('packpanel', api);
