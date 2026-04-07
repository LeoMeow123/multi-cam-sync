#!/usr/bin/env python3
"""
Camera Settings App — Standalone tool for adjusting Basler camera image settings.

Connects to cameras in software trigger (free-run) mode so live preview works.
Saves settings to the shared config file used by the recording app.

Usage:
    python camera_settings_app.py
    # or with uv:
    uv run camera_settings_app.py

Requirements: pypylon, numpy, Pillow
Optional: opencv-python (for better display)
"""

import json
import os
import platform
import sys
import time
import threading
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageTk

# Try pypylon
try:
    from pypylon import pylon
except ImportError:
    print("ERROR: pypylon required. Install with: pip install pypylon")
    sys.exit(1)

# Use tkinter (always available with Python, no extra install)
import tkinter as tk
from tkinter import ttk

# ── Config path ──────────────────────────────────────────────────────────────

if platform.system() == "Windows":
    CONFIG_DIR = Path(os.environ.get("APPDATA", "~")) / "Camera Sync System"
else:
    CONFIG_DIR = Path.home() / ".config" / "Camera Sync System"

CONFIG_PATH = CONFIG_DIR / "config.json"

# ── Defaults ─────────────────────────────────────────────────────────────────

DEFAULTS = {
    "exposure_time": 8000,
    "gain": 0,
    "gamma": 1.0,
}


# ── Camera helper ────────────────────────────────────────────────────────────


def detect_cameras() -> list[dict]:
    """Detect all Basler GigE cameras on the network."""
    cameras = []
    tl_factory = pylon.TlFactory.GetInstance()
    for dev in tl_factory.EnumerateDevices():
        if dev.GetDeviceClass() == "BaslerGigE":
            cameras.append({
                "ip": dev.GetIpAddress(),
                "model": dev.GetModelName(),
                "serial": dev.GetSerialNumber(),
                "name": dev.GetUserDefinedName() or dev.GetModelName(),
            })
    return cameras


def set_node(camera, *names, value):
    """Set a camera node by trying multiple names (old/new Pylon API)."""
    for name in names:
        try:
            node = getattr(camera, name, None)
            if node is not None:
                node.Value = value
                return True
        except Exception:
            continue
    return False


class CameraConnection:
    """Manages a single camera connection in software trigger (free-run) mode."""

    def __init__(self, ip: str, camera_id: str):
        self.ip = ip
        self.camera_id = camera_id
        self.camera = None
        self.connected = False

    def connect(self) -> bool:
        try:
            tl_factory = pylon.TlFactory.GetInstance()
            tl = tl_factory.CreateTl("BaslerGigE")
            cam_info = tl.CreateDeviceInfo()
            cam_info.SetIpAddress(self.ip)
            self.camera = pylon.InstantCamera(tl_factory.CreateDevice(cam_info))
            self.camera.Open()
            # Software trigger = free-run mode (no hardware trigger needed)
            self.camera.TriggerMode.Value = "Off"
            self.connected = True
            return True
        except Exception as e:
            print(f"Failed to connect {self.camera_id} ({self.ip}): {e}")
            return False

    def disconnect(self):
        if self.camera and self.connected:
            try:
                if self.camera.IsGrabbing():
                    self.camera.StopGrabbing()
                self.camera.Close()
            except Exception:
                pass
            self.connected = False

    def apply_settings(self, exposure: float, gain: int, gamma: float):
        """Apply image settings to the camera."""
        if not self.connected or not self.camera:
            return
        set_node(self.camera, "ExposureTime", "ExposureTimeAbs", value=exposure)
        set_node(self.camera, "GainAuto", value="Off")
        set_node(self.camera, "Gain", "GainRaw", value=gain)
        set_node(self.camera, "GammaEnable", value=True)
        set_node(self.camera, "GammaSelector", value="User")
        set_node(self.camera, "Gamma", value=gamma)

    def grab_frame(self) -> Optional[np.ndarray]:
        """Grab a single frame in free-run mode."""
        if not self.connected or not self.camera:
            return None
        try:
            self.camera.StartGrabbingMax(1)
            result = self.camera.RetrieveResult(3000, pylon.TimeoutHandling_ThrowException)
            if result.GrabSucceeded():
                img = result.Array.copy()
                result.Release()
                return img
            result.Release()
        except Exception as e:
            print(f"Grab failed {self.camera_id}: {e}")
        finally:
            if self.camera.IsGrabbing():
                self.camera.StopGrabbing()
        return None


# ── Config I/O ───────────────────────────────────────────────────────────────


