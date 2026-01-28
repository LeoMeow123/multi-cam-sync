# Multi-Cam-Sync

Multi-camera synchronization system with hardware triggering for Basler cameras.

## Features

- **4-camera support** with sub-millisecond hardware synchronization
- **Arduino-based triggering** with physical start/kill buttons
- **Electron desktop app** with React UI
- **120fps recording** with simultaneous capture
- **Frame verification** to ensure all cameras captured the same number of frames

## Hardware Requirements

### Cameras
- 2-4x Basler ace2 a2A1920-165g5mBAS (5GigE, Monochrome)
- 6mm UC Series Fixed Focal Length Lens
- GigE Cat 6 SFTP cables
- Basler ace2 GPIO cables (M8 6pin to Open)

### Sync System
- Arduino UNO R3
- Breadboard + Dupont jumper wires
- 12V 5A DC Power Supply
- (Optional) Start/Kill buttons

### Network
- 10GigE switch (for 4 cameras)
- PC with dual 2.5GbE + USB-C 5GbE adapter

## Wiring

### Arduino Pin Assignments

| Pin | Function |
|-----|----------|
| 2 | Camera 1 Trigger |
| 3 | Camera 2 Trigger |
| 4 | Camera 3 Trigger |
| 5 | Camera 4 Trigger |
| 6 | Start Button (INPUT_PULLUP) |
| 7 | Kill Switch (INPUT_PULLUP) |
| 13 | Status LED |
| GND | Common ground |

### Camera GPIO (M8 6-pin)

| Pin | Wire Color* | Function | Connect To |
|-----|-------------|----------|------------|
| 1 | White | Trigger In | Arduino Pin 2/3/4/5 |
| 4 | Yellow | GND | Arduino GND |
| 5 | Grey | 12V+ | 12V PSU + |
| 6 | Pink | 12V GND | 12V PSU - |

*Wire colors may vary - verify with your cable.

## Installation

### 1. Arduino Firmware

```bash
# Open Arduino IDE
# File → Open → arduino/multi_camera_trigger/multi_camera_trigger.ino
# Upload to Arduino UNO
```

### 2. Python Backend

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows

# Install dependencies
pip install -e .

# Or with uv
uv sync
```

### 3. Electron App

```bash
# Install Node.js dependencies
npm install

# Start development server
npm start

# Package for distribution
npm run package
```

## Usage

### Quick Start

1. **Connect hardware**: Cameras, Arduino, power supply
2. **Upload Arduino firmware** (first time only)
3. **Start the app**: `npm start`
4. **Detect cameras**: Click "Scan for Cameras"
5. **Configure**: Set camera IPs, frame rate, output directory
6. **Arm**: Click "Arm" (or press physical button)
7. **Record**: Click "Start" or press physical start button
8. **Stop**: Click "Stop" or press kill switch

### Testing Without Hardware

```bash
# Test Arduino communication
npm run test:arduino

# Test with mock cameras
MOCK_CAMERAS=true npm start
```

## Project Structure

```
multi-cam-sync/
├── arduino/                    # Arduino firmware
│   └── multi_camera_trigger/
├── python/                     # Python camera backend
│   ├── camera_manager.py       # Single camera control
│   ├── camera_types.py         # Data classes
│   ├── ipc_handler.py          # IPC protocol handler
│   └── main.py                 # Entry point
├── src/
│   ├── main/                   # Electron main process
│   │   ├── arduino-manager.ts  # Arduino serial comm
│   │   └── ...
│   ├── renderer/               # React UI
│   └── types/                  # TypeScript types
├── docs/                       # Documentation
│   ├── SETUP_GUIDE.md
│   ├── TUTORIAL.md
│   └── wiring-diagram.svg
├── package.json
├── pyproject.toml
└── README.md
```

## Protocol

### Arduino Serial Commands

| Command | Response | Description |
|---------|----------|-------------|
| `START` | `RECORDING` | Begin triggering |
| `STOP` | `STOPPED:<frames>` | Stop triggering |
| `ARM` | `ARMED` | Enable start button |
| `DISARM` | `DISARMED` | Disable start button |
| `TRIGGER` | `TRIGGERED:<n>` | Single trigger |
| `FPS:<n>` | `FPS_SET:<n>` | Set frame rate |
| `STATUS` | `STATUS:<state>:<frames>:<fps>:<cams>` | Get status |
| `PING` | `PONG` | Connection test |

### Python IPC Protocol

```json
// Command
{"command": "start_capture", "output_dir": "/recordings/session1/cam1"}

// Response
STATUS:Capture started
FRAME_SAVED:{"camera_id": "cam1", "frame_number": 1, "file_path": "..."}
```

## Development

```bash
# Format Python code
black python/

# Lint Python
ruff python/

# Type check Python
mypy python/

# Format TypeScript
npm run format

# Lint TypeScript
npm run lint
```

## License

MIT
