/**
 * Camera Grid Component
 *
 * Displays live preview from multiple cameras in a grid layout.
 */

import React from 'react';
import type { CameraConfig } from '../../types/camera';

interface CameraGridProps {
  cameras: CameraConfig[];
  previews: Record<string, string>;
  status: Record<string, any>;
  frameCounts: Record<string, number>;
}

const CameraGrid: React.FC<CameraGridProps> = ({
  cameras,
  previews,
  status,
  frameCounts,
}) => {
  // Determine grid columns based on camera count
  const getGridClass = () => {
    switch (cameras.length) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-2';
      case 3:
        return 'grid-cols-2 lg:grid-cols-3';
      default:
        return 'grid-cols-2';
    }
  };

  if (cameras.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center">
        <div className="text-gray-400 text-lg">No cameras configured</div>
        <div className="text-gray-500 mt-2">
          Go to Settings to add cameras
        </div>
      </div>
    );
  }

  return (
    <div className={`grid ${getGridClass()} gap-4`}>
      {cameras.map((camera) => (
        <CameraView
          key={camera.id}
          camera={camera}
          preview={previews[camera.id]}
          isConnected={status[camera.id]?.connected}
          frameCount={frameCounts[camera.id] || 0}
        />
      ))}
    </div>
  );
};

interface CameraViewProps {
  camera: CameraConfig;
  preview?: string;
  isConnected?: boolean;
  frameCount: number;
}

const CameraView: React.FC<CameraViewProps> = ({
  camera,
  preview,
  isConnected,
  frameCount,
}) => {
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Camera header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-700">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="font-medium">{camera.name}</span>
        </div>
        <span className="text-sm text-gray-400">{camera.ip_address || 'No IP'}</span>
      </div>

      {/* Preview area */}
      <div className="relative aspect-video bg-black">
        {preview ? (
          <img
            src={preview}
            alt={camera.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-gray-500">
              {isConnected ? (
                <div className="animate-pulse">Loading preview...</div>
              ) : (
                <div>
                  <svg
                    className="w-16 h-16 mx-auto mb-2 opacity-50"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  <div>Not connected</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Frame count overlay */}
        {frameCount > 0 && (
          <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-sm font-mono">
            Frame: {frameCount.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraGrid;
