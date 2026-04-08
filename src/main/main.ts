/**
 * Electron Main Process
 *
 * Entry point for the Camera Sync System desktop application.
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { MultiCameraManager } from './multi-camera-manager';
import { ArduinoManager } from './arduino-manager';
import type { CameraConfig, CameraSettings } from '../types/camera';
import type { RecordingConfig, RecordingStatus, AppConfig } from '../types/recording';
import { DEFAULT_APP_CONFIG, DEFAULT_RECORDING_CONFIG } from '../types/recording';
import { DEFAULT_ARDUINO_CONFIG } from '../types/arduino';

// Webpack entry points
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Global state
let mainWindow: BrowserWindow | null = null;
let cameraManager: MultiCameraManager | null = null;
let arduinoManager: ArduinoManager | null = null;
let appConfig: AppConfig = { ...DEFAULT_APP_CONFIG };
let recordingState: RecordingStatus = {
  state: 'idle',
  elapsed_seconds: 0,
  frame_counts: {},
  errors: [],
};
let recordingStartTime: number | null = null;
let recordingTimer: NodeJS.Timeout | null = null;

// Config file path
const getConfigPath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config.json');
};

// ============================================================================
// Window Management
// ============================================================================

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Camera Sync System',
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================================
// Config Management
// ============================================================================

function loadConfig(): AppConfig {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return { ...DEFAULT_APP_CONFIG, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  return { ...DEFAULT_APP_CONFIG };
}

function saveConfig(config: AppConfig): void {
  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

// ============================================================================
// Camera IPC Handlers
// ============================================================================

ipcMain.handle('camera:detect', async () => {
  if (!cameraManager) {
    cameraManager = new MultiCameraManager();
  }
  return await cameraManager.detectCameras();
});

ipcMain.handle('camera:connect', async (_event, cameraId: string) => {
  // Single camera connect: initialize manager if needed, then connect one camera
  if (!cameraManager) {
    cameraManager = new MultiCameraManager();
    setupCameraEvents();
    await cameraManager.initialize(appConfig.cameras);
  }
  const results = await cameraManager.connectAll();
  return results.get(cameraId) || false;
});

ipcMain.handle('camera:disconnect', async (_event, cameraId: string) => {
  if (cameraManager) {
    await cameraManager.disconnectAll();
  }
});

ipcMain.handle('camera:connect-all', async () => {
  // Always shutdown existing manager and reinitialize with current config
  if (cameraManager) {
    cameraManager.shutdown();
  }
  cameraManager = new MultiCameraManager();
  setupCameraEvents();
  await cameraManager.initialize(appConfig.cameras);
  const results = await cameraManager.connectAll();

  // Apply saved per-camera settings (from Camera Settings app)
  const perCam = appConfig.per_camera_settings || {};
  const globalSettings = appConfig.camera_settings || {};
  for (const cam of appConfig.cameras.filter(c => c.enabled)) {
    const settings = perCam[cam.id] || globalSettings;
    if (settings && Object.keys(settings).length > 0) {
      try {
        await cameraManager.configureOne(cam.id, settings);
        console.log(`[Main] Applied saved settings for ${cam.id}`);
      } catch (e) {
        console.warn(`[Main] Failed to apply settings for ${cam.id}:`, e);
      }
    }
  }

  return Object.fromEntries(results);
});

ipcMain.handle('camera:disconnect-all', async () => {
  if (cameraManager) {
    await cameraManager.disconnectAll();
  }
});

ipcMain.handle('camera:configure', async (_event, settings: Partial<CameraSettings>) => {
  if (cameraManager) {
    await cameraManager.configureAll(settings);
  }
  appConfig.camera_settings = { ...appConfig.camera_settings, ...settings };
  saveConfig(appConfig);
});

ipcMain.handle('camera:configure-one', async (_event, cameraId: string, settings: Partial<CameraSettings>) => {
  if (cameraManager) {
    await cameraManager.configureOne(cameraId, settings);
  }
  if (!appConfig.per_camera_settings) appConfig.per_camera_settings = {};
  appConfig.per_camera_settings[cameraId] = {
    ...appConfig.camera_settings,
    ...(appConfig.per_camera_settings[cameraId] || {}),
    ...settings,
  };
  saveConfig(appConfig);
});

ipcMain.handle('camera:get-preview', async (_event, cameraId: string) => {
  if (!cameraManager) return null;
  return await cameraManager.getPreview(cameraId);
});

ipcMain.handle('camera:get-status', async () => {
  if (!cameraManager) return {};
  const status = await cameraManager.getStatus();
  return Object.fromEntries(status);
});

// ============================================================================
// Arduino IPC Handlers
// ============================================================================

ipcMain.handle('arduino:list-ports', async () => {
  return await ArduinoManager.listPorts();
});

ipcMain.handle('arduino:connect', async (_event, port?: string) => {
  if (!arduinoManager) {
    arduinoManager = new ArduinoManager(appConfig.arduino || DEFAULT_ARDUINO_CONFIG);
    setupArduinoEvents();
  }
  return await arduinoManager.connect(port);
});

ipcMain.handle('arduino:disconnect', async () => {
  if (arduinoManager) {
    arduinoManager.disconnect();
  }
});

ipcMain.handle('arduino:arm', async () => {
  if (arduinoManager) {
    await arduinoManager.arm();
  }
});

ipcMain.handle('arduino:disarm', async () => {
  if (arduinoManager) {
    await arduinoManager.disarm();
  }
});

ipcMain.handle('arduino:set-fps', async (_event, fps: number) => {
  if (arduinoManager) {
    arduinoManager.setFPS(fps);
  }
  appConfig.recording.frame_rate = fps;
  saveConfig(appConfig);
});

ipcMain.handle('arduino:set-cameras', async (_event, count: number) => {
  if (arduinoManager) {
    arduinoManager.setCameras(count);
  }
});

ipcMain.handle('arduino:trigger-once', async () => {
  if (arduinoManager) {
    arduinoManager.triggerOnce();
  }
});

ipcMain.handle('arduino:get-status', async () => {
  if (!arduinoManager) {
    return {
      connected: false,
      port: '',
      state: 'disconnected',
      frame_count: 0,
      fps: appConfig.recording.frame_rate,
      cameras: appConfig.cameras.filter((c) => c.enabled).length,
    };
  }
  return arduinoManager.getStatus();
});

function setupArduinoEvents(): void {
  if (!arduinoManager) return;

  arduinoManager.on('armed', () => {
    recordingState.state = 'armed';
    sendToRenderer('arduino:state-change', 'armed');
    sendToRenderer('recording:status-change', recordingState);
  });

  arduinoManager.on('disarmed', () => {
    recordingState.state = 'idle';
    sendToRenderer('arduino:state-change', 'idle');
    sendToRenderer('recording:status-change', recordingState);
  });

  arduinoManager.on('recording', () => {
    recordingState.state = 'recording';
    recordingStartTime = Date.now();
    startRecordingTimer();
    sendToRenderer('arduino:state-change', 'recording');
    sendToRenderer('recording:status-change', recordingState);
  });

  arduinoManager.on('stopped', (frameCount: number) => {
    stopRecordingTimer();
    recordingState.state = 'idle';
    sendToRenderer('arduino:state-change', 'idle');
    sendToRenderer('recording:status-change', recordingState);
  });

  arduinoManager.on('killed', () => {
    handleKillSwitch();
  });

  arduinoManager.on('button', (button: string) => {
    sendToRenderer('arduino:button', button);
    if (button === 'START' && recordingState.state === 'armed') {
      startRecording();
    }
  });

  arduinoManager.on('frame', (frameNumber: number) => {
    sendToRenderer('arduino:frame', frameNumber);
  });
}

function setupCameraEvents(): void {
  if (!cameraManager) return;

  cameraManager.on('camera-error', (cameraId: string, error: string) => {
    sendToRenderer('camera:error', cameraId, error);
  });

  cameraManager.on('frame-saved', (frameInfo: any) => {
    sendToRenderer('camera:frame-saved', frameInfo);
  });
}

// ============================================================================
// Recording IPC Handlers
// ============================================================================

ipcMain.handle('recording:start', async (_event, sessionName?: string) => {
  return await startRecording(sessionName);
});

ipcMain.handle('recording:stop', async () => {
  return await stopRecording();
});

ipcMain.handle('recording:get-status', async () => {
  return recordingState;
});

ipcMain.handle('recording:set-config', async (_event, config: Partial<RecordingConfig>) => {
  appConfig.recording = { ...appConfig.recording, ...config };
  saveConfig(appConfig);
});

ipcMain.handle('recording:get-config', async () => {
  return appConfig.recording;
});

async function startRecording(sessionName?: string): Promise<boolean> {
  if (!cameraManager || !arduinoManager) {
    return false;
  }

  // Create session directory with custom name or timestamp fallback
  const baseFolderName = sessionName || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputDir = appConfig.recording.output_dir.replace('~', app.getPath('home'));

  // Avoid overwriting existing sessions: append -2, -3, etc. if needed
  let folderName = baseFolderName;
  let sessionDir = path.join(outputDir, folderName);
  let suffix = 2;
  while (fs.existsSync(sessionDir)) {
    folderName = `${baseFolderName}-${suffix}`;
    sessionDir = path.join(outputDir, folderName);
    suffix++;
  }

  try {
    fs.mkdirSync(sessionDir, { recursive: true });

    // Start camera capture (configures hardware trigger and starts grabbing)
    const fps = appConfig.recording.frame_rate || 120;
    await cameraManager.startCapture(sessionDir, fps);

    // Wait for cameras to be ready for triggers
    console.log('[Recording] Waiting for cameras to initialize...');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Configure Arduino with correct FPS and camera count
    // Compensate for Arduino timing overhead (~92% efficiency)
    const arduinoFps = Math.round(fps / 0.92);
    const cameraCount = appConfig.cameras.filter(c => c.enabled).length;
    console.log(`[Recording] Setting Arduino: ${arduinoFps} fps (compensated from ${fps} fps), ${cameraCount} cameras`);
    arduinoManager.setFPS(arduinoFps);
    arduinoManager.setCameras(cameraCount);
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for config

    // Start Arduino triggering
    console.log('[Recording] Starting Arduino triggers');
    arduinoManager.startRecording();

    recordingState = {
      state: 'recording',
      session_id: folderName,
      elapsed_seconds: 0,
      frame_counts: {},
      errors: [],
    };

    return true;
  } catch (error) {
    console.error('Failed to start recording:', error);
    recordingState.errors.push(String(error));
    return false;
  }
}

async function stopRecording(): Promise<{ frameCounts: Record<string, number>; synced: boolean }> {
  stopRecordingTimer();

  // Stop Arduino
  if (arduinoManager) {
    arduinoManager.stopRecording();
  }

  // Stop cameras and get frame counts
  let frameCounts: Record<string, number> = {};
  let synced = true;

  if (cameraManager) {
    const results = await cameraManager.stopCapture();
    frameCounts = Object.fromEntries(results);

    const sync = cameraManager.verifySyncStatus();
    synced = sync.synced;
  }

  recordingState.state = 'idle';
  recordingState.frame_counts = frameCounts;
  sendToRenderer('recording:status-change', recordingState);

  return { frameCounts, synced };
}

function handleKillSwitch(): void {
  console.log('[Main] Kill switch activated!');
  stopRecording();
  sendToRenderer('arduino:killed');
}

function startRecordingTimer(): void {
  recordingTimer = setInterval(() => {
    if (recordingStartTime) {
      recordingState.elapsed_seconds = Math.floor((Date.now() - recordingStartTime) / 1000);

      if (cameraManager) {
        recordingState.frame_counts = Object.fromEntries(cameraManager.getFrameCounts());
      }

      sendToRenderer('recording:status-change', recordingState);
    }
  }, 100);
}

function stopRecordingTimer(): void {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
  recordingStartTime = null;
}

// ============================================================================
// Config IPC Handlers
// ============================================================================

ipcMain.handle('config:load', async () => {
  return appConfig;
});

ipcMain.handle('config:save', async (_event, config: Partial<AppConfig>) => {
  // Merge instead of replace — frontend may send partial config
  appConfig = { ...appConfig, ...config };
  saveConfig(appConfig);
});

ipcMain.handle('config:get-cameras', async () => {
  return appConfig.cameras;
});

ipcMain.handle('config:set-cameras', async (_event, cameras: CameraConfig[]) => {
  appConfig.cameras = cameras;
  saveConfig(appConfig);

  // Reinitialize camera manager if needed
  if (cameraManager) {
    cameraManager.shutdown();
    await cameraManager.initialize(cameras.filter((c) => c.enabled));
  }
});

ipcMain.handle('config:select-output-dir', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Recording Output Directory',
  });

  if (!result.canceled && result.filePaths.length > 0) {
    appConfig.recording.output_dir = result.filePaths[0];
    saveConfig(appConfig);
    return result.filePaths[0];
  }

  return null;
});

// ============================================================================
// Utility Functions
// ============================================================================

function sendToRenderer(channel: string, ...args: any[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// ============================================================================
// App Lifecycle
// ============================================================================

app.on('ready', () => {
  appConfig = loadConfig();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  console.log('[Main] Shutting down...');

  // Stop recording if active
  if (recordingState.state === 'recording') {
    await stopRecording();
  }

  // Disconnect Arduino
  if (arduinoManager) {
    arduinoManager.disconnect();
  }

  // Shutdown cameras
  if (cameraManager) {
    cameraManager.shutdown();
  }
});
