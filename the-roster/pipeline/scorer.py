"""
Scoring engine for THE ROSTER — v1, Spotify-only.

Score breakdown (max 100 pts):
  streams   → Spotify popularity (0-100) mapped to 0-50 pts
  social    → Follower count tier, 0-25 pts
  charts    → Global Weekly chart position, 0-25 pts
  momentum  → Week-over-week popularity change, capped ±5 pts

Market price is derived from follower count (base tier) modulated by popularity.

Note: "streams" in ScoreBreakdown stores the popularity-derived score.
      True stream counts are not available from the official Spotify API.
"""
from typing import Optional


# ─── Scoring ──────────────────────────────────────────────────────────────────

def compute_score(
    spotify_data: dict,
    chart_data: Optional[dict],
    prev_stats: Optional[dict] = None,
) -> dict:
    """
    Args:
        spotify_data:  Spotify API artist object (followers, popularity, etc.)
        chart_data:    {"best_rank": int, "total_streams": int} or None
        prev_stats:    Previous artist_stats row for momentum calculation

    Returns:
        {"streams": float, "social": float, "charts": float,
         "momentum": float, "total": float}
    """
    popularity = spotify_data.get("popularity") or 0
    followers = (spotify_data.get("followers") or {}).get("total") or 0

    streams_score  = round(popularity * 0.5, 2)       # 0–50
    social_score   = _score_followers(followers)        # 0–25
    charts_score   = _score_chart_rank(
        chart_data.get("best_rank") if chart_data else None
    )                                                   # 0–25
    momentum_score = _score_momentum(streams_score, prev_stats)  # ±5

    total = streams_score + social_score + charts_score + momentum_score
    return {
        "streams":  streams_score,
        "social":   social_score,
        "charts":   charts_score,
        "momentum": momentum_score,
        "total":    round(total, 2),
    }


def _score_followers(followers: int) -> float:
    if followers >= 50_000_000: return 25.0
    if followers >= 20_000_000: return 20.0
    if followers >= 5_000_000:  return 15.0
    if followers >= 1_000_000:  return 10.0
    if followers >= 100_000:    return 5.0
    return 1.0


def _score_chart_rank(rank: Optional[int]) -> float:
    if rank is None: return 0.0
    if rank == 1:    return 25.0
    if rank <= 5:    return 20.0
    if rank <= 10:   return 16.0
    if rank <= 25:   return 12.0
    if rank <= 50:   return 8.0
    if rank <= 100:  return 4.0
    if rank <= 200:  return 2.0
    return 0.0


def _score_momentum(current_streams_score: float, prev_stats: Optional[dict]) -> float:
    """±1 pt per point gained/lost in popularity score, capped at ±5."""
    if not prev_stats:
        return 0.0
    breakdown = prev_stats.get("score_breakdown") or {}
    prev = breakdown.get("streams") or 0.0
    delta = current_streams_score - prev
    return max(-5.0, min(5.0, round(delta, 2)))


# ─── Market pricing ───────────────────────────────────────────────────────────

def compute_market_price(
    spotify_data: dict,
    prev_price: Optional[float],
) -> dict:
    """
    Derives a market price from follower count (base tier) × popularity modifier.

    Popularity (0-100) scales price ±20%:
      modifier range: 0.8 (popularity=0) → 1.2 (popularity=100)

    Returns:
        {"price": float, "price_change_pct": float | None}
    """
    followers = (spotify_data.get("followers") or {}).get("total") or 0
    popularity = spotify_data.get("popularity") or 0

    base = _followers_to_base_price(followers)
    modifier = 0.8 + (popularity / 100) * 0.4
    price = round(base * modifier, 2)

    price_change_pct = None
    if prev_price and prev_price > 0:
        price_change_pct = round((price - prev_price) / prev_price * 100, 2)

    return {"price": price, "price_change_pct": price_change_pct}


def _followers_to_base_price(followers: int) -> float:
    """Maps follower count to a base market price in USD."""
    if followers >= 50_000_000: return 8_000_000.0
    if followers >= 20_000_000: return 4_000_000.0
    if followers >= 10_000_000: return 2_000_000.0
    if followers >= 5_000_000:  return 1_000_000.0
    if followers >= 1_000_000:  return 300_000.0
    if followers >= 500_000:    return 100_000.0
    if followers >= 100_000:    return 30_000.0
    return 5_000.0
