"""
Camera type definitions and data classes.
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class TriggerMode(Enum):
    SOFTWARE = "software"
    HARDWARE = "hardware"


class TriggerActivation(Enum):
    RISING_EDGE = "RisingEdge"
    FALLING_EDGE = "FallingEdge"
    LEVEL_HIGH = "LevelHigh"
    LEVEL_LOW = "LevelLow"


@dataclass
class CameraSettings:
    """Camera configuration settings."""

    exposure_time: float = 8000.0  # microseconds
    gain: int = 0  # raw gain value
    gamma: float = 1.0  # gamma correction

    # Trigger settings
    trigger_mode: TriggerMode = TriggerMode.HARDWARE
    trigger_source: str = "Line1"  # GPIO input line
    trigger_activation: TriggerActivation = TriggerActivation.RISING_EDGE

    # Optional camera identification
    camera_ip: Optional[str] = None
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None


@dataclass
class CameraInfo:
    """Information about a detected camera."""

    ip_address: str
    model_name: str
    serial_number: str
    mac_address: str = ""
    user_defined_name: str = ""
    friendly_name: str = ""
    is_mock: bool = False

    def __post_init__(self):
        if not self.friendly_name:
            if self.user_defined_name:
                self.friendly_name = f"{self.user_defined_name} - {self.model_name} ({self.ip_address})"
            else:
                self.friendly_name = f"{self.model_name} ({self.ip_address})"


@dataclass
class CameraStatus:
    """Current camera status."""

    camera_id: str
    connected: bool = False
    capturing: bool = False
    frame_count: int = 0
    trigger_mode: TriggerMode = TriggerMode.SOFTWARE
    last_error: Optional[str] = None


@dataclass
class CaptureResult:
    """Result of a capture session."""

    camera_id: str
    success: bool
    frame_count: int
    output_dir: str
    start_time: str = ""
    end_time: str = ""
    duration_seconds: float = 0.0
    error: Optional[str] = None


@dataclass
class FrameInfo:
    """Information about a captured frame."""

    camera_id: str
    frame_number: int
    file_path: str
    timestamp: float  # Unix timestamp
    width: int = 0
    height: int = 0
