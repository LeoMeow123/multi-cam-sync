/**
 * Preload Script - Electron Context Bridge
 *
 * Exposes a safe API to the renderer process via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { CameraSettings, CameraInfo, CameraConfig } from '../types/camera';
import type { ArduinoStatus } from '../types/arduino';
import type { RecordingConfig, RecordingStatus } from '../types/recording';

/**
 * Camera API
 */
const cameraAPI = {
  detectCameras: (): Promise<CameraInfo[]> =>
    ipcRenderer.invoke('camera:detect'),

  connect: (cameraId: string): Promise<boolean> =>
    ipcRenderer.invoke('camera:connect', cameraId),

  connectAll: (): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke('camera:connect-all'),

  disconnect: (cameraId: string): Promise<void> =>
    ipcRenderer.invoke('camera:disconnect', cameraId),

  disconnectAll: (): Promise<void> =>
    ipcRenderer.invoke('camera:disconnect-all'),

  configure: (settings: Partial<CameraSettings>): Promise<void> =>
    ipcRenderer.invoke('camera:configure', settings),

  getPreview: (cameraId: string): Promise<string | null> =>
    ipcRenderer.invoke('camera:get-preview', cameraId),

  getStatus: (): Promise<Record<string, any>> =>
    ipcRenderer.invoke('camera:get-status'),

  onFrameSaved: (callback: (frameInfo: any) => void) => {
    const handler = (_event: any, frameInfo: any) => callback(frameInfo);
    ipcRenderer.on('camera:frame-saved', handler);
    return () => ipcRenderer.removeListener('camera:frame-saved', handler);
  },

  onError: (callback: (cameraId: string, error: string) => void) => {
    const handler = (_event: any, cameraId: string, error: string) => callback(cameraId, error);
    ipcRenderer.on('camera:error', handler);
    return () => ipcRenderer.removeListener('camera:error', handler);
  },
};

/**
 * Arduino API
 */
const arduinoAPI = {
  listPorts: (): Promise<string[]> =>
    ipcRenderer.invoke('arduino:list-ports'),

  connect: (port?: string): Promise<boolean> =>
    ipcRenderer.invoke('arduino:connect', port),

  disconnect: (): Promise<void> =>
    ipcRenderer.invoke('arduino:disconnect'),

  arm: (): Promise<void> =>
    ipcRenderer.invoke('arduino:arm'),

  disarm: (): Promise<void> =>
    ipcRenderer.invoke('arduino:disarm'),

  setFPS: (fps: number): Promise<void> =>
    ipcRenderer.invoke('arduino:set-fps', fps),

  setCameras: (count: number): Promise<void> =>
    ipcRenderer.invoke('arduino:set-cameras', count),

  triggerOnce: (): Promise<void> =>
    ipcRenderer.invoke('arduino:trigger-once'),

  getStatus: (): Promise<ArduinoStatus> =>
    ipcRenderer.invoke('arduino:get-status'),

  onStateChange: (callback: (state: string) => void) => {
    const handler = (_event: any, state: string) => callback(state);
    ipcRenderer.on('arduino:state-change', handler);
    return () => ipcRenderer.removeListener('arduino:state-change', handler);
  },

  onFrame: (callback: (frameNumber: number) => void) => {
    const handler = (_event: any, frameNumber: number) => callback(frameNumber);
    ipcRenderer.on('arduino:frame', handler);
    return () => ipcRenderer.removeListener('arduino:frame', handler);
  },

  onKilled: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('arduino:killed', handler);
    return () => ipcRenderer.removeListener('arduino:killed', handler);
  },

  onButton: (callback: (button: string) => void) => {
    const handler = (_event: any, button: string) => callback(button);
    ipcRenderer.on('arduino:button', handler);
    return () => ipcRenderer.removeListener('arduino:button', handler);
  },
};

/**
 * Recording API
 */
const recordingAPI = {
  start: (): Promise<boolean> =>
    ipcRenderer.invoke('recording:start'),

  stop: (): Promise<{ frameCounts: Record<string, number>; synced: boolean }> =>
    ipcRenderer.invoke('recording:stop'),

  getStatus: (): Promise<RecordingStatus> =>
    ipcRenderer.invoke('recording:get-status'),

  setConfig: (config: Partial<RecordingConfig>): Promise<void> =>
    ipcRenderer.invoke('recording:set-config', config),

  getConfig: (): Promise<RecordingConfig> =>
    ipcRenderer.invoke('recording:get-config'),

  onStatusChange: (callback: (status: RecordingStatus) => void) => {
    const handler = (_event: any, status: RecordingStatus) => callback(status);
    ipcRenderer.on('recording:status-change', handler);
    return () => ipcRenderer.removeListener('recording:status-change', handler);
  },
};

/**
 * Config API
 */
const configAPI = {
  load: (): Promise<any> =>
    ipcRenderer.invoke('config:load'),

  save: (config: any): Promise<void> =>
    ipcRenderer.invoke('config:save', config),

  getCameras: (): Promise<CameraConfig[]> =>
    ipcRenderer.invoke('config:get-cameras'),

  setCameras: (cameras: CameraConfig[]): Promise<void> =>
    ipcRenderer.invoke('config:set-cameras', cameras),

  selectOutputDir: (): Promise<string | null> =>
    ipcRenderer.invoke('config:select-output-dir'),
};

// Expose APIs to renderer
contextBridge.exposeInMainWorld('electron', {
  camera: cameraAPI,
  arduino: arduinoAPI,
  recording: recordingAPI,
  config: configAPI,
});

// Type declarations for renderer
export type ElectronAPI = {
  camera: typeof cameraAPI;
  arduino: typeof arduinoAPI;
  recording: typeof recordingAPI;
  config: typeof configAPI;
};
