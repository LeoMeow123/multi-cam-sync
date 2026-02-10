/**
 * Arduino Manager
 *
 * Handles serial communication with Arduino for camera triggering.
 */

import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import type { ArduinoState, ArduinoStatus, ArduinoConfig } from '../types/arduino';

// Timeout for Arduino commands
const COMMAND_TIMEOUT_MS = 5000;

/**
 * Events emitted by ArduinoManager:
 *   - 'ready': Arduino initialized
 *   - 'armed': Ready for recording
 *   - 'recording': Recording started
 *   - 'stopped': (frameCount: number) Recording stopped
 *   - 'killed': Kill switch activated
 *   - 'button': (button: string) Button pressed
 *   - 'frame': (frameNumber: number) Frame triggered
 *   - 'error': (error: string) Error occurred
 *   - 'disconnected': Serial connection lost
 */
export class ArduinoManager extends EventEmitter {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private config: ArduinoConfig;
  private state: ArduinoState = 'disconnected';
  private frameCount = 0;
  private fps = 120;
  private activeCameras = 4;

  constructor(config: ArduinoConfig) {
    super();
    this.config = config;
  }

  /**
   * List available serial ports
   */
  static async listPorts(): Promise<string[]> {
    const ports = await SerialPort.list();
    return ports.map((p) => p.path);
  }

  /**
   * Auto-detect Arduino port
   */
  static async detectArduino(): Promise<string | null> {
    const ports = await SerialPort.list();

    for (const port of ports) {
      // Common Arduino identifiers
      const isArduino =
        port.manufacturer?.toLowerCase().includes('arduino') ||
        port.vendorId === '2341' || // Arduino vendor ID
        port.vendorId === '1A86' || // CH340 (Arduino clone)
        port.path.includes('usbmodem') ||
        port.path.includes('ttyACM') ||
        port.path.includes('ttyUSB');

      if (isArduino) {
        return port.path;
      }
    }

    return null;
  }

  /**
   * Connect to Arduino
   */
  async connect(portPath?: string): Promise<boolean> {
    try {
      // Determine port
      let path: string | undefined = portPath;
      if (!path || this.config.port === 'auto') {
        path = (await ArduinoManager.detectArduino()) ?? undefined;
        if (!path) {
          this.emit('error', 'No Arduino detected');
          return false;
        }
      }

      // Open serial port
      this.port = new SerialPort({
        path,
        baudRate: this.config.baud_rate,
      });

      // Set up line parser
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

      // Handle incoming data
      this.parser.on('data', (line: string) => {
        this.handleMessage(line.trim());
      });

      // Handle errors
      this.port.on('error', (err) => {
        this.emit('error', err.message);
      });

      // Handle close
      this.port.on('close', () => {
        this.state = 'disconnected';
        this.emit('disconnected');
      });

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        this.port!.on('open', () => resolve());
        this.port!.on('error', (err) => reject(err));
      });

