"""CameraManager capture path against a fake pylon camera: block IDs reach the
frames CSV, frames in flight at stop are drained, and the verdict follows the
Arduino's pulse count."""

import csv
import queue
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

cv2 = pytest.importorskip("cv2")
import camera_manager  # noqa: E402


class FakeTimeout(Exception):
    pass


FAKE_PYLON = SimpleNamespace(
    TimeoutException=FakeTimeout,
    TimeoutHandling_ThrowException=1,
    GrabStrategy_OneByOne=0,
)


class Node:
    def __init__(self, value=None):
        self.Value = value


class FakeResult:
    def __init__(self, block_id, ok=True, w=8, h=6):
        self.BlockID = block_id
        self.TimeStamp = block_id * 8_333_000
        self.Width, self.Height = w, h
        self.Array = (block_id % 256) * __import__("numpy").ones((h, w), dtype="uint8")
        self._ok = ok

    def GrabSucceeded(self):
        return self._ok

    def Release(self):
        pass


class FakeCamera:
    """Delivers queued results; a timeout when the queue is empty."""

    def __init__(self, max_fps=500.0):
        self.results: "queue.Queue[FakeResult]" = queue.Queue()
        self.grabbing = False
        self.Width, self.Height = Node(8), Node(6)
        self.ResultingFrameRate = Node(max_fps)
        for name in ("TriggerSelector", "TriggerMode", "TriggerSource", "TriggerActivation"):
            setattr(self, name, Node())

    def GetNodeMap(self):
        return SimpleNamespace(GetNode=lambda name: None)

    def GetStreamGrabberNodeMap(self):
        return SimpleNamespace(GetNode=lambda name: None)

    def StartGrabbing(self, strategy):
        self.grabbing = True

    def StopGrabbing(self):
        self.grabbing = False

    def IsGrabbing(self):
        return self.grabbing

    def RetrieveResult(self, timeout_ms, handling):
        try:
            return self.results.get(timeout=timeout_ms / 1000)
        except queue.Empty:
            raise FakeTimeout()


@pytest.fixture
def cam(monkeypatch):
    monkeypatch.setattr(camera_manager, "pylon", FAKE_PYLON)
    cm = camera_manager.CameraManager("cam1")
    cm.camera = FakeCamera()
    cm.is_open = True
    cm.settings.exposure_time = 3000
    return cm


def read_csv(path):
    with open(path) as f:
        return list(csv.DictReader(f))


def test_frames_in_flight_are_drained_and_recorded(cam, tmp_path):
    assert cam.start_capture(str(tmp_path), fps=120)
    for bid in range(1, 51):
        if bid != 25:  # lost in transit
            cam.camera.results.put(FakeResult(bid))
    cam.camera.results.put(FakeResult(51, ok=False))  # failed grab: a gap too
    time.sleep(0.05)
    # Frames that arrive after stop is asked for are still kept
    for bid in range(52, 61):
        cam.camera.results.put(FakeResult(bid))

    result = cam.stop_capture(trigger_count=60)

    assert result.frame_count == 58
    rows = read_csv(result.frames_csv)
    assert [int(r["block_id"]) for r in rows][:3] == [1, 2, 3]
    assert len(rows) == 58
    assert result.block_ids["missing"] == 2
    assert result.block_ids["gap_ranges"] == [[25, 25], [51, 51]]
    assert result.block_ids["failed_grabs"] == 1
    assert result.verdict == "recoverable"


def test_ignored_triggers_are_unproven(cam, tmp_path):
    assert cam.start_capture(str(tmp_path), fps=120)
    for bid in range(1, 96):
        cam.camera.results.put(FakeResult(bid))
    result = cam.stop_capture(trigger_count=100)
    assert result.frame_count == 95
    assert result.verdict == "unproven"


def test_exact(cam, tmp_path):
    assert cam.start_capture(str(tmp_path), fps=120)
    for bid in range(1, 101):
        cam.camera.results.put(FakeResult(bid))
    assert cam.stop_capture(trigger_count=100).verdict == "exact"


def test_refuses_a_rate_the_camera_cannot_take(cam, tmp_path, capsys):
    cam.camera.ResultingFrameRate.Value = 100.0
    assert not cam.start_capture(str(tmp_path), fps=120)
    assert "at most 100.0 fps" in capsys.readouterr().out
    assert not cam.is_capturing


def test_refuses_exposure_longer_than_period_without_resulting_rate(cam, tmp_path):
    del cam.camera.ResultingFrameRate
    cam.settings.exposure_time = 9000  # > 8333 us at 120 fps
    assert not cam.start_capture(str(tmp_path), fps=120)
