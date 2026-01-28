/**
 * Status Dashboard Component
 *
 * Shows system status: Arduino, cameras, sync status.
 */

import React from 'react';
import type { ArduinoStatus } from '../../types/arduino';
import type { RecordingStatus } from '../../types/recording';

interface StatusDashboardProps {
  arduinoStatus: ArduinoStatus;
  recordingStatus: RecordingStatus;
  cameraCount: number;
}

const StatusDashboard: React.FC<StatusDashboardProps> = ({
  arduinoStatus,
  recordingStatus,
  cameraCount,
}) => {
  const frameCounts = Object.values(recordingStatus.frame_counts);
  const minFrames = frameCounts.length > 0 ? Math.min(...frameCounts) : 0;
  const maxFrames = frameCounts.length > 0 ? Math.max(...frameCounts) : 0;
  const isSynced = minFrames === maxFrames;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">System Status</h3>

      <div className="space-y-3">
        {/* Arduino status */}
        <StatusItem
          label="Arduino"
          value={arduinoStatus.connected ? arduinoStatus.port : 'Disconnected'}
          status={arduinoStatus.connected ? 'ok' : 'error'}
        />

        {/* FPS */}
        <StatusItem
          label="Frame Rate"
          value={`${arduinoStatus.fps} fps`}
          status="info"
        />

        {/* Cameras */}
        <StatusItem
          label="Cameras"
          value={`${cameraCount} configured`}
          status={cameraCount > 0 ? 'ok' : 'warning'}
        />

        {/* Sync status (during/after recording) */}
        {frameCounts.length > 0 && (
          <StatusItem
            label="Sync"
            value={isSynced ? 'OK' : `Mismatch (${minFrames}-${maxFrames})`}
            status={isSynced ? 'ok' : 'error'}
          />
        )}

        {/* Frame counts per camera */}
        {Object.entries(recordingStatus.frame_counts).map(([camId, count]) => (
          <div key={camId} className="flex justify-between text-sm">
            <span className="text-gray-400">{camId}:</span>
            <span className="font-mono">{count.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Errors */}
      {recordingStatus.errors.length > 0 && (
        <div className="mt-4 p-2 bg-red-900/50 border border-red-700 rounded">
          <div className="text-sm font-semibold text-red-400 mb-1">Errors:</div>
          {recordingStatus.errors.map((error, i) => (
            <div key={i} className="text-xs text-red-300">
              {error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface StatusItemProps {
  label: string;
  value: string;
  status: 'ok' | 'warning' | 'error' | 'info';
}

const StatusItem: React.FC<StatusItemProps> = ({ label, value, status }) => {
  const statusColors = {
    ok: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
        <span className="text-gray-400">{label}</span>
      </div>
      <span className="text-sm">{value}</span>
    </div>
  );
};

export default StatusDashboard;