      this.state = 'idle';
      console.log(`[Arduino] Connected to ${path}`);
      return true;
    } catch (error) {
      this.emit('error', `Connection failed: ${error}`);
      return false;
    }
  }

  /**
   * Disconnect from Arduino
   */
  disconnect(): void {
    if (this.port) {
      this.port.close();
      this.port = null;
      this.parser = null;
      this.state = 'disconnected';
    }
  }

  /**
   * Handle incoming message from Arduino
   */
  private handleMessage(line: string): void {
    console.log(`[Arduino] Received: ${line}`);

    if (line === 'READY') {
      this.state = 'idle';
      this.emit('ready');
    } else if (line === 'ARMED') {
      this.state = 'armed';
      this.emit('armed');
    } else if (line === 'DISARMED') {
      this.state = 'idle';
      this.emit('disarmed');
    } else if (line === 'RECORDING') {
      this.state = 'recording';
      this.frameCount = 0;
      this.emit('recording');
    } else if (line.startsWith('STOPPED:')) {
      this.frameCount = parseInt(line.substring(8), 10);
      this.state = 'idle';
      this.emit('stopped', this.frameCount);
    } else if (line === 'KILLED') {
      this.state = 'stopping';
      this.emit('killed');
    } else if (line.startsWith('BUTTON:')) {
      const button = line.substring(7);
      this.emit('button', button);
    } else if (line.startsWith('FRAME:')) {
      this.frameCount = parseInt(line.substring(6), 10);
      this.emit('frame', this.frameCount);
    } else if (line.startsWith('FPS_SET:')) {
      this.fps = parseInt(line.substring(8), 10);
    } else if (line.startsWith('CAMERAS_SET:')) {
      this.activeCameras = parseInt(line.substring(12), 10);
    } else if (line.startsWith('STATUS:')) {
      // Parse status: STATE:FRAMES:FPS:CAMERAS
      const parts = line.substring(7).split(':');
      if (parts.length >= 4) {
        this.state = parts[0].toLowerCase() as ArduinoState;
        this.frameCount = parseInt(parts[1], 10);
        this.fps = parseInt(parts[2], 10);
        this.activeCameras = parseInt(parts[3], 10);
      }
    } else if (line.startsWith('ERROR:')) {
      this.emit('error', line.substring(6));
    } else if (line === 'PONG') {
      // Ping response, handled by sendCommand
    } else if (line.startsWith('TRIGGERED:')) {
      this.frameCount = parseInt(line.substring(10), 10);
      this.emit('frame', this.frameCount);
    }
  }

  /**
   * Send command to Arduino
   */
  private sendCommand(command: string): void {
    if (!this.port) {
      throw new Error('Not connected');
    }
    console.log(`[Arduino] Sending: ${command}`);
    this.port.write(`${command}\n`);
  }

  /**
   * Send command and wait for response
   */
  async sendCommandAsync(
    command: string,
    expectedResponse?: string
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      if (!this.parser) {
        reject(new Error('Not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        this.parser?.removeListener('data', handler);
        reject(new Error('Command timeout'));
      }, COMMAND_TIMEOUT_MS);

      const handler = (line: string) => {
        const trimmed = line.trim();
        if (!expectedResponse || trimmed.startsWith(expectedResponse)) {
          clearTimeout(timeout);
          this.parser?.removeListener('data', handler);
          resolve(trimmed);
        }
      };

      this.parser.on('data', handler);
      this.sendCommand(command);
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Arm the system for recording (enables start button)
   */
  async arm(): Promise<void> {
    this.sendCommand('ARM');
  }

  /**
   * Disarm the system
   */
  async disarm(): Promise<void> {
    this.sendCommand('DISARM');
  }

  /**
   * Start recording
   */
  startRecording(): void {
    this.sendCommand('START');
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    this.sendCommand('STOP');
  }

  /**
   * Trigger a single frame (for testing)
   */
  triggerOnce(): void {
    this.sendCommand('TRIGGER');
  }

  /**
   * Set frame rate
   */
  setFPS(fps: number): void {
    this.sendCommand(`FPS:${fps}`);
    this.fps = fps;
  }

  /**
   * Set number of active cameras
   */
  setCameras(count: number): void {
    this.sendCommand(`CAMERAS:${count}`);
    this.activeCameras = count;
  }

  /**
   * Request status update
   */
  requestStatus(): void {
    this.sendCommand('STATUS');
  }

  /**
   * Ping Arduino
   */
  async ping(): Promise<boolean> {
    try {
      await this.sendCommandAsync('PING', 'PONG');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current status
   */
  getStatus(): ArduinoStatus {
    return {
      connected: this.port !== null && this.state !== 'disconnected',
      port: this.port?.path || '',
      state: this.state,
      frame_count: this.frameCount,
      fps: this.fps,
      cameras: this.activeCameras,
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.port !== null && this.state !== 'disconnected';
  }

  /**
   * Get current state
   */
  getState(): ArduinoState {
    return this.state;
  }

  /**
   * Get frame count
   */
  getFrameCount(): number {
    return this.frameCount;
  }
}
