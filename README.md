# Multi-Cam-Sync

Multi-camera synchronization system with hardware triggering for Basler cameras.

## Features

- **4-camera support** with sub-millisecond hardware synchronization
- **Arduino-based triggering** with physical start/kill buttons
- **Electron desktop app** with React UI
- **120fps recording** with simultaneous capture
- **Sync verification**: every frame's block ID is recorded, and each camera is checked
  against the Arduino's own pulse count ([how](#sync-verification))

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
7. **Record**: Click "Start" or press the physical start button. Either way the app
   arms every camera first, checks that none has received a frame, and only then
   tells the Arduino to start, so pulse 1 is frame 1 on every camera
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
│   ├── sync_check.py           # Block-ID sync verdicts
│   ├── tests/                  # pytest (no camera needed)
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
| `STOP` | `STOPPED:<pulses>:<late>` | Stop triggering; `late` = pulses fired a whole period late |
| `ARM` | `ARMED` | Enable start button |
| `DISARM` | `DISARMED` | Disable start button |
| `TRIGGER` | `TRIGGERED:<n>` | Single trigger (refused while recording) |
| `FPS:<n>` | `FPS_SET:<n>` | Set frame rate (refused while recording) |
| `CAMERAS:<n>` | `CAMERAS_SET:<n>` | Set camera count (refused while recording) |
| `STATUS` | `STATUS:<state>:<frames>:<fps>:<cams>` | Get status |
| `PING` | `PONG` | Connection test |
| `VERSION` | `VERSION:1.1.0` | Firmware version |

The start button never starts the triggers itself: when armed, a press sends
`BUTTON:START` and disarms, and the app starts the recording as if Start had been
clicked. A refused command answers `ERROR:<reason>`.

The Arduino fires exactly the requested rate. Its scheduler advances by the nominal
period (`1000000 / fps` µs), so timing error does not accumulate, and nothing in
its loop blocks. If an iteration ever runs a whole period late it fires one late
pulse and re-anchors, instead of a burst of catch-up pulses no camera could take,
and counts it in `STOPPED`.

> **Upgrading from firmware 1.0.0:** re-upload the sketch. The 1.0.0 start button
> started the triggers before the app had armed the cameras; the app now refuses
> such a start (frames before START) instead of recording it.

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

## Sync verification

A camera can lose a frame in two ways, and only one of them is visible in its
video:

- **Lost in transit** (dropped packets, a full buffer): the frame's GigE block ID
  is skipped, so the gap's position is known and the other frames still map to
  their pulses.
- **Trigger ignored** (exposure longer than the frame period, a weak trigger
  signal): no block ID is used, so nothing in the file shows where it happened,
  and every later frame is one pulse late. Only the Arduino's pulse count reveals
  it.

So equal frame counts do not prove sync (cam1 can drop frame 20 and cam2 frame 80).
At stop, the app stops the Arduino first, takes its pulse count, lets each camera
drain its last frames, and compares the camera's block IDs with the pulse count:

| Verdict | Meaning |
|---|---|
| `exact` | Every pulse arrived: frame *i* of the video is pulse *i* |
| `recoverable` | Frames lost in transit. Use `<cam>_frames.csv` to map each frame to its pulse |
| `unproven` | The camera ignored pulses (or lost its last frames): later frames may be shifted |
| `extra` | More frames than pulses: something else drove the trigger line |

Each session folder gets:

```
<session>/
├── sync_report.json        # pulses, late pulses, and each camera's verdict and gaps
├── cam1/
│   ├── cam1.avi
│   └── cam1_frames.csv     # frame_index, block_id, device_timestamp, host_timestamp
└── cam2/ ...
```

`block_id` is the pulse number: to align cameras, match rows by `block_id`, not
by `frame_index`. The recording is reported as synced only when every camera is
`exact` and no pulse was late.

Before arming, each camera's own maximum frame rate (`ResultingFrameRate`, which
accounts for exposure and ROI) must reach the trigger rate, or the start is
refused: a camera that cannot keep up ignores triggers.

## Syncing external acquisition systems (Intan ephys / PowerLab EMG)

The Arduino fires **all four trigger pins (2–5) simultaneously** on every frame
(`PORTD |= B00111100` — one port write), so any unused pin is a free **per-frame
sync output**: 0→5 V TTL, one pulse per captured frame, no firmware or app change
needed. With 2 cameras on pins 2–3, pins **4 and 5** are available.

Used for the Pfaff-lab collaboration (Intan RHD 128-ch ephys + PowerLab 8/35 EMG
on the treadmill):

```
Arduino pin 4 socket ──jumper──► BNC ──► Intan DIGITAL IN 1   (per-frame timestamps)
Arduino pin 5 socket ──jumper──► BNC ──► PowerLab trigger-in and/or analog channel
Arduino GND socket   ──jumper──► BNC shields (common ground — required)
```

- Plug **directly into the Arduino header sockets** (signal pin + GND) — don't tee
  off the breadboard camera rows (floating-row and wrong-ground-rail mistakes).
- **Voltage:** Arduino = 5 V TTL. Intan digital-in accepts 2.0–5.5 V logic high;
  PowerLab trigger is TTL and its analog inputs are ±10 V. No level shifting.
- **How timestamps work:** the receiving box records the pulse train as a data
  channel on its own sample clock. Rising edge *k* = pulse *k* = `block_id` *k*
  in each camera's `<cam>_frames.csv` (and video frame *k* − 1 when the camera's
  verdict is `exact`). Sanity check after every session: edge count must equal
  the Arduino's pulse count (`arduino.pulses` in `sync_report.json`).
- **Recommended workflow:** start Intan/PowerLab recording first (Intan in a
  normal run with the digital channel displayed — not "wait for trigger"), then
  Start here; the first pulse lands inside their recordings.
- **Pulse width caveat:** `TRIGGER_PULSE_US` is 50 µs. Cameras only care about the
  rising edge, but 50 µs is marginal for an Intan sampling at 20 kS/s and mostly
  invisible to a PowerLab analog channel at typical EMG rates (1–10 kS/s). If the
  receiver misses pulses, widen it to **1000 µs** (still only 12% duty at 120 fps)
  and re-upload the firmware — harmless to the cameras.
- **Frame-rate honesty:** the a2A1920-165g5m cameras cap at 165 fps (we run 120),
  and the firmware clamps `FPS:` to 1–165.

## License

MIT
