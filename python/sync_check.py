"""
Per-camera sync verification from GigE Vision block IDs.

Every frame a GigE camera sends carries a block ID that counts up by one per
frame it acquired, starting at 1 after StartGrabbing. With one Arduino pulse
per frame, block ID N is trigger N, which makes two kinds of loss tell apart:

- A frame lost between camera and host (dropped packets, a full buffer pool)
  leaves a gap in the block IDs. Its position is known, so the frames that did
  arrive can still be matched to their triggers.
- A trigger the camera ignored (exposure longer than the frame period, a weak
  trigger signal) consumes no block ID, so it leaves no gap. Every later frame
  is then one trigger later than its block ID says, and nothing in the file
  shows where it happened. Only the Arduino's pulse count reveals it: the last
  block ID falls short of the number of pulses fired.

This module is pure logic (no pylon), so it can be tested without a camera.
"""

from typing import Any, Dict, List, Optional, Sequence

#: A 16-bit GVSP block ID counts 1..65535 and skips 0.
BLOCKID_WRAP = 65535

#: How many gap ranges a summary lists before it only counts them.
MAX_GAP_RANGES = 20

# Verdicts, from best to worst
EXACT = "exact"  # every trigger arrived: frame i is trigger i
RECOVERABLE = "recoverable"  # frames lost in transit: align by block ID
UNPROVEN = "unproven"  # triggers ignored or lost at the end: alignment unknown
EXTRA = "extra"  # more frames than pulses: noise or pulses before the start
NO_BLOCK_IDS = "no_block_ids"  # the camera reported no block IDs


def unwrap_block_ids(ids: Sequence[int]) -> List[int]:
    """Unwrap a camera's block IDs into trigger ordinals.

    A drop of more than half the 16-bit period is a wrap. A smaller drop
    cannot be one, because no camera falls 32767 frames behind itself, and is
    left in place for summarize_block_ids to report as out of order. 64-bit
    IDs (extended ID mode) never wrap and pass through unchanged.
    """
    out: List[int] = []
    offset = 0
    prev: Optional[int] = None
    for raw in ids:
        raw = int(raw)
        if prev is not None and raw < prev - BLOCKID_WRAP // 2:
            offset += BLOCKID_WRAP
        prev = raw
        out.append(raw + offset)
    return out


def summarize_block_ids(ids: Sequence[int]) -> Dict[str, Any]:
    """Frames, first and last ordinal, and the gaps in one camera's block IDs."""
    summary: Dict[str, Any] = {
        "frames": len(ids),
        "first_block_id": None,
        "last_block_id": None,
        "missing": 0,
        "gap_ranges": [],
        "out_of_order": 0,
        "has_block_ids": bool(ids) and all(int(b) > 0 for b in ids),
    }
    if not ids or not summary["has_block_ids"]:
        return summary

    b = unwrap_block_ids(ids)
    summary["first_block_id"] = b[0]
    summary["last_block_id"] = max(b)

    # Frames before the first one that arrived are missing too
    if b[0] > 1:
        summary["missing"] += b[0] - 1
        summary["gap_ranges"].append([1, b[0] - 1])

    for prev, cur in zip(b, b[1:]):
        if cur <= prev:
            summary["out_of_order"] += 1
        elif cur > prev + 1:
            summary["missing"] += cur - prev - 1
            if len(summary["gap_ranges"]) < MAX_GAP_RANGES:
                summary["gap_ranges"].append([prev + 1, cur - 1])
    return summary


def classify(summary: Dict[str, Any], triggers: Optional[int]) -> Dict[str, Any]:
    """Compare one camera's block IDs with the number of pulses fired.

    Returns the verdict and a one-line reason. ``triggers`` is the Arduino's
    STOPPED count, or None when it is unknown.
    """
    frames = summary["frames"]
    if frames == 0:
        if not triggers:
            return {"verdict": EXACT, "reason": "no triggers, no frames"}
        return {"verdict": UNPROVEN, "reason": f"no frames for {triggers} triggers"}
    if not summary["has_block_ids"]:
        if triggers is not None and frames == triggers:
            return {"verdict": EXACT, "reason": f"{frames} frames for {triggers} triggers"}
        return {
            "verdict": NO_BLOCK_IDS,
            "reason": "the camera reported no block IDs, so lost frames cannot be located",
        }

    last = summary["last_block_id"]
    missing = summary["missing"]
    if summary["out_of_order"]:
        return {
            "verdict": UNPROVEN,
            "reason": f"{summary['out_of_order']} block IDs out of order",
        }
    if triggers is None:
        if missing == 0:
            return {"verdict": EXACT, "reason": "no gaps (Arduino trigger count unknown)"}
        return {
            "verdict": RECOVERABLE,
            "reason": f"{missing} frames lost in transit (Arduino trigger count unknown)",
        }
    if last > triggers:
        return {
            "verdict": EXTRA,
            "reason": (
                f"block IDs reach {last} but only {triggers} pulses were fired: the camera "
                f"took frames from something other than this recording's pulses"
            ),
        }
    if last < triggers:
        return {
            "verdict": UNPROVEN,
            "reason": (
                f"{triggers - last} of {triggers} triggers produced no block ID: the camera "
                f"ignored them (or lost the last frames), so later frames may be shifted"
            ),
        }
    if missing == 0:
        return {"verdict": EXACT, "reason": f"{frames} frames for {triggers} triggers"}
    return {
        "verdict": RECOVERABLE,
        "reason": (
            f"{missing} of {triggers} frames lost in transit; align the others by block ID "
            f"(frames CSV)"
        ),
    }
