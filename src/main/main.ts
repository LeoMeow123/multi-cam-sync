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
import type { CameraConfig, CameraSettings, CameraCaptureResult } from '../types/camera';
import type {
  RecordingConfig,
  RecordingStatus,
  AppConfig,
  StartResult,
  StopResult,
} from '../types/recording';
import type { TriggerCount } from './arduino-manager';
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

// The recording in progress, for its sync report
let session: { dir: string; id: string; fps: number; startedAt: string } | null = null;
let startInProgress = false;
let stopInProgress: Promise<StopResult> | null = null;

/** Minimum time armed cameras are watched for frames before START. */
const ARM_SETTLE_MIN_MS = 300;
/** Trigger periods the arm check waits at the recording's rate. */
const ARM_SETTLE_PERIODS = 5;

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

  // Apply saved image settings (from Camera Settings app)
  // Only send exposure/gain/gamma — trigger settings are handled by the camera
  // manager and must stay as enums, not JSON strings.
  const perCam = appConfig.per_camera_settings || {};
  const globalSettings = appConfig.camera_settings || {};
  for (const cam of appConfig.cameras.filter(c => c.enabled)) {
    const raw = perCam[cam.id] || globalSettings;
    const imageSettings: Record<string, any> = {};
    if (raw.exposure_time != null) imageSettings.exposure_time = raw.exposure_time;
    if (raw.gain != null) imageSettings.gain = raw.gain;
    if (raw.gamma != null) imageSettings.gamma = raw.gamma;
    if (Object.keys(imageSettings).length > 0) {
      try {
        await cameraManager.configureOne(cam.id, imageSettings);
        console.log(`[Main] Applied saved settings for ${cam.id}:`, imageSettings);
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

  arduinoManager.on('stopped', () => {
    sendToRenderer('arduino:state-change', 'idle');
    // During a recording, stopRecording() owns the state: the cameras are
    // still draining their last frames when the Arduino reports STOPPED.
    if (!session && !stopInProgress) {
      stopRecordingTimer();
      recordingState.state = 'idle';
      sendToRenderer('recording:status-change', recordingState);
    }
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

async function startRecording(sessionName?: string): Promise<StartResult> {
  if (!cameraManager || !arduinoManager) {
    return { success: false, error: 'Cameras or Arduino not connected' };
  }
  if (startInProgress || stopInProgress || recordingState.state === 'recording') {
    return { success: false, error: 'A recording is already starting, running or stopping' };
  }
  startInProgress = true;

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

  const fps = appConfig.recording.frame_rate || 120;
  const cameraCount = appConfig.cameras.filter((c) => c.enabled).length;
  let camerasArmed = false;

  try {
    fs.mkdirSync(sessionDir, { recursive: true });

    // 1. Set the Arduino's rate. It fires exactly this rate: the scheduler
    //    advances by the nominal period, so no compensation factor is needed.
    console.log(`[Recording] Setting Arduino: ${fps} fps, ${cameraCount} cameras`);
    await arduinoManager.configure(fps, cameraCount);

    // 2. Arm every camera. A camera that fails to arm would miss the first
    //    pulses and count its frames from a later pulse than the others.
    console.log('[Recording] Arming cameras...');
    camerasArmed = true;
    const failures = await cameraManager.startCapture(sessionDir, fps);
    if (failures.size > 0) {
      const lines = Array.from(failures.entries()).map(([id, err]) => `${id}: ${err}`);
      throw new Error(`Not every camera armed, nothing was recorded.\n${lines.join('\n')}`);
    }

    // 3. Any frame before START means the triggers are already running
    //    (another trigger source, or firmware that starts on the button).
    const settleMs = Math.max(ARM_SETTLE_MIN_MS, (ARM_SETTLE_PERIODS * 1000) / fps);
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    const early = Array.from((await cameraManager.capturedFrameCounts()).entries()).filter(
      ([, n]) => n > 0
    );
    if (early.length > 0) {
      const names = early.map(([id, n]) => `${id} (${n} frames)`).join(', ');
      throw new Error(
        `${names} received frames before the Arduino started, so the cameras would count ` +
          `from different pulses. Nothing was recorded. Check that nothing else drives the ` +
          `trigger lines and that the Arduino runs firmware 1.1.0 or later.`
      );
    }

    // 4. Start the triggers. Pulse 1 is block ID 1 on every camera.
    console.log('[Recording] Starting Arduino triggers');
    await arduinoManager.startTriggers();

    session = { dir: sessionDir, id: folderName, fps, startedAt: new Date().toISOString() };
    recordingState = {
      state: 'recording',
      session_id: folderName,
      elapsed_seconds: 0,
      frame_counts: {},
      errors: [],
    };
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to start recording:', message);

    // Roll back: no pulses, no cameras capturing, no half-made session folder
    if (arduinoManager.getState() === 'recording') {
      await arduinoManager.stopTriggers().catch(() => undefined);
    }
    if (camerasArmed) {
      await cameraManager.stopCapture().catch(() => undefined);
    }
    fs.rmSync(sessionDir, { recursive: true, force: true });

    recordingState = { ...recordingState, state: 'idle', errors: [message] };
    sendToRenderer('recording:status-change', recordingState);
    return { success: false, error: message };
  } finally {
    startInProgress = false;
  }
}

/**
 * Stop the triggers, then the cameras, and write sync_report.json.
 *
 * The Arduino stops first, so its pulse count is final when each camera
 * drains its last frames and checks its block IDs against it.
 */
function stopRecording(): Promise<StopResult> {
  if (!stopInProgress) {
    stopInProgress = doStopRecording().finally(() => {
      stopInProgress = null;
    });
  }
  return stopInProgress;
}

async function doStopRecording(): Promise<StopResult> {
  stopRecordingTimer();
  recordingState.state = 'stopping';
  const warnings: string[] = [];

  let triggers: TriggerCount | null = null;
  if (arduinoManager) {
    try {
      triggers = await arduinoManager.stopTriggers();
    } catch (error) {
      warnings.push(`Arduino did not report its pulse count: ${error}`);
    }
  }

  let cameras = new Map<string, CameraCaptureResult>();
  if (cameraManager) {
    cameras = await cameraManager.stopCapture(triggers?.pulses);
  }

  cameras.forEach((r, id) => {
    if (r.verdict !== 'exact') warnings.push(`${id}: ${r.verdict}, ${r.verdict_reason}`);
  });
  if (triggers && triggers.late > 0) {
    warnings.push(
      `${triggers.late} pulses fired a whole frame period late; frames after them are ` +
        `not on the nominal 1/fps grid`
    );
  }
  const synced =
    triggers !== null &&
    triggers.late === 0 &&
    cameras.size > 0 &&
    Array.from(cameras.values()).every((r) => r.verdict === 'exact');

  const reportPath = session ? writeSyncReport(session, triggers, cameras, synced, warnings) : '';
  const frameCounts: Record<string, number> = {};
  cameras.forEach((r, id) => (frameCounts[id] = r.frame_count));

  session = null;
  recordingState.state = 'idle';
  recordingState.frame_counts = frameCounts;
  recordingState.errors = warnings;
  sendToRenderer('recording:status-change', recordingState);

  return {
    frameCounts,
    synced,
    triggerCount: triggers ? triggers.pulses : null,
    warnings,
    reportPath,
  };
}

function writeSyncReport(
  s: { dir: string; id: string; fps: number; startedAt: string },
  triggers: TriggerCount | null,
  cameras: Map<string, CameraCaptureResult>,
  synced: boolean,
  warnings: string[]
): string {
  const reportPath = path.join(s.dir, 'sync_report.json');
  const report = {
    session_id: s.id,
    start_time: s.startedAt,
    end_time: new Date().toISOString(),
    frame_rate: s.fps,
    arduino: triggers
      ? { pulses: triggers.pulses, late_pulses: triggers.late }
      : { pulses: null, late_pulses: null },
    synced,
    warnings,
    cameras: Object.fromEntries(cameras),
  };
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
  } catch (error) {
    console.error(`Failed to write ${reportPath}:`, error);
    return '';
  }
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
