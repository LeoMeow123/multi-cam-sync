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

/**
 * How a camera's frames line up with the Arduino's pulses (python/sync_check.py):
 *   exact        every pulse arrived, so frame i is pulse i
 *   recoverable  frames lost in transit; the frames CSV gives each frame's pulse
 *   unproven     the camera ignored pulses, so later frames may be shifted
 *   extra        more frames than pulses
 *   no_block_ids the camera reported no block IDs
 */
export type SyncVerdict = 'exact' | 'recoverable' | 'unproven' | 'extra' | 'no_block_ids';

export interface CameraCaptureResult {
  frame_count: number;
  verdict: SyncVerdict;
  verdict_reason: string;
  /** Per-frame block ID and timestamps: <camera_id>_frames.csv */
  frames_csv: string;
  /** Block-ID summary: frames, last_block_id, missing, gap_ranges, failed_grabs */
  block_ids: Record<string, unknown>;
}

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  exposure_time: 8000,
  gain: 0,
  gamma: 1.0,
  trigger_mode: 'hardware',
};
