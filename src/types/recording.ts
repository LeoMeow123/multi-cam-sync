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

/** What recording:start returns. */
export interface StartResult {
  success: boolean;
  error?: string;
}

/** What recording:stop returns, and the summary of sync_report.json. */
export interface StopResult {
  frameCounts: Record<string, number>;
  /** True only when every camera's verdict is exact and no pulse was late. */
  synced: boolean;
  /** Pulses the Arduino fired, or null when it did not report them. */
  triggerCount: number | null;
  /** One line per problem, for the operator. */
  warnings: string[];
  /** Path of sync_report.json, or '' when none was written. */
  reportPath: string;
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
  per_camera_settings: Record<string, CameraSettings>;
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
  per_camera_settings: {},
  arduino: {
    port: 'auto',
    baud_rate: 115200,
  },
};
