"""
Single camera manager for Basler cameras using PyPylon.

This module handles individual camera control, including:
- Camera detection and connection
- Hardware trigger configuration
- Frame capture (software and hardware triggered)
- Preview streaming
"""

import base64
import os
import sys
import time
import threading
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Optional, List, Dict, Any, Callable

import numpy as np
from PIL import Image
import cv2

from camera_types import (
    CameraSettings,
    CameraInfo,
    CameraStatus,
    CaptureResult,
    FrameInfo,
    TriggerMode,
)

# Try to import pypylon
try:
    from pypylon import pylon

    PYLON_AVAILABLE = True
except ImportError:
    PYLON_AVAILABLE = False
    pylon = None


class CameraManager:
    """
    Manages a single Basler camera.

    Supports both software-triggered preview and hardware-triggered capture.
    """

    def __init__(self, camera_id: str, settings: Optional[CameraSettings] = None):
        """
        Initialize camera manager.

        Args:
            camera_id: Unique identifier for this camera
            settings: Camera settings (optional, uses defaults if not provided)
        """
        self.camera_id = camera_id
        self.settings = settings or CameraSettings()
        self.camera: Optional[Any] = None  # pylon.InstantCamera
        self.is_open = False
        self.is_capturing = False
        self.frame_count = 0

        # Capture state
        self._capture_thread: Optional[threading.Thread] = None
        self._capture_active = threading.Event()
        self._output_dir: Optional[Path] = None
        self._frame_callback: Optional[Callable[[FrameInfo], None]] = None
        self._video_writer: Optional[cv2.VideoWriter] = None
        self._video_path: Optional[Path] = None
        self._capture_start_time: Optional[float] = None

    @staticmethod
    def detect_cameras() -> List[CameraInfo]:
        """
        Detect all available Basler GigE cameras on the network.

        Returns:
            List of CameraInfo objects for detected cameras
        """
        cameras = []

        if not PYLON_AVAILABLE:
            print("STATUS:PyPylon not available, returning mock camera only", flush=True)
            cameras.append(
                CameraInfo(
                    ip_address="mock",
                    model_name="Mock Camera",
                    serial_number="MOCK-001",
                    is_mock=True,
                )
            )
            return cameras

        try:
            tl_factory = pylon.TlFactory.GetInstance()
            devices = tl_factory.EnumerateDevices()

            for dev_info in devices:
                # Only include GigE cameras
                if dev_info.GetDeviceClass() == "BaslerGigE":
                    try:
                        camera_info = CameraInfo(
                            ip_address=dev_info.GetIpAddress(),
                            model_name=dev_info.GetModelName(),
                            serial_number=dev_info.GetSerialNumber(),
                            mac_address=dev_info.GetMacAddress(),
                            user_defined_name=dev_info.GetUserDefinedName(),
                        )
                        cameras.append(camera_info)
                    except Exception as e:
                        print(f"WARNING:Failed to get info for camera: {e}", flush=True)

        except Exception as e:
            print(f"ERROR:Camera detection failed: {e}", flush=True)

        return cameras

    def connect(self, ip_address: Optional[str] = None) -> bool:
        """
        Connect to the camera.

        Args:
            ip_address: Camera IP address (uses settings if not provided)

        Returns:
            True if connection successful
        """
        if not PYLON_AVAILABLE:
            print("ERROR:PyPylon not available", flush=True)
            return False

        ip = ip_address or self.settings.camera_ip
        if not ip:
            print("ERROR:No camera IP address specified", flush=True)
            return False

        try:
            tl_factory = pylon.TlFactory.GetInstance()
            tl = tl_factory.CreateTl("BaslerGigE")

            cam_info = tl.CreateDeviceInfo()
            cam_info.SetIpAddress(ip)

            self.camera = pylon.InstantCamera(tl_factory.CreateDevice(cam_info))
            self.camera.Open()

            self._configure_camera()

            self.is_open = True
            self.settings.camera_ip = ip
            print(f"STATUS:Camera {self.camera_id} connected to {ip}", flush=True)
            return True

        except Exception as e:
            print(f"ERROR:Failed to connect camera {self.camera_id}: {e}", flush=True)
            return False

    def disconnect(self) -> None:
        """Disconnect from the camera."""
        if self.is_capturing:
            self.stop_capture()

        if self.camera and self.is_open:
            try:
                if self.camera.IsGrabbing():
                    self.camera.StopGrabbing()
                self.camera.Close()
            except Exception as e:
                print(f"ERROR:Error closing camera {self.camera_id}: {e}", flush=True)
            finally:
                self.is_open = False
                print(f"STATUS:Camera {self.camera_id} disconnected", flush=True)

    def _configure_camera(self) -> None:
        """Configure camera parameters based on settings."""
        if not self.camera:
            return

        try:
            # Configure ROI first (must be done before other settings)
            self._configure_roi()

            # Exposure time
            self.camera.ExposureTimeAbs.Value = self.settings.exposure_time

            # Gain
            self.camera.GainAuto.Value = "Off"
            self.camera.GainRaw.Value = self.settings.gain

            # Gamma
            self.camera.GammaEnable.Value = True
            self.camera.GammaSelector.Value = "User"
            self.camera.Gamma.Value = self.settings.gamma

            print(f"STATUS:Camera {self.camera_id} configured", flush=True)

        except Exception as e:
            print(f"WARNING:Some settings not supported: {e}", flush=True)

    def _configure_roi(self) -> None:
        """Configure camera Region of Interest (ROI) for reduced bandwidth."""
        if not self.camera:
            return

        try:
            # Get sensor max dimensions
            max_width = self.camera.WidthMax.Value
            max_height = self.camera.HeightMax.Value

            # Determine target ROI size
            roi_width = self.settings.roi_width or max_width
            roi_height = self.settings.roi_height or max_height

            # Clamp to max dimensions
            roi_width = min(roi_width, max_width)
            roi_height = min(roi_height, max_height)

            # Calculate offsets (center if not specified)
            if self.settings.roi_offset_x is not None:
                offset_x = self.settings.roi_offset_x
            else:
                offset_x = (max_width - roi_width) // 2

            if self.settings.roi_offset_y is not None:
                offset_y = self.settings.roi_offset_y
            else:
                offset_y = (max_height - roi_height) // 2

            # Apply ROI settings (order matters!)
            # First reset to max to avoid constraint violations
            self.camera.OffsetX.Value = 0
            self.camera.OffsetY.Value = 0
            self.camera.Width.Value = max_width
            self.camera.Height.Value = max_height

            # Now set the actual ROI
            self.camera.Width.Value = roi_width
            self.camera.Height.Value = roi_height
            self.camera.OffsetX.Value = offset_x
            self.camera.OffsetY.Value = offset_y

            print(f"STATUS:Camera {self.camera_id} ROI set to {roi_width}x{roi_height} at ({offset_x},{offset_y})", flush=True)

        except Exception as e:
            print(f"WARNING:Failed to set ROI: {e}", flush=True)

    def configure_hardware_trigger(self) -> None:
        """Configure camera for hardware trigger mode (FrameStart)."""
        if not self.camera or not self.is_open:
            print("ERROR:Camera not connected", flush=True)
            return

        try:
            self.camera.TriggerSelector.Value = "FrameStart"
            self.camera.TriggerMode.Value = "On"
            self.camera.TriggerSource.Value = self.settings.trigger_source
            self.camera.TriggerActivation.Value = self.settings.trigger_activation.value

            self.settings.trigger_mode = TriggerMode.HARDWARE
            print(f"STATUS:Camera {self.camera_id} hardware trigger configured", flush=True)

        except Exception as e:
            print(f"ERROR:Failed to configure hardware trigger: {e}", flush=True)

    def configure_software_trigger(self) -> None:
        """Configure camera for software trigger mode (free-running)."""
        if not self.camera or not self.is_open:
            print("ERROR:Camera not connected", flush=True)
            return

        try:
            self.camera.TriggerMode.Value = "Off"
            self.settings.trigger_mode = TriggerMode.SOFTWARE
            print(f"STATUS:Camera {self.camera_id} software trigger configured", flush=True)

        except Exception as e:
            print(f"ERROR:Failed to configure software trigger: {e}", flush=True)

    def grab_frame(self) -> Optional[np.ndarray]:
        """
        Grab a single frame (software trigger).

        Temporarily switches to free-running mode if the camera is in
        hardware trigger mode, then restores the previous mode afterwards.

        Returns:
            Image as numpy array, or None on failure
        """
        if not self.is_open or not self.camera:
            print("ERROR:Camera not connected", flush=True)
            return None

        if self.is_capturing:
            print("ERROR:Cannot grab preview while capturing", flush=True)
            return None

        # Remember current trigger mode and switch to software if needed
        was_hardware = self.settings.trigger_mode == TriggerMode.HARDWARE

        try:
            # Ensure camera is not grabbing before changing trigger mode
            if self.camera.IsGrabbing():
                self.camera.StopGrabbing()

            if was_hardware:
                self.configure_software_trigger()

            self.camera.StartGrabbingMax(1)

            grab_result = self.camera.RetrieveResult(
                5000, pylon.TimeoutHandling_ThrowException
            )

            if grab_result.GrabSucceeded():
                img = grab_result.Array.copy()
                grab_result.Release()
                return img
            else:
                grab_result.Release()
                print("ERROR:Frame grab failed", flush=True)
                return None

        except Exception as e:
            print(f"ERROR:Frame grab error: {e}", flush=True)
            return None

        finally:
            if self.camera.IsGrabbing():
                self.camera.StopGrabbing()
            # Restore hardware trigger mode if it was active before
            if was_hardware:
                self.configure_hardware_trigger()

    def grab_frame_base64(self, format: str = "jpeg", quality: int = 85) -> Optional[str]:
        """
        Grab a single frame and return as base64 data URI.

        Args:
            format: Image format ('jpeg' or 'png')
            quality: JPEG quality (1-100)

        Returns:
            Base64 data URI string, or None on failure
        """
        img = self.grab_frame()
        if img is None:
            return None

        try:
            buffer = BytesIO()
            pil_img = Image.fromarray(img)

            if format.lower() == "jpeg":
                pil_img.save(buffer, format="JPEG", quality=quality)
                mime_type = "image/jpeg"
            else:
                pil_img.save(buffer, format="PNG", compress_level=1)
                mime_type = "image/png"

            base64_data = base64.b64encode(buffer.getvalue()).decode("utf-8")
            return f"data:{mime_type};base64,{base64_data}"

        except Exception as e:
            print(f"ERROR:Image encoding error: {e}", flush=True)
            return None

    def start_capture(
        self,
        output_dir: str,
        frame_callback: Optional[Callable[[FrameInfo], None]] = None,
        fps: int = 120,
    ) -> bool:
        """
        Start hardware-triggered capture session.

        Args:
            output_dir: Directory to save captured frames
            frame_callback: Optional callback for each captured frame
            fps: Frame rate for video file (default 120)

        Returns:
            True if capture started successfully
        """
        if not self.is_open or not self.camera:
            print("ERROR:Camera not connected", flush=True)
            return False

        if self.is_capturing:
            print("ERROR:Already capturing", flush=True)
            return False

        # Create output directory
        self._output_dir = Path(output_dir)
        self._output_dir.mkdir(parents=True, exist_ok=True)

        self._frame_callback = frame_callback
        self.frame_count = 0
        self._capture_start_time = time.time()

        # Configure for hardware trigger
        self.configure_hardware_trigger()

        # Get camera resolution for video writer
        width = self.camera.Width.Value
        height = self.camera.Height.Value

        # Create video file path (AVI with MJPG codec for fast encoding)
        self._video_path = self._output_dir / f"{self.camera_id}.avi"

        # Initialize video writer
        # Use MJPG codec - faster encoding than mp4v, good for high fps
        fourcc = cv2.VideoWriter_fourcc(*'MJPG')
        self._video_writer = cv2.VideoWriter(
            str(self._video_path), fourcc, fps, (width, height), isColor=False
        )

        if not self._video_writer.isOpened():
            print(f"ERROR:Failed to create video writer for {self._video_path}", flush=True)
            return False

        print(f"STATUS:Video recording to {self._video_path} ({width}x{height} @ {fps}fps)", flush=True)

        # Start grabbing
        self.camera.StartGrabbing(pylon.GrabStrategy_OneByOne)

        # Start capture thread
        self._capture_active.set()
        self._capture_thread = threading.Thread(
            target=self._capture_loop,
            daemon=True,
        )
        self._capture_thread.start()

        self.is_capturing = True
        print(f"STATUS:Camera {self.camera_id} capture started", flush=True)
        return True

    def _capture_loop(self) -> None:
        """Background thread for capturing frames."""
        while self._capture_active.is_set():
            try:
                # Wait for hardware trigger with timeout
                grab_result = self.camera.RetrieveResult(
                    1000, pylon.TimeoutHandling_Return
                )

                if grab_result and grab_result.GrabSucceeded():
                    self.frame_count += 1
                    timestamp = time.time()

                    # Get frame as numpy array (must copy before Release)
                    frame = grab_result.Array.copy()
                    width = grab_result.Width
                    height = grab_result.Height
                    grab_result.Release()

                    # Write frame to video
                    if self._video_writer and self._video_writer.isOpened():
                        self._video_writer.write(frame)

                    # Notify callback
                    if self._frame_callback:
                        frame_info = FrameInfo(
                            camera_id=self.camera_id,
                            frame_number=self.frame_count,
                            file_path=str(self._video_path) if self._video_path else "",
                            timestamp=timestamp,
                            width=width,
                            height=height,
                        )
                        self._frame_callback(frame_info)

                elif grab_result:
                    grab_result.Release()

            except Exception as e:
                if self._capture_active.is_set():
                    print(f"ERROR:Capture error on {self.camera_id}: {e}", flush=True)

        print(f"STATUS:Camera {self.camera_id} capture loop ended", flush=True)

    def stop_capture(self) -> CaptureResult:
        """
        Stop capture session.

        Returns:
            CaptureResult with session summary
        """
        if not self.is_capturing:
            return CaptureResult(
                camera_id=self.camera_id,
                success=False,
                frame_count=0,
                output_dir="",
                error="Not capturing",
            )

        # Signal thread to stop
        self._capture_active.clear()

        # Wait for thread
        if self._capture_thread:
            self._capture_thread.join(timeout=2.0)
            self._capture_thread = None

        # Stop grabbing
        if self.camera and self.camera.IsGrabbing():
            self.camera.StopGrabbing()

        # Calculate duration and FPS
        duration = 0.0
        actual_fps = 0.0
        if self._capture_start_time:
            duration = time.time() - self._capture_start_time
            if duration > 0:
                actual_fps = self.frame_count / duration

        # Close video writer
        if self._video_writer:
            self._video_writer.release()
            self._video_writer = None
            print(f"STATUS:Video saved to {self._video_path}", flush=True)

        self.is_capturing = False

        result = CaptureResult(
            camera_id=self.camera_id,
            success=True,
            frame_count=self.frame_count,
            output_dir=str(self._video_path) if self._video_path else str(self._output_dir) if self._output_dir else "",
            duration_seconds=duration,
        )

        print(
            f"STATUS:Camera {self.camera_id} capture stopped, frames: {self.frame_count}, "
            f"duration: {duration:.2f}s, fps: {actual_fps:.1f}",
            flush=True,
        )

        return result

    def get_status(self) -> CameraStatus:
        """Get current camera status."""
        return CameraStatus(
            camera_id=self.camera_id,
            connected=self.is_open,
            capturing=self.is_capturing,
            frame_count=self.frame_count,
            trigger_mode=self.settings.trigger_mode,
        )

    def update_settings(self, **kwargs) -> None:
        """
        Update camera settings.

        Args:
            **kwargs: Settings to update (exposure_time, gain, gamma, etc.)
        """
        for key, value in kwargs.items():
            if hasattr(self.settings, key):
                setattr(self.settings, key, value)

        # Re-configure if connected
        if self.is_open and not self.is_capturing:
            self._configure_camera()
