"""Computes score_total and score_breakdown from a row of artist_stats."""


def compute_score(stats: dict) -> dict:
    """
    Given an artist_stats dict, returns ScoreBreakdown + total.

    Returns:
        {"streams": float, "social": float, "charts": float, "momentum": float, "total": float}
    """
    streams_score  = _score_streams(stats.get("spotify_streams_7d") or 0)
    social_score   = _score_social(stats)
    charts_score   = _score_charts(stats.get("chart_position"))
    momentum_score = 0.0  # TODO: week-over-week delta

    total = streams_score + social_score + charts_score + momentum_score
    return {
        "streams":  streams_score,
        "social":   social_score,
        "charts":   charts_score,
        "momentum": momentum_score,
        "total":    round(total, 2),
    }


def _score_streams(weekly_streams: int) -> float:
    if weekly_streams >= 200_000_000: return 100.0
    if weekly_streams >= 50_000_000:  return 50.0
    if weekly_streams >= 10_000_000:  return 25.0
    if weekly_streams >= 2_000_000:   return 12.0
    if weekly_streams >= 500_000:     return 5.0
    return 2.0


def _score_social(stats: dict) -> float:
    ig_followers = stats.get("ig_followers") or 0
    return min(ig_followers / 500_000, 15.0)


def _score_charts(chart_position: int | None) -> float:
    if chart_position is None: return 0.0
    if chart_position == 1:    return 100.0
    if chart_position <= 5:    return 60.0
    if chart_position <= 10:   return 40.0
    if chart_position <= 25:   return 20.0
    if chart_position <= 50:   return 10.0
    if chart_position <= 100:  return 5.0
    return 0.0
