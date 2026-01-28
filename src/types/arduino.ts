/**
 * Arduino type definitions
 */

export type ArduinoState = 'idle' | 'armed' | 'recording' | 'stopping' | 'disconnected';

export interface ArduinoStatus {
  connected: boolean;
  port: string;
  state: ArduinoState;
  frame_count: number;
  fps: number;
  cameras: number;
}

export interface ArduinoConfig {
  port: string | 'auto';
  baud_rate: number;
}

export const DEFAULT_ARDUINO_CONFIG: ArduinoConfig = {
  port: 'auto',
  baud_rate: 115200,
};
