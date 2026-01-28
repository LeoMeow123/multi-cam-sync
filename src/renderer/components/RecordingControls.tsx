/**
 * Recording Controls Component
 *
 * Start/Stop recording, arm/disarm buttons, and status display.
 */

import React from 'react';
import type { RecordingState } from '../../types/recording';

interface RecordingControlsProps {
  state: RecordingState;
  arduinoConnected: boolean;
  camerasConnected: boolean;
  frameCount: number;
  elapsedSeconds: number;
  onArm: () => void;
  onDisarm: () => void;
  onStart: () => void;
  onStop: () => void;
}

const RecordingControls: React.FC<RecordingControlsProps> = ({
  state,
  arduinoConnected,
  camerasConnected,
  frameCount,
  elapsedSeconds,
  onArm,
  onDisarm,
  onStart,
  onStop,
}) => {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const canArm = arduinoConnected && camerasConnected && state === 'idle';
  const canStart = state === 'armed';
  const canStop = state === 'recording';

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">Recording</h3>

      {/* Status indicator */}
      <div className="mb-4 p-3 rounded-lg bg-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400">Status:</span>
          <span
            className={`font-semibold ${
              state === 'recording'
                ? 'text-red-500'
                : state === 'armed'
                ? 'text-yellow-500'
                : 'text-gray-400'
            }`}
          >
            {state.toUpperCase()}
          </span>
        </div>

        {state === 'recording' && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Time:</span>
              <span className="font-mono text-xl">{formatTime(elapsedSeconds)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Frames:</span>
              <span className="font-mono">{frameCount.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

      {/* Control buttons */}
      <div className="space-y-3">
        {state === 'idle' && (
          <button
            onClick={onArm}
            disabled={!canArm}
            className={`w-full py-3 rounded-lg font-semibold transition ${
              canArm
                ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            🎯 Arm System
          </button>
        )}

        {state === 'armed' && (
          <>
            <button
              onClick={onStart}
              className="w-full py-4 rounded-lg font-bold text-xl bg-green-600 hover:bg-green-700 text-white transition animate-pulse"
            >
              ● Start Recording
            </button>
            <button
              onClick={onDisarm}
              className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition"
            >
              Disarm
            </button>
          </>
        )}

        {state === 'recording' && (
          <button
            onClick={onStop}
            className="w-full py-4 rounded-lg font-bold text-xl bg-red-600 hover:bg-red-700 text-white transition"
          >
            ■ Stop Recording
          </button>
        )}

        {state === 'stopping' && (
          <button
            disabled
            className="w-full py-4 rounded-lg font-bold text-xl bg-gray-700 text-gray-400 cursor-not-allowed"
          >
            Stopping...
          </button>
        )}
      </div>

      {/* Warnings */}
      {!arduinoConnected && (
        <div className="mt-4 p-2 bg-red-900/50 border border-red-700 rounded text-sm text-red-300">
          ⚠️ Arduino not connected
        </div>
      )}

      {!camerasConnected && (
        <div className="mt-2 p-2 bg-red-900/50 border border-red-700 rounded text-sm text-red-300">
          ⚠️ No cameras connected
        </div>
      )}

      {/* Help text */}
      <div className="mt-4 text-xs text-gray-500">
        {state === 'idle' && 'Arm the system to enable recording'}
        {state === 'armed' && 'Press Start or use physical button'}
        {state === 'recording' && 'Recording in progress...'}
      </div>
    </div>
  );
};

export default RecordingControls;
