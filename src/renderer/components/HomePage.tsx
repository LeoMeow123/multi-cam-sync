/**
 * Home Page Component
 *
 * System health dashboard showing hardware status, readiness checklist,
 * and quick actions for connecting/scanning.
 */

import React from 'react';
import type { CameraConfig } from '../../types/camera';
import type { ArduinoStatus } from '../../types/arduino';
import type { RecordingConfig } from '../../types/recording';

interface HomePageProps {
  arduinoStatus: ArduinoStatus;
  cameras: CameraConfig[];
  cameraStatus: Record<string, any>;
  recordingConfig: RecordingConfig;
  isConnecting: boolean;
  onConnect: () => void;
  onDetectCameras: () => void;
  onNavigate: (tab: string) => void;
}

type CardStatus = 'connected' | 'missing' | 'disabled' | 'scanning';

interface SystemCardProps {
  title: string;
  status: CardStatus;
  statusLabel: string;
  detail?: string;
  extra?: string;
}

const statusConfig: Record<CardStatus, { dot: string; textColor: string }> = {
  connected: { dot: 'bg-green-500', textColor: 'text-green-400' },
  missing: { dot: 'bg-red-500', textColor: 'text-red-400' },
  disabled: { dot: 'bg-gray-500', textColor: 'text-gray-400' },
  scanning: { dot: 'bg-yellow-500 animate-pulse', textColor: 'text-yellow-400' },
};

const SystemCard: React.FC<SystemCardProps> = ({ title, status, statusLabel, detail, extra }) => {
  const { dot, textColor } = statusConfig[status];

  return (
    <div className="bg-gray-700 rounded-lg p-4 flex flex-col gap-1">
      <div className="text-sm font-semibold text-gray-300 uppercase tracking-wide">{title}</div>
      <div className="flex items-center gap-2 mt-1">
        <div className={`w-2.5 h-2.5 rounded-full ${dot}`} />
        <span className={`text-sm font-medium ${textColor}`}>{statusLabel}</span>
      </div>
      {detail && <div className="text-xs text-gray-400 mt-1">{detail}</div>}
      {extra && <div className="text-xs text-gray-500">{extra}</div>}
    </div>
  );
};

const HomePage: React.FC<HomePageProps> = ({
  arduinoStatus,
  cameras,
  cameraStatus,
  recordingConfig,
  isConnecting,
  onConnect,
  onDetectCameras,
  onNavigate,
}) => {
  // Derive Arduino card props
  const arduinoCardStatus: CardStatus = arduinoStatus.connected ? 'connected' : 'missing';
  const arduinoLabel = arduinoStatus.connected ? 'Connected' : 'Disconnected';
  const arduinoDetail = arduinoStatus.connected ? arduinoStatus.port : undefined;
  const arduinoExtra = arduinoStatus.connected ? `FPS: ${arduinoStatus.fps}` : undefined;

  // Derive camera card props
  const getCameraCard = (cam: CameraConfig) => {
    if (!cam.enabled) {
      return { status: 'disabled' as CardStatus, label: 'Disabled', detail: undefined };
    }
    const camStat = cameraStatus[cam.id];
    if (camStat?.connected) {
      return { status: 'connected' as CardStatus, label: 'Connected', detail: cam.ip_address };
    }
    return {
      status: 'missing' as CardStatus,
      label: 'Not connected',
      detail: cam.ip_address || 'No IP set',
    };
  };

  // Readiness checks
  const checks = [
    { label: 'Arduino connected', passed: arduinoStatus.connected },
    ...cameras
      .filter((c) => c.enabled)
      .map((c) => ({
        label: `${c.name} connected`,
        passed: !!cameraStatus[c.id]?.connected,
      })),
    {
      label: 'Output directory set',
      passed: !!recordingConfig.output_dir && recordingConfig.output_dir !== '~/recordings',
    },
  ];

  const allReady = checks.every((c) => c.passed);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* System Overview */}
      <section className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">System Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <SystemCard
            title="Arduino"
            status={arduinoCardStatus}
            statusLabel={arduinoLabel}
            detail={arduinoDetail}
            extra={arduinoExtra}
          />
          {cameras.map((cam) => {
            const card = getCameraCard(cam);
            return (
              <SystemCard
                key={cam.id}
                title={cam.name}
                status={card.status}
                statusLabel={card.label}
                detail={card.detail}
              />
            );
          })}
        </div>
      </section>

      {/* Quick Actions */}
      <section className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onDetectCameras}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
          >
            Scan for Cameras
          </button>
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg transition"
          >
            {isConnecting ? 'Connecting...' : 'Connect All'}
          </button>
          <button
            onClick={() => onNavigate('settings')}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
          >
            Go to Settings
          </button>
        </div>
      </section>

      {/* Readiness Checklist */}
      <section className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Readiness Checklist</h2>
        <div className="space-y-2">
          {checks.map((check, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  check.passed ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className={check.passed ? 'text-gray-300' : 'text-gray-400'}>
                {check.label}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-gray-700">
          {allReady ? (
            <span className="text-green-400 font-medium">
              System ready to record
            </span>
          ) : (
            <span className="text-yellow-400 font-medium">
              System NOT ready to record
            </span>
          )}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
