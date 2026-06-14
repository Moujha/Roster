"""Fetches chart data from the Spotify Charts public endpoint.

Spotify Charts provides the Global Weekly Top 200 as JSON without authentication.
If the endpoint is unavailable, all functions return empty data gracefully so the
rest of the pipeline continues with chart_position = null for all artists.

Chart data is used to populate:
  - artist_stats.chart_position   (best rank for any track by this artist)
  - artist_stats.spotify_streams_7d (sum of weekly streams across all chart entries)
"""
import httpx

CHARTS_BASE_URL = (
    "https://charts-spotify-com-service.spotify.com"
    "/public/v1/charts/regional"
)

GLOBAL_WEEKLY_URL = f"{CHARTS_BASE_URL}/global/weekly/latest"


def _fetch_chart(url: str) -> list:
    """
    Shared fetch logic for any Spotify regional chart URL.

    Returns a list of dicts:
      {"rank": int, "streams": int, "track_name": str,
       "artist_ids": list[str], "artist_names": list[str]}

    Returns [] if the endpoint is unreachable or returns unexpected data.
    """
    try:
        resp = httpx.get(url, timeout=15.0, follow_redirects=True)
        resp.raise_for_status()
        data = resp.json()
        entries = []
        for item in data.get("entries", []):
            chart = item.get("chartEntryData", {})
            meta = item.get("trackMetadata", {})
            rank = chart.get("currentRank")
            streams = (chart.get("rankingMetric") or {}).get("value")
            artists = meta.get("artists") or []
            entries.append({
                "rank": rank,
                "streams": int(streams) if streams else 0,
                "track_name": meta.get("trackName"),
                "artist_ids": [a["id"] for a in artists],
                "artist_names": [a["name"] for a in artists],
            })
        return entries
    except Exception as exc:
        print(f"  [charts] Could not fetch {url}: {exc}")
        return []


def fetch_global_chart() -> list:
    """Fetches the Spotify Global Weekly Top 200."""
    return _fetch_chart(GLOBAL_WEEKLY_URL)


def fetch_country_chart(country_code: str) -> list:
    """Fetches the Spotify Weekly Top 200 for a specific country.

    country_code should be an ISO 3166-1 alpha-2 code (e.g. 'US', 'GB').
    Returns [] if the chart is unavailable or the country is not supported.
    """
    url = f"{CHARTS_BASE_URL}/{country_code.lower()}/weekly/latest"
    return _fetch_chart(url)


def build_artist_chart_map(chart_entries: list) -> dict:
    """
    Collapses track-level chart entries into an artist-level summary.

    Returns {spotify_artist_id: {"best_rank": int, "total_streams": int}}
    for every artist appearing on the chart.
    """
    artist_map: dict = {}
    for entry in chart_entries:
        streams = entry.get("streams") or 0
        rank = entry.get("rank")
        if rank is None:
            continue
        for artist_id in entry.get("artist_ids", []):
            if artist_id not in artist_map:
                artist_map[artist_id] = {"best_rank": rank, "total_streams": streams}
            else:
                artist_map[artist_id]["total_streams"] += streams
                if rank < artist_map[artist_id]["best_rank"]:
                    artist_map[artist_id]["best_rank"] = rank
    return artist_map
