/**
 * Python Process Manager
 *
 * Base class for spawning and managing Python subprocesses that communicate
 * via stdin/stdout using a line-based protocol.
 */

import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';

const STARTUP_TIMEOUT_MS = 15000;
const COMMAND_TIMEOUT_MS = 30000;

/**
 * Events emitted by PythonProcess:
 *   - 'status': (message: string) - Status update
 *   - 'error': (error: string) - Error message
 *   - 'data': (data: any) - JSON data response
 *   - 'preview': (dataUri: string) - Preview frame
 *   - 'frame_saved': (frameInfo: object) - Frame saved notification
 *   - 'exit': (code: number | null) - Process exited
 */
export class PythonProcess extends EventEmitter {
  private process: ChildProcess | null = null;
  private pythonPath: string;
  private scriptPath: string;
  private scriptArgs: string[];
  private stdoutBuffer: string = '';

  constructor(pythonPath: string, scriptPath: string, scriptArgs: string[] = ['--ipc']) {
    super();
    this.pythonPath = pythonPath;
    this.scriptPath = scriptPath;
    this.scriptArgs = scriptArgs;
  }

  /**
   * Get Python executable path
   */
  static getPythonPath(): string {
    // Check for bundled Python first
    const bundledPaths = [
      path.join(process.resourcesPath || '', 'python', 'python'),
      path.join(process.resourcesPath || '', 'python', 'python.exe'),
    ];

    for (const p of bundledPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    // Fall back to system Python
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  /**
   * Get script path
   */
  static getScriptPath(): string {
    // Check for bundled script
    const bundledPath = path.join(process.resourcesPath || '', 'python', 'main.py');
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }

    // Development path
    return path.join(__dirname, '..', '..', 'python', 'main.py');
  }

  /**
   * Start the Python subprocess
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Process already started');
    }

    return new Promise((resolve, reject) => {
      try {
        // Set up ready handler before spawning
        const readyHandler = (message: string) => {
          if (message.includes('ready')) {
            this.removeListener('status', readyHandler);
            clearTimeout(timeoutId);
            resolve();
          }
        };
        this.on('status', readyHandler);

        // Timeout if not ready
        const timeoutId = setTimeout(() => {
          this.removeListener('status', readyHandler);
          reject(new Error('Python process startup timeout'));
        }, STARTUP_TIMEOUT_MS);

        // Spawn Python process
        console.log(`[Python] Starting: ${this.pythonPath} ${this.scriptPath} ${this.scriptArgs.join(' ')}`);

        this.process = spawn(this.pythonPath, [this.scriptPath, ...this.scriptArgs], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
          },
        });

        // Handle stdout
        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleStdout(data);
        });

        // Handle stderr
        this.process.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            console.error(`[Python stderr] ${message}`);
            this.emit('error', message);
          }
        });

        // Handle exit
        this.process.on('exit', (code: number | null) => {
          console.log(`[Python] Process exited with code ${code}`);
          this.emit('exit', code);
          this.process = null;
        });

        // Handle spawn errors
        this.process.on('error', (error: Error) => {
          clearTimeout(timeoutId);
          this.removeListener('status', readyHandler);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the Python subprocess
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  /**
   * Send a command to Python
   */
  async sendCommand(command: object): Promise<any> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Process not started');
    }

    return new Promise((resolve, reject) => {
      const dataHandler = (data: any) => {
        this.removeListener('data', dataHandler);
        this.removeListener('error', errorHandler);
        clearTimeout(timeoutId);
        resolve(data);
      };

      const errorHandler = (error: string) => {
        this.removeListener('data', dataHandler);
        this.removeListener('error', errorHandler);
        clearTimeout(timeoutId);
        reject(new Error(error));
      };

      const timeoutId = setTimeout(() => {
        this.removeListener('data', dataHandler);
        this.removeListener('error', errorHandler);
        reject(new Error('Command timeout'));
      }, COMMAND_TIMEOUT_MS);

      this.once('data', dataHandler);
      this.once('error', errorHandler);

      const json = JSON.stringify(command);
      this.process!.stdin!.write(`${json}\n`);
    });
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Handle stdout data
   */
  private handleStdout(data: Buffer): void {
    this.stdoutBuffer += data.toString();

    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        this.parseLine(trimmed);
      }
    }
  }

  /**
   * Parse a protocol line
   */
  private parseLine(line: string): void {
    if (line.startsWith('STATUS:')) {
      this.emit('status', line.substring(7));
    } else if (line.startsWith('ERROR:')) {
      this.emit('error', line.substring(6));
    } else if (line.startsWith('DATA:')) {
      try {
        const data = JSON.parse(line.substring(5));
        this.emit('data', data);
      } catch {
        this.emit('error', `Invalid JSON: ${line.substring(5)}`);
      }
    } else if (line.startsWith('PREVIEW:')) {
      this.emit('preview', line.substring(8));
    } else if (line.startsWith('FRAME_SAVED:')) {
      try {
        const frameInfo = JSON.parse(line.substring(12));
        this.emit('frame_saved', frameInfo);
      } catch {
        this.emit('error', `Invalid frame info: ${line.substring(12)}`);
      }
    } else {
      // Log unrecognized lines
      console.log(`[Python] ${line}`);
    }
  }
}
