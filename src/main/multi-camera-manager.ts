/**
 * Multi-Camera Manager
 *
 * Coordinates multiple camera processes for synchronized capture.
 */

import { EventEmitter } from 'events';
import { PythonProcess } from './python-process';
import type { CameraConfig, CameraStatus, CameraInfo, FrameInfo } from '../types/camera';

/**
 * Events:
 *   - 'camera-connected': (cameraId: string)
 *   - 'camera-disconnected': (cameraId: string)
 *   - 'camera-error': (cameraId: string, error: string)
 *   - 'frame-saved': (frameInfo: FrameInfo)
 *   - 'capture-started': (cameraId: string)
 *   - 'capture-stopped': (cameraId: string, frameCount: number)
 */
export class MultiCameraManager extends EventEmitter {
  private cameras: Map<string, PythonProcess> = new Map();
  private cameraConfigs: CameraConfig[] = [];
  private frameCountS: Map<string, number> = new Map();

  constructor() {
    super();
  }

  /**
   * Initialize camera processes for configured cameras
   */
  async initialize(configs: CameraConfig[]): Promise<void> {
    this.cameraConfigs = configs.filter((c) => c.enabled);

    for (const config of this.cameraConfigs) {
      await this.initializeCamera(config);
    }
  }

  /**
   * Initialize a single camera process
   */
  private async initializeCamera(config: CameraConfig): Promise<void> {
    const pythonPath = PythonProcess.getPythonPath();
    const scriptPath = PythonProcess.getScriptPath();

    const process = new PythonProcess(pythonPath, scriptPath, ['--ipc']);

    // Set up event handlers
    process.on('status', (msg) => {
      console.log(`[${config.id}] ${msg}`);
    });

    process.on('error', (error) => {
      console.error(`[${config.id}] Error: ${error}`);
      this.emit('camera-error', config.id, error);
    });

    process.on('frame_saved', (frameInfo: FrameInfo) => {
      this.frameCountS.set(config.id, frameInfo.frame_number);
      this.emit('frame-saved', frameInfo);
    });

    process.on('exit', (code) => {
      console.log(`[${config.id}] Process exited: ${code}`);
      this.cameras.delete(config.id);
      this.emit('camera-disconnected', config.id);
    });

    // Start process
    await process.start();

    // Initialize camera
    await process.sendCommand({
      command: 'init',
      camera_id: config.id,
      camera_ip: config.ip_address,
    });

    this.cameras.set(config.id, process);
    this.frameCountS.set(config.id, 0);
  }

  /**
   * Detect all cameras on network
   */
  async detectCameras(): Promise<CameraInfo[]> {
    // Use first available process or create temporary one
    let process = this.cameras.values().next().value;
    let tempProcess = false;

    if (!process) {
      const pythonPath = PythonProcess.getPythonPath();
      const scriptPath = PythonProcess.getScriptPath();
      process = new PythonProcess(pythonPath, scriptPath, ['--ipc']);
      await process.start();
      tempProcess = true;
    }

    try {
      const result = await process.sendCommand({ command: 'detect_cameras' });
      return result.cameras || [];
    } finally {
      if (tempProcess) {
        process.stop();
      }
    }
  }

