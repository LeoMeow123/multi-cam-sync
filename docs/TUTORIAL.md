# Multi-Cam-Sync Tutorial

A complete guide to building and using the multi-camera synchronization system.

## Table of Contents

1. [Overview](#overview)
2. [Hardware Setup](#hardware-setup)
3. [Software Installation](#software-installation)
4. [Arduino Setup](#arduino-setup)
5. [Camera Configuration](#camera-configuration)
6. [Using the Application](#using-the-application)
7. [Recording Your First Session](#recording-your-first-session)
8. [Advanced Topics](#advanced-topics)

---

## Overview

### What This System Does

Multi-Cam-Sync is a hardware-synchronized multi-camera recording system that:

- Captures frames from 2-4 Basler cameras **simultaneously**
- Uses Arduino hardware triggers for **sub-millisecond** synchronization
- Provides an **Electron desktop app** for easy control
- Supports **120fps** recording with per-frame sync verification

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop App (Electron)                    │
│  ┌─────────────────┐         ┌──────────────────────────┐  │
│  │   React UI      │◄───────►│    Main Process          │  │
│  │   - Camera Grid │   IPC   │    - Camera Manager      │  │
│  │   - Controls    │         │    - Arduino Manager     │  │
│  │   - Settings    │         │    - Recording Manager   │  │
│  └─────────────────┘         └───────────┬──────────────┘  │
└──────────────────────────────────────────┼─────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
              ┌─────▼─────┐          ┌─────▼─────┐          ┌─────▼─────┐
              │  Python   │          │  Python   │          │  Arduino  │
              │  Camera 1 │          │  Camera 2 │          │   UNO     │
              └─────┬─────┘          └─────┬─────┘          └─────┬─────┘
                    │                      │                      │
              ┌─────▼─────┐          ┌─────▼─────┐          ┌─────▼─────┐
              │  Basler   │◄─────────┤  Trigger  ├─────────►│  Basler   │
              │  Camera 1 │          │  Signal   │          │  Camera 2 │
              └───────────┘          └───────────┘          └───────────┘
```

---

## Hardware Setup

### Required Components

| Component | Quantity | Purpose |
|-----------|----------|---------|
| Basler ace2 a2A1920-165g5mBAS | 2-4 | Cameras |
| 6mm UC Series Lens | 2-4 | Optics |
| Basler GPIO Cable (M8 to open) | 2-4 | Trigger connection |
| Cat6 Ethernet Cable | 2-4 | Network |
| Arduino UNO R3 | 1 | Trigger controller |
| Breadboard | 1 | Wiring |
| 12V 5A Power Supply | 1 | Camera power |
| Dupont Jumper Wires | ~20 | Connections |

### Wiring Steps

#### Step 1: Power Distribution

```
12V PSU (+) ────────► Breadboard Power Rail (+)
12V PSU (-) ────────► Breadboard Ground Rail (-)
```

#### Step 2: Arduino Connections

```
Arduino GND ────────► Breadboard Ground Rail
Arduino Pin 2 ──────► Camera 1 Trigger (GPIO Pin 1)
Arduino Pin 3 ──────► Camera 2 Trigger (GPIO Pin 1)
Arduino Pin 4 ──────► Camera 3 Trigger (optional)
Arduino Pin 5 ──────► Camera 4 Trigger (optional)
```

#### Step 3: Camera GPIO Wiring

For each camera, connect the GPIO cable wires:

```
GPIO Pin 1 (Trigger) ───► Arduino trigger pin
GPIO Pin 4 (GND) ───────► Breadboard ground rail
GPIO Pin 5 (12V+) ──────► Breadboard power rail (+)
GPIO Pin 6 (12V-) ──────► Breadboard ground rail
```

#### Step 4: Optional Buttons

```
Start Button:
  One terminal ────► Arduino Pin 6
  Other terminal ──► Ground

Kill Switch:
  One terminal ────► Arduino Pin 7
  Other terminal ──► Ground
```

### Safety Checklist

- [ ] Double-check 12V polarity before powering on
- [ ] Ensure all ground connections are common
- [ ] Verify trigger wires go to correct Arduino pins
- [ ] Test each connection with multimeter if unsure

---

## Software Installation

### Prerequisites

- **Node.js** 18.x or higher
- **Python** 3.10 or higher
- **Basler Pylon SDK** 7.x
- **Arduino IDE** 2.x

### Step 1: Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/multi-cam-sync.git
cd multi-cam-sync
```

### Step 2: Install Node Dependencies

```bash
npm install
```

### Step 3: Install Python Dependencies

```bash
# Create virtual environment
python -m venv .venv

# Activate it
source .venv/bin/activate  # Linux/Mac
# OR
.venv\Scripts\activate     # Windows

# Install package
pip install -e .
```

### Step 4: Install Basler Pylon SDK

1. Download from [Basler Website](https://www.baslerweb.com/en/downloads/software-downloads/)
2. Install for your platform
3. Verify: `python -c "from pypylon import pylon; print('OK')"`

### Step 5: Verify Installation

```bash
# Test Python camera detection
python python/main.py --detect

# Start the app
npm start
```

---

## Arduino Setup

### Upload Firmware

1. Open Arduino IDE
2. File → Open → `arduino/multi_camera_trigger/multi_camera_trigger.ino`
3. Select board: Tools → Board → Arduino Uno
4. Select port: Tools → Port → (your port)
5. Click Upload

### Test Arduino

Open Serial Monitor (115200 baud) and test:

```
> PING
< PONG

> STATUS
< STATUS:IDLE:0:120:4

> TRIGGER
< TRIGGERED:1
```

### Command Reference

| Command | Response | Description |
|---------|----------|-------------|
| `PING` | `PONG` | Test connection |
| `STATUS` | `STATUS:state:frames:fps:cams` | Get status |
| `ARM` | `ARMED` | Enable start button |
| `START` | `RECORDING` | Begin triggering |
| `STOP` | `STOPPED:pulses:late` | Stop triggering |
| `TRIGGER` | `TRIGGERED:n` | Single trigger (not while recording) |
| `FPS:n` | `FPS_SET:n` | Set frame rate (not while recording) |

---

## Camera Configuration

### Network Setup

1. **Assign static IPs** to cameras:
   - Camera 1: 192.168.1.101
   - Camera 2: 192.168.1.102
   - etc.

2. **Configure PC network**:
   - IP: 192.168.1.1
   - Subnet: 255.255.255.0

3. **Test connectivity**:
   ```bash
   ping 192.168.1.101
   ping 192.168.1.102
   ```

### Camera Settings

Default settings (configurable in app):

| Setting | Default | Range |
|---------|---------|-------|
| Exposure | 8000 µs | 100-100000 |
| Gain | 0 | 0-24 |
| Gamma | 1.0 | 0.5-2.0 |
| Frame Rate | 120 fps | 1-165 |

---

## Using the Application

### Start the App

```bash
npm start
```

### Main Interface

```
┌─────────────────────────────────────────────────────────────┐
│  Multi-Cam-Sync                    [Cameras] [Settings]     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Camera 1      │  │   Camera 2      │  │   Status    │ │
│  │   [Preview]     │  │   [Preview]     │  │   ───────   │ │
│  │                 │  │                 │  │   Arduino:  │ │
│  │   Frame: 0      │  │   Frame: 0      │  │   ● Connected│ │
│  └─────────────────┘  └─────────────────┘  │             │ │
│                                            │   Cameras:  │ │
│  ┌─────────────────┐  ┌─────────────────┐  │   2 online  │ │
│  │   Camera 3      │  │   Camera 4      │  │             │ │
│  │   (disabled)    │  │   (disabled)    │  │   FPS: 120  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┤
│  │  [🎯 Arm System]                                        │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Workflow

1. **Connect** - Click Connect button to initialize hardware
2. **Configure** - Go to Settings, set camera IPs, frame rate
3. **Arm** - Click "Arm System" to enable recording
4. **Record** - Click "Start Recording" or press physical button
5. **Stop** - Click "Stop" or press kill switch
6. **Review** - Check frame counts, verify sync

---

## Recording Your First Session

### Pre-Recording Checklist

- [ ] All cameras powered and connected
- [ ] Arduino connected and firmware uploaded
- [ ] Network configured and cameras reachable
- [ ] Output directory set
- [ ] Frame rate configured

### Recording Steps

1. **Launch app**: `npm start`

2. **Connect hardware**: Click "Connect" button
   - Arduino status should show "Connected"
   - Cameras should show "Online"

3. **Verify previews**: Check all camera views show live image

4. **Arm the system**: Click "🎯 Arm System"
   - Status changes to "ARMED"
   - Start button becomes active

5. **Start recording**: Click "● Start Recording"
   - Status changes to "RECORDING"
   - Frame counters begin incrementing
   - Status LED on Arduino lights up

6. **Monitor recording**:
   - Watch frame counts (they can differ by a frame or two in flight)
   - Monitor elapsed time
   - Watch for any error messages

7. **Stop recording**: Click "■ Stop Recording"
   - The Arduino stops, then every camera saves its last frames
   - Each camera is checked against the Arduino's pulse count
   - Files are saved to output directory

### Output Structure

```
~/recordings/
└── 2026-01-28_14-30-00/
    ├── sync_report.json
    ├── cam1/
    │   ├── cam1.avi
    │   └── cam1_frames.csv
    └── cam2/
        ├── cam2.avi
        └── cam2_frames.csv
```

### Verify Sync

After recording, check `sync_report.json`:

```json
{
  "arduino": {"pulses": 7200, "late_pulses": 0},
  "synced": false,
  "cameras": {
    "cam1": {"frame_count": 7200, "verdict": "exact"},
    "cam2": {"frame_count": 7199, "verdict": "recoverable",
             "verdict_reason": "1 of 7200 frames lost in transit; ..."}
  }
}
```

`recoverable` means a frame was lost on the way to the PC: match the cameras by the
`block_id` column of each `<cam>_frames.csv`. `unproven` means the camera ignored
triggers, and its frames may be shifted. See
[Sync verification](../README.md#sync-verification).

---

## Advanced Topics

### Adjusting Exposure for Your Scene

1. Start with default exposure (8000 µs)
2. View preview - adjust if too bright/dark
3. For fast motion, use shorter exposure (reduces blur)
4. For low light, increase exposure and/or gain

### Maximizing Frame Rate

Bandwidth limits at different configurations:

| Cameras | Max FPS | Network Required |
|---------|---------|------------------|
| 2 | 120 fps | 2× 2.5GbE |
| 2 | 165 fps | 10GbE |
| 4 | 60 fps | 2× 2.5GbE |
| 4 | 120 fps | 10GbE |

### Troubleshooting Frame Drops

1. **Reduce frame rate**: Try 100fps instead of 120fps
2. **Check network**: Ensure gigabit connection, no packet loss
3. **Check storage**: Use NVMe SSD with >1GB/s write speed
4. **Check CPU**: Close other applications

### Converting Frames to Video

After recording, convert PNG sequences to video:

```bash
# Using ffmpeg
ffmpeg -framerate 120 -i cam1/%06d.png -c:v libx264 -pix_fmt yuv420p cam1.mp4

# With timestamp overlay
ffmpeg -framerate 120 -i cam1/%06d.png \
  -vf "drawtext=text='Frame %{frame_num}':x=10:y=10:fontsize=24:fontcolor=white" \
  -c:v libx264 cam1_labeled.mp4
```

### Running Without GUI (Headless)

For automated recording:

```bash
# Python CLI mode
python python/main.py --ipc < commands.txt

# Where commands.txt contains:
# {"command": "init", "camera_id": "cam1", "camera_ip": "192.168.1.101"}
# {"command": "connect"}
# {"command": "start_capture", "output_dir": "/recordings/session1"}
```

---

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/multi-cam-sync/issues)
- **Basler Support**: [Basler Documentation](https://docs.baslerweb.com/)
- **Arduino**: [Arduino Forums](https://forum.arduino.cc/)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.