def load_config() -> dict:
    """Load the shared config file."""
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_config(config: dict):
    """Save to the shared config file."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)


def get_camera_settings(config: dict, cam_id: str) -> dict:
    """Get per-camera settings, falling back to global defaults."""
    per_cam = config.get("per_camera_settings", {}).get(cam_id, {})
    global_s = config.get("camera_settings", {})
    return {
        "exposure_time": per_cam.get("exposure_time", global_s.get("exposure_time", DEFAULTS["exposure_time"])),
        "gain": per_cam.get("gain", global_s.get("gain", DEFAULTS["gain"])),
        "gamma": per_cam.get("gamma", global_s.get("gamma", DEFAULTS["gamma"])),
    }


def save_camera_settings(cam_id: str, exposure: float, gain: int, gamma: float):
    """Save per-camera settings to the shared config."""
    config = load_config()
    if "per_camera_settings" not in config:
        config["per_camera_settings"] = {}
    config["per_camera_settings"][cam_id] = {
        "exposure_time": exposure,
        "gain": gain,
        "gamma": gamma,
        "trigger_mode": "hardware",
    }
    save_config(config)


# ── GUI ──────────────────────────────────────────────────────────────────────


class CameraPanel(ttk.LabelFrame):
    """Panel for one camera with preview + sliders."""

    def __init__(self, parent, cam_info: dict, cam_id: str, config: dict):
        super().__init__(parent, text=f"{cam_info['name']} ({cam_info['ip']})", padding=10)

        self.cam_id = cam_id
        self.cam_info = cam_info
        self.conn: Optional[CameraConnection] = None
        self.preview_active = False
        self._preview_after_id = None

        # Load saved settings
        settings = get_camera_settings(config, cam_id)

        # ── Preview canvas ──
        self.canvas = tk.Canvas(self, width=480, height=300, bg="#111111", highlightthickness=0)
        self.canvas.pack(pady=(0, 10))
        self._photo = None  # Keep reference to prevent GC

        # ── Status ──
        self.status_var = tk.StringVar(value="Disconnected")
        ttk.Label(self, textvariable=self.status_var, foreground="#888888").pack()

        # ── Sliders frame ──
        sliders = ttk.Frame(self)
        sliders.pack(fill="x", pady=(10, 0))

        # Exposure
        self.exposure_var = tk.IntVar(value=int(settings["exposure_time"]))
        self._make_slider(sliders, "Exposure (μs)", self.exposure_var, 100, 30000, 100, row=0)

        # Gain
        self.gain_var = tk.IntVar(value=int(settings["gain"]))
        self._make_slider(sliders, "Gain", self.gain_var, 0, 36, 1, row=1)

        # Gamma (stored as x100 internally for int slider)
        self.gamma_var = tk.IntVar(value=int(settings["gamma"] * 100))
        self._make_slider(sliders, "Gamma", self.gamma_var, 25, 400, 5, row=2,
                          fmt=lambda v: f"{v / 100:.2f}")

        # ── Buttons ──
        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", pady=(10, 0))

        self.connect_btn = ttk.Button(btn_frame, text="Connect", command=self._toggle_connect)
        self.connect_btn.pack(side="left", padx=(0, 5))

        ttk.Button(btn_frame, text="Reset", command=self._reset).pack(side="left", padx=(0, 5))

        self.save_label = ttk.Label(btn_frame, text="", foreground="#4ade80")
        self.save_label.pack(side="right")

    def _make_slider(self, parent, label: str, var: tk.IntVar, min_val, max_val, step, row,
                     fmt=None):
        if fmt is None:
            fmt = lambda v: str(int(v))

        lbl_text = tk.StringVar(value=f"{label}: {fmt(var.get())}")
        ttk.Label(parent, textvariable=lbl_text).grid(row=row, column=0, sticky="w", pady=2)

        scale = ttk.Scale(parent, from_=min_val, to=max_val, variable=var, orient="horizontal",
                          command=lambda v, l=lbl_text, lb=label, f=fmt: (
                              l.set(f"{lb}: {f(float(v))}"),
                              self._on_setting_change(),
                          ))
        scale.grid(row=row, column=1, sticky="ew", padx=(10, 0), pady=2)
        parent.columnconfigure(1, weight=1)

    def _on_setting_change(self):
        """Called when any slider changes — apply to camera and save."""
        exposure = self.exposure_var.get()
        gain = self.gain_var.get()
        gamma = self.gamma_var.get() / 100.0

        if self.conn and self.conn.connected:
            self.conn.apply_settings(exposure, gain, gamma)

        # Auto-save
        save_camera_settings(self.cam_id, exposure, gain, gamma)
        self.save_label.config(text="Saved", foreground="#4ade80")
        self.after(2000, lambda: self.save_label.config(text=""))

    def _toggle_connect(self):
        if self.conn and self.conn.connected:
            self._disconnect()
        else:
            self._connect()

    def _connect(self):
        self.status_var.set("Connecting...")
        self.update_idletasks()

        self.conn = CameraConnection(self.cam_info["ip"], self.cam_id)
        if self.conn.connect():
            # Apply current slider values
            self.conn.apply_settings(
                self.exposure_var.get(),
                self.gain_var.get(),
                self.gamma_var.get() / 100.0,
            )
            self.status_var.set("Connected — live preview")
            self.connect_btn.config(text="Disconnect")
            self.preview_active = True
            self._update_preview()
        else:
            self.status_var.set("Connection failed")
            self.conn = None

    def _disconnect(self):
        self.preview_active = False
        if self._preview_after_id:
            self.after_cancel(self._preview_after_id)
            self._preview_after_id = None
        if self.conn:
            self.conn.disconnect()
            self.conn = None
        self.status_var.set("Disconnected")
        self.connect_btn.config(text="Connect")
        self.canvas.delete("all")

    def _update_preview(self):
        """Grab and display a frame, schedule next update."""
        if not self.preview_active or not self.conn:
            return

        frame = self.conn.grab_frame()
        if frame is not None:
            # Resize for display
            h, w = frame.shape[:2]
            scale = min(480 / w, 300 / h)
            new_w, new_h = int(w * scale), int(h * scale)

            img = Image.fromarray(frame)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            self._photo = ImageTk.PhotoImage(img)

            self.canvas.delete("all")
            self.canvas.create_image(240, 150, image=self._photo, anchor="center")

        # Schedule next frame (~5 fps for preview)
        if self.preview_active:
            self._preview_after_id = self.after(200, self._update_preview)

    def _reset(self):
        """Reset to default settings."""
        self.exposure_var.set(DEFAULTS["exposure_time"])
        self.gain_var.set(DEFAULTS["gain"])
        self.gamma_var.set(int(DEFAULTS["gamma"] * 100))
        self._on_setting_change()

    def cleanup(self):
        """Clean up on app close."""
        self.preview_active = False
        if self._preview_after_id:
            self.after_cancel(self._preview_after_id)
        if self.conn:
            self.conn.disconnect()


class CameraSettingsApp:
    """Main application window."""

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Camera Settings")
        self.root.configure(bg="#1a1a1a")
        self.root.minsize(520, 400)

        # Style
        style = ttk.Style()
        style.theme_use("clam")
        style.configure(".", background="#1a1a1a", foreground="#e0e0e0",
                        fieldbackground="#2a2a2a", borderwidth=0)
        style.configure("TLabelframe", background="#1a1a1a", foreground="#ffffff")
        style.configure("TLabelframe.Label", background="#1a1a1a", foreground="#ffffff",
                        font=("", 12, "bold"))
        style.configure("TButton", background="#333333", foreground="#e0e0e0", padding=6)
        style.configure("TScale", background="#1a1a1a", troughcolor="#2a2a2a")
        style.map("TButton",
                   background=[("active", "#444444"), ("pressed", "#555555")])

        # Header
        header = ttk.Frame(self.root)
        header.pack(fill="x", padx=15, pady=(15, 5))
        ttk.Label(header, text="Camera Settings", font=("", 16, "bold")).pack(side="left")
        ttk.Label(header, text="Adjust exposure, gain, gamma with live preview",
                  foreground="#666666").pack(side="left", padx=(15, 0))

        # Detect cameras
        self.config = load_config()
        cameras = detect_cameras()

        if not cameras:
            ttk.Label(self.root, text="No Basler GigE cameras found.\n\nCheck network connection.",
                      foreground="#f87171", font=("", 14), justify="center").pack(expand=True)
            return

        # Map camera IPs to IDs from config
        config_cameras = self.config.get("cameras", [])
        ip_to_id = {}
        for cc in config_cameras:
            if cc.get("ip_address"):
                ip_to_id[cc["ip_address"]] = cc.get("id", cc.get("name", ""))

        # Camera panels
        panels_frame = ttk.Frame(self.root)
        panels_frame.pack(fill="both", expand=True, padx=15, pady=10)

        self.panels: list[CameraPanel] = []
        for i, cam in enumerate(cameras):
            cam_id = ip_to_id.get(cam["ip"], f"cam{i + 1}")
            panel = CameraPanel(panels_frame, cam, cam_id, self.config)
            panel.pack(side="left", fill="both", expand=True, padx=(0 if i == 0 else 5, 0))
            self.panels.append(panel)

        # Config path label
        ttk.Label(self.root, text=f"Config: {CONFIG_PATH}", foreground="#444444",
                  font=("", 9)).pack(pady=(0, 10))

        # Cleanup on close
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _on_close(self):
        for panel in self.panels:
            panel.cleanup()
        self.root.destroy()

    def run(self):
        self.root.mainloop()


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = CameraSettingsApp()
    app.run()
