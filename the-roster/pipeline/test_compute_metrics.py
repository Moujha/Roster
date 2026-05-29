"""Tests for compute_metrics.py — run with: pytest test_compute_metrics.py -v"""
import pytest
from compute_metrics import (
    classify_tier,
    compute_daily_streams,
    compute_stream_velocity_7d,
    compute_listener_growth_28d,
    compute_catalog_depth,
    compute_momentum,
)


# ── classify_tier ─────────────────────────────────────────────────────────────

def test_classify_tier_underground():
    assert classify_tier(0) == "underground"
    assert classify_tier(49_999) == "underground"
    assert classify_tier(50_000) == "underground"  # boundary: 0–50k inclusive

def test_classify_tier_emerging():
    assert classify_tier(50_001) == "emerging"
    assert classify_tier(275_000) == "emerging"
    assert classify_tier(500_000) == "emerging"

def test_classify_tier_rising():
    assert classify_tier(500_001) == "rising"
    assert classify_tier(1_000_000) == "rising"
    assert classify_tier(2_000_000) == "rising"

def test_classify_tier_established():
    assert classify_tier(2_000_001) == "established"
    assert classify_tier(5_000_000) == "established"
    assert classify_tier(10_000_000) == "established"

def test_classify_tier_major():
    assert classify_tier(10_000_001) == "major"
    assert classify_tier(50_000_000) == "major"


# ── compute_daily_streams ─────────────────────────────────────────────────────

def test_compute_daily_streams_basic():
    today = [{"track_id": "a", "playcount": 1000}, {"track_id": "b", "playcount": 500}]
    yesterday = [{"track_id": "a", "playcount": 900}, {"track_id": "b", "playcount": 450}]
    assert compute_daily_streams(today, yesterday) == 150  # 100 + 50

def test_compute_daily_streams_negative_delta_clamped():
    today = [{"track_id": "a", "playcount": 800}]
    yesterday = [{"track_id": "a", "playcount": 900}]
    assert compute_daily_streams(today, yesterday) == 0  # negative clamped to 0

def test_compute_daily_streams_no_yesterday():
    today = [{"track_id": "a", "playcount": 1000}]
    assert compute_daily_streams(today, []) is None

def test_compute_daily_streams_no_matching_tracks():
    today = [{"track_id": "a", "playcount": 1000}]
    yesterday = [{"track_id": "z", "playcount": 800}]
    # No track_ids in common — returns None (no reliable delta)
    assert compute_daily_streams(today, yesterday) is None

def test_compute_daily_streams_partial_overlap():
    today = [{"track_id": "a", "playcount": 100}, {"track_id": "b", "playcount": 200}]
    yesterday = [{"track_id": "a", "playcount": 80}]
    # Only track 'a' matches; track 'b' is new — counted only where overlap exists
    assert compute_daily_streams(today, yesterday) == 20


# ── compute_stream_velocity_7d ────────────────────────────────────────────────

def test_compute_stream_velocity_7d_positive():
    result = compute_stream_velocity_7d(110, 100)
    assert abs(result - 10.0) < 0.01

def test_compute_stream_velocity_7d_negative():
    result = compute_stream_velocity_7d(90, 100)
    assert abs(result - (-10.0)) < 0.01

def test_compute_stream_velocity_7d_zero_prev():
    assert compute_stream_velocity_7d(100, 0) is None

def test_compute_stream_velocity_7d_both_zero():
    assert compute_stream_velocity_7d(0, 0) is None

def test_compute_stream_velocity_7d_zero_current():
    result = compute_stream_velocity_7d(0, 100)
    assert abs(result - (-100.0)) < 0.01


# ── compute_listener_growth_28d ───────────────────────────────────────────────

def test_compute_listener_growth_28d_positive():
    result = compute_listener_growth_28d(110_000, 100_000)
    assert abs(result - 10.0) < 0.01

def test_compute_listener_growth_28d_negative():
    result = compute_listener_growth_28d(80_000, 100_000)
    assert abs(result - (-20.0)) < 0.01

def test_compute_listener_growth_28d_zero_base():
    assert compute_listener_growth_28d(100_000, 0) is None

def test_compute_listener_growth_28d_no_change():
    result = compute_listener_growth_28d(100_000, 100_000)
    assert result == 0.0


# ── compute_catalog_depth ─────────────────────────────────────────────────────

def test_compute_catalog_depth_uniform():
    # 10 tracks all with same playcount → HHI = 10*(0.1^2) = 0.1 → depth = 0.9
    tracks = [{"track_id": str(i), "playcount": 100} for i in range(10)]
    result = compute_catalog_depth(tracks)
    assert abs(result - 0.9) < 0.0001

def test_compute_catalog_depth_single_track():
    # All streams on one track → HHI = 1 → depth = 0
    tracks = [{"track_id": "a", "playcount": 1000}]
    result = compute_catalog_depth(tracks)
    assert result == 0.0

def test_compute_catalog_depth_empty():
    assert compute_catalog_depth([]) is None

def test_compute_catalog_depth_zero_total():
    tracks = [{"track_id": "a", "playcount": 0}, {"track_id": "b", "playcount": 0}]
    assert compute_catalog_depth(tracks) is None

def test_compute_catalog_depth_two_equal():
    tracks = [{"track_id": "a", "playcount": 500}, {"track_id": "b", "playcount": 500}]
    result = compute_catalog_depth(tracks)
    # HHI = 2*(0.5^2) = 0.5 → depth = 0.5
    assert abs(result - 0.5) < 0.0001


# ── compute_momentum ──────────────────────────────────────────────────────────

def test_compute_momentum_sanity_check():
    # GDD sanity check: compute_momentum(50, 28, 0.5) == 53.5
    # v_norm = clamp((50+50)/2, 0, 100) = 50
    # g_norm = clamp((28+20)/0.8, 0, 100) = clamp(60, 0, 100) = 60
    # d_norm = 0.5 * 100 = 50
    # momentum = clamp(50*0.4 + 60*0.35 + 50*0.25, 0, 100)
    #          = clamp(20 + 21 + 12.5, 0, 100) = 53.5
    result = compute_momentum(50.0, 28.0, 0.5)
    assert abs(result - 53.5) < 0.01

def test_compute_momentum_any_none_returns_none():
    assert compute_momentum(None, 28.0, 0.5) is None
    assert compute_momentum(50.0, None, 0.5) is None
    assert compute_momentum(50.0, 28.0, None) is None
    assert compute_momentum(None, None, None) is None

def test_compute_momentum_clamps_to_100():
    # velocity=200, growth=100, depth=1.0 — all norms should max out
    result = compute_momentum(200.0, 100.0, 1.0)
    assert result == 100.0

def test_compute_momentum_clamps_to_0():
    # velocity=-100, growth=-50, depth=0
    result = compute_momentum(-100.0, -50.0, 0.0)
    assert result == 0.0

def test_compute_momentum_all_zeros():
    # v_norm = clamp((0+50)/2, 0, 100) = 25
    # g_norm = clamp((0+20)/0.8, 0, 100) = 25
    # d_norm = 0
    # momentum = 25*0.4 + 25*0.35 + 0*0.25 = 10 + 8.75 = 18.75
    result = compute_momentum(0.0, 0.0, 0.0)
    assert abs(result - 18.75) < 0.01
