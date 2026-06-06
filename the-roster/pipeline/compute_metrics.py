"""Metric computation functions for the Roster data pipeline.

All functions that can return None do so when inputs are insufficient
(e.g. no previous day data, zero-division guards). Callers must handle None
before writing to artist_stats_daily.
"""
from __future__ import annotations


# ── Tier classification ───────────────────────────────────────────────────────

_TIER_THRESHOLDS: list[tuple[int, str]] = [
    (50_000,     "underground"),
    (500_000,    "emerging"),
    (2_000_000,  "rising"),
    (10_000_000, "established"),
]


def classify_tier(monthly_listeners: int) -> str:
    """Return the artist tier string for a given monthly listener count.

    Thresholds (inclusive upper bound):
      underground : 0 – 50,000
      emerging    : 50,001 – 500,000
      rising      : 500,001 – 2,000,000
      established : 2,000,001 – 10,000,000
      major       : 10,000,001+
    """
    for threshold, tier in _TIER_THRESHOLDS:
        if monthly_listeners <= threshold:
            return tier
    return "major"


# ── Stream delta ──────────────────────────────────────────────────────────────

def compute_daily_streams(
    today_tracks: list[dict],
    yesterday_tracks: list[dict],
) -> int | None:
    """Sum positive per-track playcount deltas between today and yesterday.

    Returns None if yesterday_tracks is empty or there are no matching
    track_ids (first scrape, or complete tracklist rotation). Only tracks
    present in both snapshots contribute to the delta.

    Args:
        today_tracks:     List of {track_id, name, playcount} for today.
        yesterday_tracks: List of {track_id, name, playcount} for yesterday.
    """
    if not yesterday_tracks:
        return None

    yesterday_map = {t["track_id"]: t["playcount"] for t in yesterday_tracks if t.get("track_id")}
    if not yesterday_map:
        return None

    matched = 0
    total = 0
    for t in today_tracks:
        tid = t.get("track_id")
        if tid and tid in yesterday_map:
            matched += 1
            total += max(0, t["playcount"] - yesterday_map[tid])

    return total if matched > 0 else None


# ── Stream velocity ───────────────────────────────────────────────────────────

def compute_stream_velocity_7d(
    streams_last_7: int,
    streams_prev_7: int,
) -> float | None:
    """Percentage change in streams: (last7 - prev7) / prev7 * 100.

    Returns None if streams_prev_7 is 0 (division guard).
    """
    if streams_prev_7 == 0:
        return None
    return (streams_last_7 - streams_prev_7) / streams_prev_7 * 100.0


# ── Listener growth ───────────────────────────────────────────────────────────

def compute_listener_growth_28d(
    ml_today: int,
    ml_28d_ago: int,
) -> float | None:
    """Percentage change in monthly listeners over 28 days.

    Returns None if ml_28d_ago is 0.
    """
    if ml_28d_ago == 0:
        return None
    return (ml_today - ml_28d_ago) / ml_28d_ago * 100.0


# ── Catalog depth (Herfindahl-based) ─────────────────────────────────────────

def compute_catalog_depth(tracks: list[dict]) -> float | None:
    """1 - sum(track_share^2) across all tracks in today's snapshot.

    Returns None if tracks is empty or total playcount is 0.
    0 = all streams on one track; ~0.9 = perfectly spread over 10 tracks.
    """
    if not tracks:
        return None

    total = sum(t.get("playcount", 0) or 0 for t in tracks)
    if total == 0:
        return None

    hhi = sum((t.get("playcount", 0) / total) ** 2 for t in tracks)
    return 1.0 - hhi


# ── Momentum score ────────────────────────────────────────────────────────────

def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def compute_momentum(
    velocity: float | None,
    growth: float | None,
    depth: float | None,
) -> float | None:
    """Composite momentum score in the range [0, 100].

    Formula (GDD §4.1):
      v_norm = clamp((velocity + 50) / 2,   0, 100)
      g_norm = clamp((growth   + 20) / 0.8, 0, 100)
      d_norm = depth * 100
      score  = clamp(v_norm*0.4 + g_norm*0.35 + d_norm*0.25, 0, 100)

    Returns None if any input is None.
    """
    if velocity is None or growth is None or depth is None:
        return None

    v_norm = _clamp((velocity + 50.0) / 2.0,   0.0, 100.0)
    g_norm = _clamp((growth   + 20.0) / 0.8,   0.0, 100.0)
    d_norm = depth * 100.0

    return _clamp(v_norm * 0.4 + g_norm * 0.35 + d_norm * 0.25, 0.0, 100.0)
