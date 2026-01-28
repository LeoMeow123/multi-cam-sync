/**
 * Type declarations for the Electron preload API exposed to renderer
 */

import type { CameraSettings, CameraInfo, CameraConfig } from './camera';
import type { ArduinoStatus } from './arduino';
import type { RecordingConfig, RecordingStatus } from './recording';

export interface ElectronAPI {
  camera: {
    detectCameras: () => Promise<CameraInfo[]>;
    connect: (cameraId: string) => Promise<boolean>;
    connectAll: () => Promise<Record<string, boolean>>;
    disconnect: (cameraId: string) => Promise<void>;
    disconnectAll: () => Promise<void>;
    configure: (settings: Partial<CameraSettings>) => Promise<void>;
    getPreview: (cameraId: string) => Promise<string | null>;
    getStatus: () => Promise<Record<string, unknown>>;
    onFrameSaved: (callback: (frameInfo: unknown) => void) => () => void;
    onError: (callback: (cameraId: string, error: string) => void) => () => void;
  };

  arduino: {
    listPorts: () => Promise<string[]>;
    connect: (port?: string) => Promise<boolean>;
    disconnect: () => Promise<void>;
    arm: () => Promise<void>;
    disarm: () => Promise<void>;
    setFPS: (fps: number) => Promise<void>;
    setCameras: (count: number) => Promise<void>;
    triggerOnce: () => Promise<void>;
    getStatus: () => Promise<ArduinoStatus>;
    onStateChange: (callback: (state: string) => void) => () => void;
    onFrame: (callback: (frameNumber: number) => void) => () => void;
    onKilled: (callback: () => void) => () => void;
    onButton: (callback: (button: string) => void) => () => void;
  };

  recording: {
    start: () => Promise<boolean>;
    stop: () => Promise<{ frameCounts: Record<string, number>; synced: boolean }>;
    getStatus: () => Promise<RecordingStatus>;
    setConfig: (config: Partial<RecordingConfig>) => Promise<void>;
    getConfig: () => Promise<RecordingConfig>;
    onStatusChange: (callback: (status: RecordingStatus) => void) => () => void;
  };

  config: {
    load: () => Promise<unknown>;
    save: (config: unknown) => Promise<void>;
    getCameras: () => Promise<CameraConfig[]>;
    setCameras: (cameras: CameraConfig[]) => Promise<void>;
    selectOutputDir: () => Promise<string | null>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
