# Camera Sync System - Setup Guide

Step-by-step guide for first-time hardware connection and software setup.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Hardware Assembly](#hardware-assembly)
3. [Arduino Setup](#arduino-setup)
4. [Camera Setup](#camera-setup)
5. [Network Setup](#network-setup)
6. [Software Installation](#software-installation)
7. [First Test](#first-test)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Hardware Checklist

Before starting, ensure you have:

- [ ] 2-4x Basler ace2 a2A1920-165g5mBAS cameras
- [ ] 2-4x 6mm UC Series lenses
- [ ] 2-4x Basler GPIO cables (M8 6-pin to open wire, 5m)
- [ ] 2-4x GigE Cat6 cables (5m)
- [ ] 1x Arduino UNO R3
- [ ] 1x Breadboard (830 point)
- [ ] Dupont jumper wires (male-to-male and male-to-female)
- [ ] 1x 12V 5A DC power supply
- [ ] 1x 10GigE network switch
- [ ] Mini PC with dual 2.5GbE ports
- [ ] (Optional) Momentary push buttons for start/kill

### Tools Needed

- Small Phillips screwdriver
- Wire strippers (if modifying cables)
- Multimeter (for testing connections)

---

## Hardware Assembly

### Step 1: Prepare the Breadboard

1. **Insert the Arduino** near one end of the breadboard (or beside it)

2. **Create power rails**:
   - Connect Arduino GND to the breadboard's ground rail (blue/black line)
   - The 12V power will go on the positive rail (red line)

3. **Add buttons** (optional):
   ```
   Start Button:
   - One leg to Arduino Pin 6
   - Other leg to GND rail

   Kill Switch:
   - One leg to Arduino Pin 7
   - Other leg to GND rail
   ```

### Step 2: Prepare GPIO Cables

The GPIO cables have 6 wires with open ends. Identify each wire:

| Pin | Wire Color* | Function | Connect To |
|-----|------------|----------|------------|
| 1 | White | Trigger Input | Arduino trigger pin |
| 2 | Brown | I/O Line 2 | Not used |
| 3 | Green | I/O Line 3 | Not used |
| 4 | Yellow | Signal GND | Arduino GND / Breadboard GND |
| 5 | Grey | 12V Power + | 12V PSU positive |
| 6 | Pink | 12V Power - | 12V PSU negative |

**⚠️ Important**: Wire colors may vary! Use a multimeter to verify by checking continuity with the M8 connector pinout.

### Step 3: Wire the Cameras

For each camera:

1. **Connect trigger wire** (Pin 1 / White):
   - Camera 1 → Arduino Pin 2
   - Camera 2 → Arduino Pin 3
   - Camera 3 → Arduino Pin 4 (future)
   - Camera 4 → Arduino Pin 5 (future)

2. **Connect ground wire** (Pin 4 / Yellow):
   - All cameras → Breadboard GND rail
   - Breadboard GND rail → Arduino GND

3. **Connect power wires** (Pins 5 & 6):
   - Pin 5 (Grey/12V+) → 12V PSU positive terminal
   - Pin 6 (Pink/12V-) → 12V PSU negative terminal

### Step 4: Complete Wiring Diagram

```
                        ┌─────────────────┐
                        │   12V 5A PSU    │
                        │  [+]       [-]  │
                        └───┬─────────┬───┘
                            │         │
    ┌───────────────────────┼─────────┼─────────────────────────┐
    │                       │         │                         │
    │  BREADBOARD          (+)       (-)                        │
    │  ══════════════════════════════════════════════════       │
    │  + Rail (12V) ───────┘         │                          │
    │  - Rail (GND) ─────────────────┴──────┐                   │
    │                                        │                   │
    └───────────────────────────────────────┼───────────────────┘
                                            │
    ┌─────────────────┐                     │
    │  ARDUINO UNO    │                     │
    │                 │                     │
    │  GND ───────────┼─────────────────────┘
    │                 │
    │  Pin 2 ─────────┼──────────────────────► Camera 1 (White wire)
    │  Pin 3 ─────────┼──────────────────────► Camera 2 (White wire)
    │  Pin 4 ─────────┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─► Camera 3 (future)
    │  Pin 5 ─────────┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─► Camera 4 (future)
    │                 │
    │  Pin 6 ◄────────┼─── Start Button ──── GND
    │  Pin 7 ◄────────┼─── Kill Switch ───── GND
    │                 │
    │  USB ───────────┼──────────────────────► PC USB Port
    └─────────────────┘

    Camera GPIO connections (each camera):
    ├── Pin 1 (White)  → Arduino trigger pin
    ├── Pin 4 (Yellow) → Breadboard GND rail
    ├── Pin 5 (Grey)   → Breadboard 12V+ rail
    └── Pin 6 (Pink)   → Breadboard GND rail (12V return)
```

### Step 5: Attach Lenses to Cameras

1. Remove the dust cap from the camera C-mount
2. Align the lens threads with the camera mount
3. Screw in clockwise until snug (don't over-tighten)
4. Attach the IR filter to the front of the lens

---

## Arduino Setup

### Step 1: Install Arduino IDE

1. Download Arduino IDE from https://www.arduino.cc/en/software
2. Install and launch

### Step 2: Upload Firmware

1. Connect Arduino to PC via USB cable
2. Open Arduino IDE
3. File → Open → Navigate to:
   ```
   camera-sync-system/arduino/multi_camera_trigger/multi_camera_trigger.ino
   ```
4. Select board: Tools → Board → Arduino Uno
5. Select port: Tools → Port → (your Arduino port)
6. Click Upload (→ button)
7. Wait for "Done uploading"

### Step 3: Test Arduino

1. Open Serial Monitor: Tools → Serial Monitor
2. Set baud rate to `115200`
3. You should see: `READY`
4. Type `PING` and press Enter
5. You should see: `PONG`
6. Type `STATUS` to see current state

---

## Camera Setup

### Step 1: Mount Cameras

1. Position cameras on tripods or mounts
2. Aim all cameras at the target area
3. Ensure stable mounting (vibration affects image quality)

### Step 2: Connect Power

1. **⚠️ Double-check polarity before powering on!**
2. Connect 12V PSU to mains power
3. Camera LEDs should light up

### Step 3: Focus Lenses

1. Set lens aperture to desired f-stop
2. Manually focus by rotating the focus ring
3. Use a focus target or ruler at your working distance
4. Lock focus ring if available

---

## Network Setup

### Option A: Direct Connection (2 Cameras)

For 2 cameras, connect directly to PC:

```
Camera 1 ──[Cat6]──► PC 2.5GbE Port 1
Camera 2 ──[Cat6]──► PC 2.5GbE Port 2
```

### Option B: Switch Connection (2-4 Cameras)

For more cameras or future expansion:

```
Camera 1 ──[Cat6]──► Switch Port 1
Camera 2 ──[Cat6]──► Switch Port 2
Camera 3 ──[Cat6]──► Switch Port 3
Camera 4 ──[Cat6]──► Switch Port 4
                     Switch Uplink ──► PC
```

### Step: Configure Network

1. **Set static IPs** on cameras (recommended):
   - Camera 1: 192.168.1.101
   - Camera 2: 192.168.1.102
   - Camera 3: 192.168.1.103
   - Camera 4: 192.168.1.104

2. **Configure PC network interface**:
   - IP: 192.168.1.1
   - Subnet: 255.255.255.0
   - Gateway: (leave blank)

3. **Test connectivity**:
   ```bash
   ping 192.168.1.101
   ping 192.168.1.102
   ```

---

## Software Installation

### Step 1: Install Python Dependencies

```bash
cd camera-sync-system

# Create virtual environment
python3 -m venv .venv

# Activate it
source .venv/bin/activate  # Linux/Mac
# or
.venv\Scripts\activate     # Windows

# Install dependencies
pip install -e .
```

### Step 2: Install Pylon SDK

1. Download Pylon SDK from Basler website:
   https://www.baslerweb.com/en/downloads/software-downloads/

2. Install for your platform:
   - Windows: Run installer
   - Linux: `sudo dpkg -i pylon_*.deb`
   - macOS: Mount DMG and install

3. Verify installation:
   ```bash
   python -c "from pypylon import pylon; print('PyPylon OK')"
   ```

### Step 3: Install Node.js Dependencies

```bash
cd camera-sync-system
npm install
```

### Step 4: Start the Application

```bash
npm start
```

---

## First Test

### Test 1: Arduino Communication

1. In the app, click **Connect**
2. Arduino status should show "Connected"
3. If not, check:
   - USB cable connected?
   - Correct port selected?
   - Arduino firmware uploaded?

### Test 2: Camera Detection

1. Go to **Settings** tab
2. Click **Detect Cameras**
3. Your cameras should appear in the list
4. Assign detected cameras to slots 1-4

### Test 3: Camera Preview

1. Return to **Cameras** tab
2. You should see live preview from each camera
3. If no preview:
   - Check network connections
   - Verify camera IPs
   - Check camera power

### Test 4: Single Trigger

1. In Settings or via Arduino Serial Monitor:
   ```
   TRIGGER
   ```
2. All cameras should capture one frame
3. Verify LEDs flash on cameras

### Test 5: Full Recording

1. Click **Arm**
2. Click **Start Recording** (or press physical button)
3. Let it run for 5-10 seconds
4. Click **Stop**
5. Check output directory for recorded frames
6. Verify frame counts match across all cameras

---

## Troubleshooting

### Arduino Issues

| Problem | Solution |
|---------|----------|
| "Port not found" | Check USB cable, try different port |
| No "READY" message | Re-upload firmware |
| Trigger not working | Check wiring, verify pin assignments |

### Camera Issues

| Problem | Solution |
|---------|----------|
| Camera not detected | Check network cable, verify IP config |
| "PyPylon not available" | Install Pylon SDK |
| No image / black frame | Check lens cap removed, verify exposure |
| Frame drops | Reduce frame rate, check network bandwidth |

### Network Issues

| Problem | Solution |
|---------|----------|
| Can't ping camera | Check cable, verify IP settings |
| Low frame rate | Check link speed (should be 2.5G+) |
| Buffer overflows | Increase system buffer size |

### Power Issues

| Problem | Solution |
|---------|----------|
| Camera won't power on | Check 12V connections, verify polarity |
| Intermittent power | Check wire connections, PSU capacity |
| Multiple cameras browning out | Use higher capacity PSU (5A minimum) |

---

## Quick Reference

### Arduino Commands

```
PING          → Test connection
STATUS        → Get current state
ARM           → Enable start button
DISARM        → Disable start button
START         → Begin recording
STOP          → Stop recording
TRIGGER       → Single capture
FPS:120       → Set frame rate
CAMERAS:2     → Set number of cameras
```

### GPIO Cable Colors (typical)

```
Pin 1: White  = Trigger
Pin 2: Brown  = I/O 2 (unused)
Pin 3: Green  = I/O 3 (unused)
Pin 4: Yellow = GND
Pin 5: Grey   = 12V+
Pin 6: Pink   = 12V-
```

### Default Camera Settings

```
Exposure: 8000 µs
Gain: 0
Gamma: 1.0
Trigger: Hardware, Line1, Rising Edge
```

---

## Next Steps

Once everything is working:

1. **Fine-tune exposure** for your lighting conditions
2. **Adjust frame rate** based on your needs
3. **Test longer recordings** to verify stability
4. **Create backup** of your configuration
5. **Document your specific setup** for future reference
