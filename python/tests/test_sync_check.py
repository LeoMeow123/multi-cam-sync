"""Tests for sync_check: block-ID summaries and per-camera verdicts."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sync_check import (  # noqa: E402
    BLOCKID_WRAP,
    EXACT,
    EXTRA,
    NO_BLOCK_IDS,
    RECOVERABLE,
    UNPROVEN,
    classify,
    summarize_block_ids,
    unwrap_block_ids,
)


def verdict(ids, triggers):
    return classify(summarize_block_ids(ids), triggers)["verdict"]


def test_every_trigger_arrived():
    assert verdict(list(range(1, 101)), 100) == EXACT


def test_transit_loss_is_recoverable():
    ids = [i for i in range(1, 101) if i not in (10, 50, 51)]
    s = summarize_block_ids(ids)
    assert s["missing"] == 3
    assert s["gap_ranges"] == [[10, 10], [50, 51]]
    assert classify(s, 100)["verdict"] == RECOVERABLE


def test_lost_first_frame_counts_as_a_gap():
    s = summarize_block_ids(list(range(3, 101)))
    assert s["missing"] == 2
    assert s["gap_ranges"][0] == [1, 2]
    assert classify(s, 100)["verdict"] == RECOVERABLE


def test_ignored_triggers_are_unproven():
    # The camera ignored 5 triggers: no gap, but the last ID falls short
    assert verdict(list(range(1, 96)), 100) == UNPROVEN


def test_more_frames_than_pulses():
    assert verdict(list(range(1, 106)), 100) == EXTRA


def test_equal_counts_with_different_losses_are_not_exact():
    # The old check called this synced: same frame count on both cameras
    cam1 = [i for i in range(1, 101) if i != 20]
    cam2 = [i for i in range(1, 101) if i != 80]
    assert len(cam1) == len(cam2)
    assert verdict(cam1, 100) == RECOVERABLE
    assert verdict(cam2, 100) == RECOVERABLE


def test_16bit_wrap():
    raw = list(range(65530, BLOCKID_WRAP + 1)) + list(range(1, 6))
    b = unwrap_block_ids(raw)
    assert b == list(range(65530, 65530 + len(raw)))


def test_wrap_with_recording_from_start():
    n = BLOCKID_WRAP + 10
    raw = [((i - 1) % BLOCKID_WRAP) + 1 for i in range(1, n + 1)]
    assert verdict(raw, n) == EXACT


def test_out_of_order_is_unproven():
    assert verdict([1, 2, 4, 3, 5], 5) == UNPROVEN


def test_no_block_ids():
    assert verdict([-1] * 100, 100) == EXACT  # counts match, nothing more to know
    assert verdict([-1] * 99, 100) == NO_BLOCK_IDS


def test_unknown_trigger_count():
    assert verdict(list(range(1, 11)), None) == EXACT
    assert verdict([1, 2, 4], None) == RECOVERABLE


def test_empty():
    s = summarize_block_ids([])
    assert s["frames"] == 0
    assert classify(s, 0)["verdict"] == EXACT
    assert classify(s, 10)["verdict"] == UNPROVEN
