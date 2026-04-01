/**
 * Settings Panel Component
 *
 * Configure cameras, recording settings, and Arduino.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CameraConfig, CameraInfo, CameraSettings } from '../../types/camera';
import { DEFAULT_CAMERA_SETTINGS } from '../../types/camera';
import type { ArduinoStatus } from '../../types/arduino';
import type { RecordingConfig } from '../../types/recording';

interface SettingsPanelProps {
  cameras: CameraConfig[];
  recordingConfig: RecordingConfig;
  cameraSettings: CameraSettings;
  perCameraSettings: Record<string, CameraSettings>;
  arduinoStatus: ArduinoStatus;
  onSave: (config: any) => void;
  onSelectOutputDir: () => Promise<string | null>;
  onDetectCameras: () => Promise<CameraInfo[]>;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  cameras: initialCameras,
  recordingConfig: initialRecordingConfig,
  cameraSettings: initialCameraSettings,
  perCameraSettings: initialPerCameraSettings,
  arduinoStatus,
  onSave,
  onSelectOutputDir,
  onDetectCameras,
}) => {
  const [cameras, setCameras] = useState<CameraConfig[]>(initialCameras);
  const [recordingConfig, setRecordingConfig] = useState(initialRecordingConfig);
  const [cameraSettings] = useState<CameraSettings>(initialCameraSettings);
  const [perCamSettings, setPerCamSettings] = useState<Record<string, CameraSettings>>(
    initialPerCameraSettings
  );
  const [detectedCameras, setDetectedCameras] = useState<CameraInfo[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [applyingCam, setApplyingCam] = useState<string | null>(null);
  const applyTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const enabledCameras = cameras.filter((c) => c.enabled);

  // Get effective settings for a camera (per-camera override or global default)
  const getSettings = (camId: string): CameraSettings => {
    return perCamSettings[camId] || cameraSettings;
  };

  // Fetch preview for a single camera
  const fetchPreview = useCallback(async (camId: string) => {
    try {
      const preview = await window.electron.camera.getPreview(camId);
      if (preview) {
        setPreviews((prev) => ({ ...prev, [camId]: preview }));
      }
    } catch {}
  }, []);

  // Debounced: apply settings to one camera and refresh its preview
  const applySettingLive = useCallback(
    (camId: string, settings: CameraSettings) => {
      if (applyTimersRef.current[camId]) clearTimeout(applyTimersRef.current[camId]);
      applyTimersRef.current[camId] = setTimeout(async () => {
        setApplyingCam(camId);
        try {
          await window.electron.camera.configureOne(camId, settings);
          await new Promise((r) => setTimeout(r, 200));
          await fetchPreview(camId);
        } catch (e) {
          console.error(`Live preview failed for ${camId}:`, e);
        } finally {
          setApplyingCam(null);
        }
      }, 300);
    },
    [fetchPreview]
  );

  // Fetch initial previews on mount
  useEffect(() => {
    enabledCameras.forEach((cam) => fetchPreview(cam.id));
  }, []);

  const updateCamSetting = (camId: string, partial: Partial<CameraSettings>) => {
    const current = getSettings(camId);
    const updated = { ...current, ...partial };
    setPerCamSettings((prev) => ({ ...prev, [camId]: updated }));
    applySettingLive(camId, updated);
  };

  const handleDetectCameras = async () => {
    setIsDetecting(true);
    try {
      const detected = await onDetectCameras();
      setDetectedCameras(detected);
    } catch (error) {
      console.error('Failed to detect cameras:', error);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleCameraChange = (index: number, field: keyof CameraConfig, value: any) => {
    const updated = [...cameras];
    updated[index] = { ...updated[index], [field]: value };
    setCameras(updated);
  };

  const handleAssignDetected = (cameraIndex: number, detected: CameraInfo) => {
    const updated = [...cameras];
    updated[cameraIndex] = {
      ...updated[cameraIndex],
      ip_address: detected.ip_address,
      name: detected.user_defined_name || detected.model_name,
    };
    setCameras(updated);
  };

  const handleSave = () => {
    onSave({
      cameras,
      recording: recordingConfig,
      camera_settings: cameraSettings,
    });
  };

  const handleSelectOutputDir = async () => {
    const dir = await onSelectOutputDir();
    if (dir) {
      setRecordingConfig((prev) => ({ ...prev, output_dir: dir }));
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Camera Configuration */}
      <section className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Camera Configuration</h2>
          <button
            onClick={handleDetectCameras}
            disabled={isDetecting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition"
          >
            {isDetecting ? 'Detecting...' : 'Detect Cameras'}
          </button>
        </div>

        {/* Detected cameras */}
        {detectedCameras.length > 0 && (
          <div className="mb-4 p-4 bg-gray-700 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">
              Detected Cameras ({detectedCameras.length})
            </h3>
            <div className="space-y-2">
              {detectedCameras.map((cam, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 bg-gray-600 rounded"
                >
                  <div>
                    <div className="font-medium">{cam.friendly_name}</div>
                    <div className="text-sm text-gray-400">
                      {cam.ip_address} • {cam.serial_number}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {cameras.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAssignDetected(idx, cam)}
                        className="px-2 py-1 text-xs bg-gray-500 hover:bg-gray-400 rounded"
                      >
                        → Cam {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Camera slots */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cameras.map((camera, index) => (
            <div key={camera.id} className="p-4 bg-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Camera {index + 1}</h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={camera.enabled}
                    onChange={(e) =>
                      handleCameraChange(index, 'enabled', e.target.checked)
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-400">Enabled</span>
                </label>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={camera.name}
                    onChange={(e) => handleCameraChange(index, 'name', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-600 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    IP Address
                  </label>
                  <input
                    type="text"
                    value={camera.ip_address}
                    onChange={(e) =>
                      handleCameraChange(index, 'ip_address', e.target.value)
                    }
                    placeholder="192.168.1.100"
                    className="w-full px-3 py-2 bg-gray-600 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recording Settings */}
      <section className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Recording Settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Output Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={recordingConfig.output_dir}
                onChange={(e) =>
                  setRecordingConfig({ ...recordingConfig, output_dir: e.target.value })
                }
                className="flex-1 px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={handleSelectOutputDir}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded transition"
              >
                Browse
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Frame Rate (fps)</label>
            <input
              type="number"
              value={recordingConfig.frame_rate}
              onChange={(e) =>
                setRecordingConfig({
                  ...recordingConfig,
                  frame_rate: parseInt(e.target.value) || 120,
                })
              }
              min={1}
              max={165}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Max Duration (seconds)
            </label>
            <input
              type="number"
              value={recordingConfig.max_duration_seconds}
              onChange={(e) =>
                setRecordingConfig({
                  ...recordingConfig,
                  max_duration_seconds: parseInt(e.target.value) || 300,
                })
              }
              min={1}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Camera Image Settings — per camera */}
      <section className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Camera Image Settings</h2>

        {enabledCameras.length === 0 ? (
          <p className="text-gray-500 text-sm">No cameras enabled.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {enabledCameras.map((cam, i) => {
              const s = getSettings(cam.id);
              const isActive = applyingCam === cam.id;
              return (
                <div key={cam.id} className="p-4 bg-gray-700 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{cam.name || `Camera ${i + 1}`}</h3>
                    {isActive && (
                      <span className="text-xs text-blue-400 animate-pulse">Applying...</span>
                    )}
                  </div>

                  {/* Preview */}
                  <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center mb-4">
                    {previews[cam.id] ? (
                      <img
                        src={previews[cam.id]}
                        alt={`${cam.name} preview`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-gray-600 text-sm">No preview</span>
                    )}
                  </div>

                  {/* Sliders */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        Exposure ({s.exposure_time} μs)
                      </label>
                      <input
                        type="range"
                        min={100}
                        max={30000}
                        step={100}
                        value={s.exposure_time}
                        onChange={(e) =>
                          updateCamSetting(cam.id, { exposure_time: parseInt(e.target.value) })
                        }
                        className="w-full accent-blue-500"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>100</span>
                        <span>30,000</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        Gain ({s.gain})
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={36}
                        step={1}
                        value={s.gain}
                        onChange={(e) =>
                          updateCamSetting(cam.id, { gain: parseInt(e.target.value) })
                        }
                        className="w-full accent-blue-500"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0</span>
                        <span>36</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        Gamma ({s.gamma.toFixed(2)})
                      </label>
                      <input
                        type="range"
                        min={25}
                        max={400}
                        step={5}
                        value={Math.round(s.gamma * 100)}
                        onChange={(e) =>
                          updateCamSetting(cam.id, { gamma: parseInt(e.target.value) / 100 })
                        }
                        className="w-full accent-blue-500"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0.25</span>
                        <span>4.00</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mt-3">
                    Settings apply live and auto-save as you drag.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Arduino Settings */}
      <section className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Arduino</h2>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                arduinoStatus.connected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span>
              {arduinoStatus.connected
                ? `Connected: ${arduinoStatus.port}`
                : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-400">
          Arduino is auto-detected when you click Connect.
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
