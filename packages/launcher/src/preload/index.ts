import { contextBridge, ipcRenderer } from 'electron';
import { AuthProfile, EngineProgressEvent, LauncherConfigV2 } from '@packpanel/protocol';

export interface PackPanelApi {
  getConfig: () => Promise<LauncherConfigV2>;
  loginOffline: (username: string) => Promise<AuthProfile>;
  startMicrosoftLogin: () => Promise<{ userCode: string; verificationUri: string; expiresIn: number }>;
  completeMicrosoftLogin: () => Promise<AuthProfile>;
  launchInstance: (options: {
    instanceId: string;
    ramMb?: number;
    customJavaPath?: string;
  }) => Promise<void>;
  stopInstance: () => Promise<void>;
  onProgress: (callback: (event: EngineProgressEvent) => void) => () => void;
  onLog: (callback: (logLine: string) => void) => () => void;
  onCrash: (callback: (crashData: { exitCode: number; crashReport?: string }) => void) => () => void;
}

const api: PackPanelApi = {
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
