"""
IPC Handler for Camera Sync System.

Handles stdin-based JSON commands and outputs responses via stdout
using a line-based protocol for communication with the Electron main process.

Protocol:
  Input (stdin): Line-delimited JSON commands
  Output (stdout): Protocol messages with prefixes:
    - STATUS:<message> - Status updates
    - ERROR:<message> - Error messages
    - DATA:<json> - JSON data responses
    - PREVIEW:<base64_data_uri> - Preview frame
    - FRAME_SAVED:<json> - Frame saved notification
"""

import json
import sys
from dataclasses import asdict
from typing import Any, Dict, Optional

from camera_manager import CameraManager
from camera_types import CameraSettings, FrameInfo


# ============================================================================
# Protocol Functions
# ============================================================================


def send_status(message: str) -> None:
    """Send a status message."""
    print(f"STATUS:{message}", flush=True)


def send_error(message: str) -> None:
    """Send an error message."""
    print(f"ERROR:{message}", flush=True)


def send_data(data: Dict[str, Any]) -> None:
    """Send JSON data response."""
    print(f"DATA:{json.dumps(data)}", flush=True)


def send_preview(data_uri: str) -> None:
    """Send preview frame."""
    print(f"PREVIEW:{data_uri}", flush=True)


def send_frame_saved(frame_info: FrameInfo) -> None:
    """Send frame saved notification."""
    print(f"FRAME_SAVED:{json.dumps(asdict(frame_info))}", flush=True)


# ============================================================================
# Command Handler
# ============================================================================


class IPCHandler:
    """Handles IPC commands for a single camera process."""

    def __init__(self):
        self.camera: Optional[CameraManager] = None
        self.camera_id: Optional[str] = None

    def handle_command(self, cmd: Dict[str, Any]) -> None:
        """Route and handle incoming commands."""
        command = cmd.get("command", "")

        try:
            if command == "ping":
                send_data({"status": "ok", "message": "pong"})

            elif command == "version":
                send_data({"version": "1.0.0"})

            elif command == "detect_cameras":
                self._handle_detect_cameras()

            elif command == "init":
                self._handle_init(cmd)

            elif command == "connect":
                self._handle_connect(cmd)

            elif command == "disconnect":
                self._handle_disconnect()

            elif command == "configure":
                self._handle_configure(cmd)

            elif command == "get_preview":
                self._handle_get_preview(cmd)

            elif command == "start_capture":
                self._handle_start_capture(cmd)

            elif command == "stop_capture":
                self._handle_stop_capture()

            elif command == "status":
                self._handle_status()

            else:
                send_error(f"Unknown command: {command}")

        except Exception as e:
            send_error(f"Command error: {e}")

    def _handle_detect_cameras(self) -> None:
        """Handle detect_cameras command."""
        cameras = CameraManager.detect_cameras()
        send_data({
            "cameras": [asdict(c) for c in cameras],
            "count": len(cameras),
        })

    def _handle_init(self, cmd: Dict[str, Any]) -> None:
        """Handle init command - create camera manager."""
        camera_id = cmd.get("camera_id", "cam1")
        camera_ip = cmd.get("camera_ip")

        self.camera_id = camera_id
        settings = CameraSettings(camera_ip=camera_ip, camera_id=camera_id)
        self.camera = CameraManager(camera_id, settings)

        send_data({"success": True, "camera_id": camera_id})

    def _handle_connect(self, cmd: Dict[str, Any]) -> None:
        """Handle connect command."""
        if not self.camera:
            send_error("Camera not initialized. Call init first.")
            return

        camera_ip = cmd.get("camera_ip", self.camera.settings.camera_ip)
        success = self.camera.connect(camera_ip)
        send_data({"success": success, "connected": success})

    def _handle_disconnect(self) -> None:
        """Handle disconnect command."""
        if not self.camera:
            send_data({"success": True, "connected": False})
            return

        self.camera.disconnect()
        send_data({"success": True, "connected": False})

    def _handle_configure(self, cmd: Dict[str, Any]) -> None:
        """Handle configure command."""
        if not self.camera:
            send_error("Camera not initialized")
            return

        settings = cmd.get("settings", {})
        self.camera.update_settings(**settings)
        send_data({"success": True, "configured": True})

    def _handle_get_preview(self, cmd: Dict[str, Any]) -> None:
        """Handle get_preview command - grab single frame for preview."""
        if not self.camera or not self.camera.is_open:
            send_error("Camera not connected")
            return

        format = cmd.get("format", "jpeg")
        quality = cmd.get("quality", 85)

        data_uri = self.camera.grab_frame_base64(format=format, quality=quality)
        if data_uri:
            send_preview(data_uri)
        else:
            send_error("Failed to grab preview frame")

    def _handle_start_capture(self, cmd: Dict[str, Any]) -> None:
        """Handle start_capture command."""
        if not self.camera or not self.camera.is_open:
            send_error("Camera not connected")
            return

        output_dir = cmd.get("output_dir")
        if not output_dir:
            send_error("output_dir is required")
            return

        # Frame callback to notify main process
        def on_frame(frame_info: FrameInfo) -> None:
            send_frame_saved(frame_info)

        success = self.camera.start_capture(output_dir, frame_callback=on_frame)
        send_data({"success": success, "capturing": success})

    def _handle_stop_capture(self) -> None:
        """Handle stop_capture command."""
        if not self.camera:
            send_error("Camera not initialized")
            return

        result = self.camera.stop_capture()
        send_data({
            "success": result.success,
            "frame_count": result.frame_count,
            "output_dir": result.output_dir,
            "error": result.error,
        })

    def _handle_status(self) -> None:
        """Handle status command."""
        if not self.camera:
            send_data({
                "success": True,
                "initialized": False,
                "connected": False,
                "capturing": False,
            })
            return

        status = self.camera.get_status()
        send_data({
            "success": True,
            "initialized": True,
            "camera_id": status.camera_id,
            "connected": status.connected,
            "capturing": status.capturing,
            "frame_count": status.frame_count,
            "trigger_mode": status.trigger_mode.value,
        })


# ============================================================================
# Main IPC Loop
# ============================================================================


def run_ipc_loop() -> None:
    """Main IPC loop - reads commands from stdin and processes them."""
    handler = IPCHandler()
    send_status("IPC handler ready")

    try:
        for line in sys.stdin:
            line = line.strip()

            if not line:
                continue

            try:
                cmd = json.loads(line)
                handler.handle_command(cmd)
            except json.JSONDecodeError as e:
                send_error(f"Invalid JSON: {e}")
            except Exception as e:
                send_error(f"Command error: {e}")

    except KeyboardInterrupt:
        send_status("Shutting down (KeyboardInterrupt)")
    except Exception as e:
        send_error(f"Fatal error: {e}")


if __name__ == "__main__":
    run_ipc_loop()
