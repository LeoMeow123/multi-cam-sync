/**
 * Recording type definitions
 */

import type { CameraConfig, CameraSettings } from './camera';
import type { ArduinoConfig } from './arduino';

export type RecordingState = 'idle' | 'armed' | 'recording' | 'stopping';

export interface RecordingConfig {
  output_dir: string;
  frame_rate: number;
  max_duration_seconds: number;
}

export interface SessionMetadata {
  session_id: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  frame_rate: number;
  cameras: {
    id: string;
    ip: string;
    frames: number;
  }[];
  sync_status: 'OK' | 'MISMATCH';
  total_frames: number;
  settings: CameraSettings;
}

export interface RecordingStatus {
  state: RecordingState;
  session_id?: string;
  elapsed_seconds: number;
  frame_counts: Record<string, number>;
  errors: string[];
}

export interface AppConfig {
  cameras: CameraConfig[];
  recording: RecordingConfig;
  camera_settings: CameraSettings;
  arduino: ArduinoConfig;
}

export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  output_dir: '~/recordings',
  frame_rate: 120,
  max_duration_seconds: 300,
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  cameras: [
    { id: 'cam1', name: 'Camera 1', ip_address: '', enabled: true },
    { id: 'cam2', name: 'Camera 2', ip_address: '', enabled: true },
    { id: 'cam3', name: 'Camera 3', ip_address: '', enabled: false },
    { id: 'cam4', name: 'Camera 4', ip_address: '', enabled: false },
  ],
  recording: DEFAULT_RECORDING_CONFIG,
  camera_settings: {
    exposure_time: 8000,
    gain: 0,
    gamma: 1.0,
    trigger_mode: 'hardware',
  },
  arduino: {
    port: 'auto',
    baud_rate: 115200,
  },
};
