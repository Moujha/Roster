"""Upserts raw Spotify scrape results into the scrape_raw table."""
from datetime import date
from typing import Optional
from supabase import Client


def store_scrape_raw(
    client: Client,
    artist_id: str,
    overview: dict,
    scraped_at: Optional[date] = None,
) -> None:
    """Upsert one row into scrape_raw.

    Args:
        client:     Supabase service-role client.
        artist_id:  Internal UUID from the artists table.
        overview:   Dict returned by the Playwright scraper, expected keys:
                      monthly_listeners: int
                      top_tracks: list of {track_id, name, playcount}
        scraped_at: Date to record; defaults to today.
    """
    if scraped_at is None:
        scraped_at = date.today()

    top_tracks = overview.get("top_tracks") or []
    track_playcounts = [
        {"track_id": t["track_id"], "name": t["name"], "playcount": t["playcount"]}
        for t in top_tracks
        if t.get("track_id")
    ]

    row = {
        "artist_id":         artist_id,
        "scraped_at":        scraped_at.isoformat(),
        "monthly_listeners": overview.get("monthly_listeners"),
        "track_playcounts":  track_playcounts or None,
    }
    (
        client.table("scrape_raw")
        .upsert(row, on_conflict="artist_id,scraped_at")
        .execute()
    )
