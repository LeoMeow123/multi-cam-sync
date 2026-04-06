/**
 * Main App Component
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import CameraGrid from './components/CameraGrid';
import RecordingPanel from './components/RecordingPanel';
import StatusDashboard from './components/StatusDashboard';
import SettingsPanel from './components/SettingsPanel';
import HomePage from './components/HomePage';
import DeveloperModeDialog from './components/DeveloperModeDialog';
import type { CameraConfig, CameraSettings } from '../types/camera';
import { DEFAULT_CAMERA_SETTINGS } from '../types/camera';
import type { ArduinoStatus } from '../types/arduino';
import type { RecordingStatus, RecordingConfig } from '../types/recording';

// Access electron API
declare global {
  interface Window {
    electron: {
      camera: any;
      arduino: any;
      recording: any;
      config: any;
    };
  }
}

type Tab = 'home' | 'cameras' | 'settings';

const App: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [cameras, setCameras] = useState<CameraConfig[]>([]);
  const [cameraStatus, setCameraStatus] = useState<Record<string, any>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [arduinoStatus, setArduinoStatus] = useState<ArduinoStatus>({
    connected: false,
    port: '',
    state: 'disconnected',
    frame_count: 0,
    fps: 120,
    cameras: 2,
  });
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({
    state: 'idle',
    elapsed_seconds: 0,
    frame_counts: {},
    errors: [],
  });
  const [recordingConfig, setRecordingConfig] = useState<RecordingConfig>({
    output_dir: '~/recordings',
    frame_rate: 120,
    max_duration_seconds: 300,
  });
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(DEFAULT_CAMERA_SETTINGS);
  const [perCameraSettings, setPerCameraSettings] = useState<Record<string, CameraSettings>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [developerMode, setDeveloperMode] = useState(false);
  const [showDevModeDialog, setShowDevModeDialog] = useState(false);

  // Developer mode: compute effective statuses
  const effectiveArduinoStatus: ArduinoStatus = developerMode
    ? { ...arduinoStatus, connected: true, port: 'DEV_MODE', state: 'idle' }
    : arduinoStatus;

  const effectiveCameraStatus: Record<string, any> = developerMode
    ? cameras.reduce((acc, cam) => {
        if (cam.enabled) {
          acc[cam.id] = { connected: true, streaming: false };
        }
        return acc;
      }, {} as Record<string, any>)
    : cameraStatus;

  // Developer mode handlers
  const handleDevModeToggle = () => {
    if (developerMode) {
      // Turning off dev mode
      setDeveloperMode(false);
      setRecordingStatus({ state: 'idle', elapsed_seconds: 0, frame_counts: {}, errors: [] });
    } else {
      // Show password dialog
      setShowDevModeDialog(true);
    }
  };

  const handleDevModeConfirm = () => {
    setDeveloperMode(true);
    setShowDevModeDialog(false);
  };

  const handleDevModeCancel = () => {
    setShowDevModeDialog(false);
  };

  // Developer mode mock recording handlers
  const handleArmDevMode = () => {
    setRecordingStatus((prev) => ({ ...prev, state: 'armed' }));
  };

  const handleDisarmDevMode = () => {
    setRecordingStatus((prev) => ({ ...prev, state: 'idle' }));
  };

  const handleStartRecordingDevMode = (sessionName?: string) => {
    setRecordingStatus((prev) => ({
      ...prev,
      state: 'recording',
      session_id: sessionName || `dev_${Date.now()}`,
      elapsed_seconds: 0,
    }));
    // Simulate elapsed time
    const interval = setInterval(() => {
      setRecordingStatus((prev) => {
        if (prev.state !== 'recording') {
          clearInterval(interval);
          return prev;
        }
        return { ...prev, elapsed_seconds: prev.elapsed_seconds + 1 };
      });
    }, 1000);
  };

  const handleStopRecordingDevMode = () => {
    setRecordingStatus((prev) => ({ ...prev, state: 'stopping' }));
    setTimeout(() => {
      setRecordingStatus((prev) => ({ ...prev, state: 'idle' }));
      alert('[Dev Mode] Recording stopped. Files would be saved to output directory.');
    }, 500);
  };

  // Load initial config and set up event listeners with proper cleanup
  useEffect(() => {
    loadConfig();

    const unsubs = [
      window.electron.arduino.onStateChange((state: string) => {
        setArduinoStatus((prev) => ({ ...prev, state: state as any }));
      }),
      window.electron.arduino.onKilled(() => {
        alert('Kill switch activated! Recording stopped.');
      }),
      window.electron.recording.onStatusChange((status: RecordingStatus) => {
        setRecordingStatus(status);
      }),
      window.electron.camera.onError((cameraId: string, error: string) => {
        console.error(`Camera ${cameraId} error:`, error);
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  // Auto-poll hardware status when on the home tab
  useEffect(() => {
    if (activeTab !== 'home') return;

    const poll = async () => {
      try {
        const status = await window.electron.arduino.getStatus();
        setArduinoStatus(status);
      } catch { /* ignore */ }
      try {
        const statuses = await window.electron.camera.getStatus();
        setCameraStatus(statuses);
      } catch { /* ignore */ }
    };

    poll(); // initial poll
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const loadConfig = async () => {
    try {
      const config = await window.electron.config.load();
      setCameras(config.cameras || []);
      setRecordingConfig(config.recording || recordingConfig);
      if (config.camera_settings) setCameraSettings(config.camera_settings);
      if (config.per_camera_settings) setPerCameraSettings(config.per_camera_settings);
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  // Connect to all hardware
  const handleConnect = async () => {
    setIsConnecting(true);

    try {
      // Connect Arduino
      const arduinoConnected = await window.electron.arduino.connect();
      if (arduinoConnected) {
        const status = await window.electron.arduino.getStatus();
        setArduinoStatus(status);
      }

      // Connect cameras
      const cameraResults = await window.electron.camera.connectAll();
      setCameraStatus(cameraResults);

      // Get initial status
      const statuses = await window.electron.camera.getStatus();
      setCameraStatus(statuses);

      // Start preview refresh
      startPreviewRefresh();
    } catch (error) {
      console.error('Connection error:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect all
  const handleDisconnect = async () => {
    stopPreviewRefresh();
    await window.electron.camera.disconnectAll();
    await window.electron.arduino.disconnect();
    setCameraStatus({});
    setPreviews({});
    setArduinoStatus((prev) => ({ ...prev, connected: false, state: 'disconnected' }));
  };

  // Preview refresh — useRef avoids stale closure over cameras/recordingStatus
  const previewIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const camerasRef = useRef(cameras);
  const recordingStateRef = useRef(recordingStatus.state);
  camerasRef.current = cameras;
  recordingStateRef.current = recordingStatus.state;

  const stopPreviewRefresh = useCallback(() => {
    if (previewIntervalRef.current) {
      clearInterval(previewIntervalRef.current);
      previewIntervalRef.current = null;
    }
  }, []);

  const startPreviewRefresh = useCallback(() => {
    stopPreviewRefresh();

    // Don't start preview polling in hardware trigger mode — grabs will
    // always timeout and poison the IPC command queue. Preview refresh
    // only works in software/free-run trigger mode.
    if (cameraSettings.trigger_mode === 'hardware') return;

    previewIntervalRef.current = setInterval(async () => {
      if (recordingStateRef.current === 'recording') return;

      const enabledCameras = camerasRef.current.filter((c) => c.enabled);
      for (const camera of enabledCameras) {
        const preview = await window.electron.camera.getPreview(camera.id);
        if (preview) {
          setPreviews((prev) => ({ ...prev, [camera.id]: preview }));
        }
      }
    }, 500);
  }, [stopPreviewRefresh, cameraSettings.trigger_mode]);

  // Clean up preview interval on unmount
  useEffect(() => {
    return () => stopPreviewRefresh();
  }, [stopPreviewRefresh]);

  // Recording controls
  const handleArm = async () => {
    await window.electron.arduino.arm();
  };

  const handleDisarm = async () => {
    await window.electron.arduino.disarm();
  };

  const handleStartRecording = async (sessionName?: string) => {
    await window.electron.recording.start(sessionName);
    stopPreviewRefresh();
  };

  const handleStopRecording = async () => {
    const result = await window.electron.recording.stop();
    startPreviewRefresh();

    if (!result.synced) {
      alert(`Warning: Frame count mismatch!\n${JSON.stringify(result.frameCounts, null, 2)}`);
    }
  };

  // Settings
  const handleSaveSettings = async (config: any) => {
    await window.electron.config.save(config);
    setCameras(config.cameras);
    setRecordingConfig(config.recording);
    if (config.camera_settings) {
      setCameraSettings(config.camera_settings);
    }
  };

  const handleDetectCameras = async () => {
    try {
      await window.electron.camera.detectCameras();
    } catch (error) {
      console.error('Failed to detect cameras:', error);
    }
  };

  const handleSelectOutputDir = async (): Promise<string | null> => {
    const dir = await window.electron.config.selectOutputDir();
    if (dir) {
      setRecordingConfig((prev) => ({ ...prev, output_dir: dir }));
    }
    return dir;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Camera Sync System</h1>
            {developerMode && (
              <span className="px-2 py-1 text-xs font-semibold bg-yellow-600 text-yellow-100 rounded">
                DEV MODE
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Tab navigation */}
            <nav className="flex gap-2">
              <button
                onClick={() => setActiveTab('home')}
                className={`px-4 py-2 rounded-lg transition ${
                  activeTab === 'home'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Home
              </button>
              <button
                onClick={() => setActiveTab('cameras')}
                className={`px-4 py-2 rounded-lg transition ${
                  activeTab === 'cameras'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Cameras
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 rounded-lg transition ${
                  activeTab === 'settings'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Settings
              </button>
              <button
                onClick={handleDevModeToggle}
                className={`px-4 py-2 rounded-lg transition ${
                  developerMode
                    ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Dev Mode
              </button>
            </nav>

            {/* Connect/Disconnect button - hidden in dev mode */}
            {!developerMode && (effectiveArduinoStatus.connected ? (
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg transition"
              >
                {isConnecting ? 'Connecting...' : 'Connect'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Developer Mode Dialog */}
      {showDevModeDialog && (
        <DeveloperModeDialog
          onConfirm={handleDevModeConfirm}
          onCancel={handleDevModeCancel}
        />
      )}

      {/* Main content */}
      <main className="p-6">
        {activeTab === 'home' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <HomePage
                arduinoStatus={effectiveArduinoStatus}
                cameras={cameras}
                cameraStatus={effectiveCameraStatus}
                recordingConfig={recordingConfig}
                isConnecting={isConnecting}
                onConnect={developerMode ? () => {} : handleConnect}
                onDetectCameras={developerMode ? () => {} : handleDetectCameras}
                onNavigate={(tab) => setActiveTab(tab as Tab)}
              />
            </div>
            <div>
              <RecordingPanel
                state={recordingStatus.state}
                arduinoConnected={effectiveArduinoStatus.connected}
                camerasConnected={Object.values(effectiveCameraStatus).some((s: any) => s?.connected)}
                elapsedSeconds={recordingStatus.elapsed_seconds}
                frameCounts={recordingStatus.frame_counts}
                outputDir={recordingConfig.output_dir}
                onArm={developerMode ? handleArmDevMode : handleArm}
                onDisarm={developerMode ? handleDisarmDevMode : handleDisarm}
                onStart={developerMode ? handleStartRecordingDevMode : handleStartRecording}
                onStop={developerMode ? handleStopRecordingDevMode : handleStopRecording}
              />
            </div>
          </div>
        ) : activeTab === 'cameras' ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Camera grid - spans 3 columns */}
            <div className="lg:col-span-3">
              <CameraGrid
                cameras={cameras.filter((c) => c.enabled)}
                previews={previews}
                status={effectiveCameraStatus}
                frameCounts={recordingStatus.frame_counts}
              />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <StatusDashboard
                arduinoStatus={effectiveArduinoStatus}
                recordingStatus={recordingStatus}
                cameraCount={cameras.filter((c) => c.enabled).length}
              />

              <RecordingPanel
                state={recordingStatus.state}
                arduinoConnected={effectiveArduinoStatus.connected}
                camerasConnected={Object.values(effectiveCameraStatus).some((s: any) => s?.connected)}
                elapsedSeconds={recordingStatus.elapsed_seconds}
                frameCounts={recordingStatus.frame_counts}
                outputDir={recordingConfig.output_dir}
                onArm={developerMode ? handleArmDevMode : handleArm}
                onDisarm={developerMode ? handleDisarmDevMode : handleDisarm}
                onStart={developerMode ? handleStartRecordingDevMode : handleStartRecording}
                onStop={developerMode ? handleStopRecordingDevMode : handleStopRecording}
              />
            </div>
          </div>
        ) : (
          <SettingsPanel
            cameras={cameras}
            recordingConfig={recordingConfig}
            cameraSettings={cameraSettings}
            perCameraSettings={perCameraSettings}
            arduinoStatus={effectiveArduinoStatus}
            onSave={handleSaveSettings}
            onSelectOutputDir={handleSelectOutputDir}
            onDetectCameras={developerMode ? async () => [] : async () => {
              const detected = await window.electron.camera.detectCameras();
              return detected;
            }}
          />
        )}
      </main>
    </div>
  );
};

export default App;
