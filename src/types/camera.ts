/**
 * Camera type definitions
 */

export interface CameraSettings {
  exposure_time: number; // microseconds
  gain: number;
  gamma: number;
  trigger_mode: 'software' | 'hardware';
}

export interface CameraInfo {
  ip_address: string;
  model_name: string;
  serial_number: string;
  mac_address: string;
  user_defined_name: string;
  friendly_name: string;
  is_mock: boolean;
}

export interface CameraConfig {
  id: string;
  name: string;
  ip_address: string;
  enabled: boolean;
}

export interface CameraStatus {
  camera_id: string;
  connected: boolean;
  capturing: boolean;
  frame_count: number;
  trigger_mode: 'software' | 'hardware';
  last_error?: string;
}

export interface FrameInfo {
  camera_id: string;
  frame_number: number;
  file_path: string;
  timestamp: number;
  width: number;
  height: number;
}

export interface CaptureResult {
  camera_id: string;
  success: boolean;
  frame_count: number;
  output_dir: string;
  error?: string;
}

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  exposure_time: 8000,
  gain: 0,
  gamma: 1.0,
  trigger_mode: 'hardware',
};
