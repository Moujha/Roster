"""
Scoring engine for THE ROSTER — v2, real Spotify data.

Score breakdown (max 100 pts):
  streams  (0-50) → monthly listener count tiers
  social   (0-25) → follower count tiers
  charts   (0-25) → Global Weekly chart position (0 if not charting)
  momentum (±5)   → week-over-week monthly listener change

Market price = monthly_listeners × $0.10
  (one cent per monthly listener, rounded to nearest $1 000)
"""
from typing import Optional


# ── Scoring ───────────────────────────────────────────────────────────────────

def compute_score(
    scrape_data: dict,
    chart_data: Optional[dict] = None,
    prev_scrape: Optional[dict] = None,
) -> dict:
    """
    Args:
        scrape_data:  {"monthly_listeners": int, "followers": int}
        chart_data:   {"best_rank": int, "total_streams": int} or None
        prev_scrape:  previous artist_stats_daily row for momentum, or None

    Returns:
        {"streams": float, "social": float, "charts": float,
         "momentum": float, "total": float}
    """
    monthly_listeners = scrape_data.get("monthly_listeners") or 0
    followers         = scrape_data.get("followers") or 0

    streams_score  = _score_monthly_listeners(monthly_listeners)
    social_score   = _score_followers(followers)
    charts_score   = _score_chart_rank(
        chart_data.get("best_rank") if chart_data else None
    )
    momentum_score = _score_momentum(monthly_listeners, prev_scrape)

    total = streams_score + social_score + charts_score + momentum_score
    return {
        "streams":  streams_score,
        "social":   social_score,
        "charts":   charts_score,
        "momentum": momentum_score,
        "total":    round(total, 2),
    }


def _score_monthly_listeners(ml: int) -> float:
    if ml >= 120_000_000: return 50.0
    if ml >= 100_000_000: return 47.0
    if ml >=  80_000_000: return 44.0
    if ml >=  60_000_000: return 40.0
    if ml >=  50_000_000: return 36.0
    if ml >=  40_000_000: return 32.0
    if ml >=  30_000_000: return 28.0
    if ml >=  20_000_000: return 24.0
    if ml >=  10_000_000: return 18.0
    if ml >=   5_000_000: return 12.0
    if ml >=   1_000_000: return  6.0
    return 2.0


def _score_followers(followers: int) -> float:
    if followers >= 50_000_000: return 25.0
    if followers >= 20_000_000: return 20.0
    if followers >= 5_000_000:  return 15.0
    if followers >= 1_000_000:  return 10.0
    if followers >= 100_000:    return  5.0
    return 1.0


def _score_chart_rank(rank: Optional[int]) -> float:
    if rank is None: return 0.0
    if rank == 1:    return 25.0
    if rank <= 5:    return 20.0
    if rank <= 10:   return 16.0
    if rank <= 25:   return 12.0
    if rank <= 50:   return  8.0
    if rank <= 100:  return  4.0
    if rank <= 200:  return  2.0
    return 0.0


def _score_momentum(current_ml: int, prev_scrape: Optional[dict]) -> float:
    """±1 pt per 1M listener gain/loss, capped at ±5."""
    if not prev_scrape:
        return 0.0
    prev_ml = prev_scrape.get("monthly_listeners") or current_ml
    delta_millions = (current_ml - prev_ml) / 1_000_000
    return max(-5.0, min(5.0, round(delta_millions, 2)))


# ── Market pricing ────────────────────────────────────────────────────────────

def compute_market_price(
    scrape_data: dict,
    prev_price: Optional[float] = None,
) -> dict:
    """
    Price = monthly_listeners × $0.10, rounded to nearest $1 000.

    Simple and transparent: one dime per monthly listener.
    Taylor Swift at 101M listeners → ~$10.1M
    An artist at 1M listeners → ~$100K

    Returns:
        {"price": float, "price_change_pct": float | None}
    """
    monthly_listeners = scrape_data.get("monthly_listeners") or 0
    price = round(monthly_listeners * 0.10 / 1000) * 1000

    price_change_pct = None
    if prev_price and prev_price > 0:
        price_change_pct = round((price - prev_price) / prev_price * 100, 2)

    return {"price": float(price), "price_change_pct": price_change_pct}
