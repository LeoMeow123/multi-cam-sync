/**
 * Recording Panel Component
 *
 * Simple, prominent recording interface with customizable session naming.
 */

import React, { useState, useEffect } from 'react';
import type { RecordingState } from '../../types/recording';

interface RecordingPanelProps {
  state: RecordingState;
  arduinoConnected: boolean;
  camerasConnected: boolean;
  elapsedSeconds: number;
  frameCounts: Record<string, number>;
  outputDir: string;
  onArm: () => void;
  onDisarm: () => void;
  onStart: (sessionName: string) => void;
  onStop: () => void;
}

// Default naming format with placeholders
const DEFAULT_FORMAT = '{date}_{time}_{name}';

const RecordingPanel: React.FC<RecordingPanelProps> = ({
  state,
  arduinoConnected,
  camerasConnected,
  elapsedSeconds,
  frameCounts,
  outputDir,
  onArm,
  onDisarm,
  onStart,
  onStop,
}) => {
  const [nameFormat, setNameFormat] = useState(DEFAULT_FORMAT);
  const [sessionName, setSessionName] = useState('');
  const [previewName, setPreviewName] = useState('');

  // Generate preview name from format
  useEffect(() => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10); // 2026-02-18
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '-'); // 14-30-25

    let preview = nameFormat
      .replace('{date}', date)
      .replace('{time}', time)
      .replace('{name}', sessionName || 'session');

    // Clean up any invalid filename characters
    preview = preview.replace(/[<>:"/\\|?*]/g, '_');

    setPreviewName(preview);
  }, [nameFormat, sessionName]);

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalFrames = Object.values(frameCounts).reduce((sum, count) => sum + count, 0);
  const canArm = arduinoConnected && camerasConnected && state === 'idle';
  const canRecord = state === 'armed';
  const isRecording = state === 'recording';

  const handleStartRecording = () => {
    onStart(previewName);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Recording</h2>

      {/* Session Naming */}
      {state === 'idle' && (
        <div className="space-y-4 mb-6">
          {/* Format template */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Naming Format
              <span className="ml-2 text-xs text-gray-500">
                Use: {'{date}'} {'{time}'} {'{name}'}
              </span>
            </label>
            <input
              type="text"
              value={nameFormat}
              onChange={(e) => setNameFormat(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none font-mono text-sm"
            />
          </div>

          {/* Session name input */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Session Name
            </label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g., mouse01_trial1"
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Preview */}
          <div className="p-3 bg-gray-900 rounded border border-gray-700">
            <div className="text-xs text-gray-500 mb-1">Folder will be created as:</div>
            <div className="font-mono text-sm text-blue-400 break-all">
              {outputDir}/{previewName}/
            </div>
          </div>
        </div>
      )}

      {/* Recording Status */}
      {(isRecording || state === 'stopping') && (
        <div className="mb-6 p-4 bg-gray-900 rounded-lg border-2 border-red-500">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="font-semibold text-red-400">RECORDING</span>
            </div>
            <div className="text-3xl font-mono font-bold">
              {formatTime(elapsedSeconds)}
            </div>
          </div>
          <div className="flex justify-between text-sm text-gray-400">
            <span>Total Frames: {totalFrames.toLocaleString()}</span>
            <span>
              {Object.entries(frameCounts).map(([cam, count]) => (
                <span key={cam} className="ml-3">
                  {cam}: {count}
                </span>
              ))}
            </span>
          </div>
        </div>
      )}

      {/* Ready Status */}
      {state === 'armed' && (
        <div className="mb-6 p-4 bg-yellow-900/30 rounded-lg border-2 border-yellow-500">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
            <span className="font-semibold text-yellow-400">READY - Press Start to Record</span>
          </div>
          <div className="mt-2 text-sm text-gray-400">
            Session: <span className="font-mono text-yellow-300">{previewName}</span>
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="space-y-3">
        {state === 'idle' && (
          <button
            onClick={onArm}
            disabled={!canArm}
            className={`w-full py-4 rounded-lg font-bold text-lg transition ${
              canArm
                ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            Prepare to Record
          </button>
        )}

        {state === 'armed' && (
          <>
            <button
              onClick={handleStartRecording}
              className="w-full py-6 rounded-lg font-bold text-2xl bg-green-600 hover:bg-green-700 text-white transition animate-pulse"
            >
              START RECORDING
            </button>
            <button
              onClick={onDisarm}
              className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition"
            >
              Cancel
            </button>
          </>
        )}

        {state === 'recording' && (
          <button
            onClick={onStop}
            className="w-full py-6 rounded-lg font-bold text-2xl bg-red-600 hover:bg-red-700 text-white transition"
          >
            STOP RECORDING
          </button>
        )}

        {state === 'stopping' && (
          <button
            disabled
            className="w-full py-6 rounded-lg font-bold text-2xl bg-gray-700 text-gray-400 cursor-not-allowed"
          >
            Saving...
          </button>
        )}
      </div>

      {/* Warnings */}
      {state === 'idle' && (
        <div className="mt-4 space-y-2">
          {!arduinoConnected && (
            <div className="p-2 bg-red-900/50 border border-red-700 rounded text-sm text-red-300">
              Arduino not connected
            </div>
          )}
          {!camerasConnected && (
            <div className="p-2 bg-red-900/50 border border-red-700 rounded text-sm text-red-300">
              No cameras connected
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RecordingPanel;