  /**
   * Connect all cameras
   */
  async connectAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    const promises = Array.from(this.cameras.entries()).map(async ([id, process]) => {
      const config = this.cameraConfigs.find((c) => c.id === id);
      if (!config) return;

      try {
        const result = await process.sendCommand({
          command: 'connect',
          camera_ip: config.ip_address,
        });
        results.set(id, result.success);

        if (result.success) {
          this.emit('camera-connected', id);
        }
      } catch (error) {
        results.set(id, false);
        this.emit('camera-error', id, String(error));
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Disconnect all cameras
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.cameras.entries()).map(async ([id, process]) => {
      try {
        await process.sendCommand({ command: 'disconnect' });
        this.emit('camera-disconnected', id);
      } catch (error) {
        console.error(`[${id}] Disconnect error: ${error}`);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Configure all cameras with same settings
   */
  async configureAll(settings: object): Promise<void> {
    const promises = Array.from(this.cameras.values()).map((process) =>
      process.sendCommand({ command: 'configure', settings })
    );

    await Promise.all(promises);
  }

  /**
   * Start capture on all cameras
   */
  async startCapture(sessionDir: string): Promise<void> {
    // Reset frame counts
    this.frameCountS.forEach((_, id) => this.frameCountS.set(id, 0));

    const promises = Array.from(this.cameras.entries()).map(async ([id, process]) => {
      const outputDir = `${sessionDir}/${id}`;

      try {
        await process.sendCommand({
          command: 'start_capture',
          output_dir: outputDir,
        });
        this.emit('capture-started', id);
      } catch (error) {
        this.emit('camera-error', id, String(error));
      }
    });

    await Promise.all(promises);
  }

  /**
   * Stop capture on all cameras
   */
  async stopCapture(): Promise<Map<string, number>> {
    const results = new Map<string, number>();

    const promises = Array.from(this.cameras.entries()).map(async ([id, process]) => {
      try {
        const result = await process.sendCommand({ command: 'stop_capture' });
        const frameCount = result.frame_count || 0;
        results.set(id, frameCount);
        this.emit('capture-stopped', id, frameCount);
      } catch (error) {
        console.error(`[${id}] Stop capture error: ${error}`);
        results.set(id, this.frameCountS.get(id) || 0);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Get preview frame from a camera
   */
  async getPreview(cameraId: string): Promise<string | null> {
    const process = this.cameras.get(cameraId);
    if (!process) return null;

    return new Promise((resolve) => {
      const handler = (dataUri: string) => {
        process.removeListener('preview', handler);
        resolve(dataUri);
      };

      process.once('preview', handler);
      process.sendCommand({ command: 'get_preview' }).catch(() => resolve(null));

      // Timeout
      setTimeout(() => {
        process.removeListener('preview', handler);
        resolve(null);
      }, 5000);
    });
  }

  /**
   * Get status of all cameras
   */
  async getStatus(): Promise<Map<string, CameraStatus>> {
    const results = new Map<string, CameraStatus>();

    const promises = Array.from(this.cameras.entries()).map(async ([id, process]) => {
      try {
        const result = await process.sendCommand({ command: 'status' });
        results.set(id, {
          camera_id: id,
          connected: result.connected,
          capturing: result.capturing,
          frame_count: result.frame_count,
          trigger_mode: result.trigger_mode,
        });
      } catch {
        results.set(id, {
          camera_id: id,
          connected: false,
          capturing: false,
          frame_count: 0,
          trigger_mode: 'software',
        });
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Get frame counts for all cameras
   */
  getFrameCounts(): Map<string, number> {
    return new Map(this.frameCountS);
  }

  /**
   * Verify sync - check if all cameras have same frame count
   */
  verifySyncStatus(): { synced: boolean; counts: Record<string, number>; minFrames: number } {
    const counts: Record<string, number> = {};
    let minFrames = Infinity;
    let maxFrames = 0;

    this.frameCountS.forEach((count, id) => {
      counts[id] = count;
      minFrames = Math.min(minFrames, count);
      maxFrames = Math.max(maxFrames, count);
    });

    return {
      synced: minFrames === maxFrames,
      counts,
      minFrames: minFrames === Infinity ? 0 : minFrames,
    };
  }

  /**
   * Shutdown all camera processes
   */
  shutdown(): void {
    this.cameras.forEach((process, id) => {
      console.log(`[${id}] Stopping process`);
      process.stop();
    });
    this.cameras.clear();
    this.frameCountS.clear();
  }

  /**
   * Get number of active cameras
   */
  getCameraCount(): number {
    return this.cameras.size;
  }

  /**
   * Get camera IDs
   */
  getCameraIds(): string[] {
    return Array.from(this.cameras.keys());
  }
}
