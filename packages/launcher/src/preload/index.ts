import { contextBridge, ipcRenderer } from 'electron';
import { AuthProfile, EngineProgressEvent, LauncherConfigV2 } from '@packpanel/protocol';
import type { PackStatus, PackSummary } from '../main/player-state';
import type { LauncherUpdateState } from '../main/launcher-updater';

export interface PackPanelApi {
  getWindowState: () => Promise<{ maximized: boolean }>;
  windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
  onWindowState: (callback: (state: { maximized: boolean }) => void) => () => void;
  getSettings: () => Promise<{ ramMb: number; customJvmArgs: string; gameDirectory: string; maximumMemoryMb: number }>;
  saveSettings: (settings: { ramMb: number; customJvmArgs: string }) => Promise<{ ramMb: number; customJvmArgs: string }>;
  openGameDirectory: () => Promise<void>;
  getConfig: () => Promise<LauncherConfigV2>;
  getPackStatus: () => Promise<PackStatus>;
  setOptionalFile: (choice: { path: string; enabled: boolean }) => Promise<void>;
  prepareInstance: () => Promise<void>;
  getCloudSettings: () => Promise<{ available: boolean; backupEnabled: boolean; backupActive: boolean; shareLogs: boolean }>;
  configureBackup: (key?: string) => Promise<void>;
  copyBackupKey: () => Promise<boolean>;
  setShareLogs: (enabled: boolean) => Promise<void>;
  onCloudIssue: (listener: () => void) => void;
  getLastLog: () => Promise<string>;
  copyDiagnostics: () => Promise<boolean>;
  copyServerAddress: (value: string) => Promise<void>;
  loginOffline: (username: string) => Promise<AuthProfile>;
  startMicrosoftLogin: () => Promise<{ userCode: string; verificationUri: string; expiresIn: number }>;
  completeMicrosoftLogin: () => Promise<AuthProfile>;
  launchInstance: (options: {
    instanceId?: string;
    ramMb?: number;
    customJavaPath?: string;
  }) => Promise<void>;
  stopInstance: () => Promise<void>;
  checkProgramUpdate: () => Promise<LauncherUpdateState>;
  applyProgramUpdate: () => Promise<void>;
  onProgramUpdate: (callback: (value: LauncherUpdateState) => void) => () => void;
  onProgress: (callback: (event: EngineProgressEvent) => void) => () => void;
  onPackReady: (callback: (pack: PackSummary) => void) => () => void;
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
  getPackStatus: () => ipcRenderer.invoke('launcher:getPackStatus'),
  setOptionalFile: choice => ipcRenderer.invoke('launcher:setOptionalFile', choice),
  prepareInstance: () => ipcRenderer.invoke('launcher:prepareInstance'),
  getCloudSettings: () => ipcRenderer.invoke('launcher:getCloudSettings'),
  configureBackup: key => ipcRenderer.invoke('launcher:configureBackup', key),
  copyBackupKey: () => ipcRenderer.invoke('launcher:copyBackupKey'),
  setShareLogs: enabled => ipcRenderer.invoke('launcher:setShareLogs', enabled),
  onCloudIssue: listener => { ipcRenderer.on('launcher:cloudIssue', () => listener()); },
  getLastLog: () => ipcRenderer.invoke('launcher:getLastLog'),
  copyDiagnostics: () => ipcRenderer.invoke('launcher:copyDiagnostics'),
  copyServerAddress: value => ipcRenderer.invoke('launcher:copyServerAddress', value),
  loginOffline: (username: string) => ipcRenderer.invoke('launcher:loginOffline', username),
  startMicrosoftLogin: () => ipcRenderer.invoke('launcher:startMicrosoftLogin'),
  completeMicrosoftLogin: () => ipcRenderer.invoke('launcher:completeMicrosoftLogin'),
  launchInstance: (options) => ipcRenderer.invoke('launcher:launchInstance', options),
  stopInstance: () => ipcRenderer.invoke('launcher:stopInstance'),
  checkProgramUpdate: () => ipcRenderer.invoke('launcher:checkProgramUpdate'),
  applyProgramUpdate: () => ipcRenderer.invoke('launcher:applyProgramUpdate'),
  onProgramUpdate: callback => {
    const subscription = (_event: unknown, value: LauncherUpdateState) => callback(value);
    ipcRenderer.on('launcher:programUpdate', subscription);
    return () => ipcRenderer.removeListener('launcher:programUpdate', subscription);
  },
  onProgress: (callback) => {
    const subscription = (_event: any, value: EngineProgressEvent) => callback(value);
    ipcRenderer.on('launcher:progress', subscription);
    return () => ipcRenderer.removeListener('launcher:progress', subscription);
  },
  onPackReady: callback => {
    const subscription = (_event: unknown, value: PackSummary) => callback(value);
    ipcRenderer.on('launcher:packReady', subscription);
    return () => ipcRenderer.removeListener('launcher:packReady', subscription);
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
