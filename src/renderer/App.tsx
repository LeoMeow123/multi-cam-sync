/**
 * Main App Component
 */

import React, { useState, useEffect } from 'react';
import CameraGrid from './components/CameraGrid';
import RecordingControls from './components/RecordingControls';
import StatusDashboard from './components/StatusDashboard';
import SettingsPanel from './components/SettingsPanel';
import HomePage from './components/HomePage';
import type { CameraConfig } from '../types/camera';
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
  const [isConnecting, setIsConnecting] = useState(false);

  // Load initial config
  useEffect(() => {
    loadConfig();
    setupEventListeners();
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
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const setupEventListeners = () => {
    // Arduino events
    window.electron.arduino.onStateChange((state: string) => {
      setArduinoStatus((prev) => ({ ...prev, state: state as any }));
    });

    window.electron.arduino.onKilled(() => {
      alert('Kill switch activated! Recording stopped.');
    });

    // Recording events
    window.electron.recording.onStatusChange((status: RecordingStatus) => {
      setRecordingStatus(status);
    });

    // Camera events
    window.electron.camera.onError((cameraId: string, error: string) => {
      console.error(`Camera ${cameraId} error:`, error);
    });
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

  // Preview refresh
  let previewInterval: NodeJS.Timeout | null = null;

  const startPreviewRefresh = () => {
    stopPreviewRefresh();

    previewInterval = setInterval(async () => {
      if (recordingStatus.state === 'recording') return; // Don't refresh during recording

      const enabledCameras = cameras.filter((c) => c.enabled);
      for (const camera of enabledCameras) {
        const preview = await window.electron.camera.getPreview(camera.id);
        if (preview) {
          setPreviews((prev) => ({ ...prev, [camera.id]: preview }));
        }
      }
    }, 500); // 2 FPS preview
  };

  const stopPreviewRefresh = () => {
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }
  };

  // Recording controls
  const handleArm = async () => {
    await window.electron.arduino.arm();
  };

  const handleDisarm = async () => {
    await window.electron.arduino.disarm();
  };

  const handleStartRecording = async () => {
    await window.electron.recording.start();
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
  };

  const handleDetectCameras = async () => {
    try {
      await window.electron.camera.detectCameras();
    } catch (error) {
      console.error('Failed to detect cameras:', error);
    }
  };

  const handleSelectOutputDir = async () => {
    const dir = await window.electron.config.selectOutputDir();
    if (dir) {
      setRecordingConfig((prev) => ({ ...prev, output_dir: dir }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Camera Sync System</h1>
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
            </nav>

            {/* Connect/Disconnect button */}
            {arduinoStatus.connected ? (
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
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="p-6">
        {activeTab === 'home' ? (
          <HomePage
            arduinoStatus={arduinoStatus}
            cameras={cameras}
            cameraStatus={cameraStatus}
            recordingConfig={recordingConfig}
            isConnecting={isConnecting}
            onConnect={handleConnect}
            onDetectCameras={handleDetectCameras}
            onNavigate={(tab) => setActiveTab(tab as Tab)}
          />
        ) : activeTab === 'cameras' ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Camera grid - spans 3 columns */}
            <div className="lg:col-span-3">
              <CameraGrid
                cameras={cameras.filter((c) => c.enabled)}
                previews={previews}
                status={cameraStatus}
                frameCounts={recordingStatus.frame_counts}
              />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <StatusDashboard
                arduinoStatus={arduinoStatus}
                recordingStatus={recordingStatus}
                cameraCount={cameras.filter((c) => c.enabled).length}
              />

              <RecordingControls
                state={recordingStatus.state}
                arduinoConnected={arduinoStatus.connected}
                camerasConnected={Object.values(cameraStatus).some((s: any) => s?.connected)}
                frameCount={arduinoStatus.frame_count}
                elapsedSeconds={recordingStatus.elapsed_seconds}
                onArm={handleArm}
                onDisarm={handleDisarm}
                onStart={handleStartRecording}
                onStop={handleStopRecording}
              />
            </div>
          </div>
        ) : (
          <SettingsPanel
            cameras={cameras}
            recordingConfig={recordingConfig}
            arduinoStatus={arduinoStatus}
            onSave={handleSaveSettings}
            onSelectOutputDir={handleSelectOutputDir}
            onDetectCameras={async () => {
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
