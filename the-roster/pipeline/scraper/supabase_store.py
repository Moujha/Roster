"""Upserts raw Spotify scrape results into Supabase."""
from datetime import date
from typing import Optional
from supabase import Client

_CHUNK = 500  # max rows per upsert call


def store_artist_stats(
    client: Client,
    artist_id: str,
    overview: dict,
    scraped_at: Optional[date] = None,
) -> None:
    """Upsert one row into artist_stats_daily."""
    if scraped_at is None:
        scraped_at = date.today()

    row = {
        "artist_id":        artist_id,
        "scraped_at":       scraped_at.isoformat(),
        "monthly_listeners": overview.get("monthly_listeners"),
        "followers":         overview.get("followers"),
    }
    (
        client.table("artist_stats_daily")
        .upsert(row, on_conflict="artist_id,scraped_at")
        .execute()
    )


def store_track_stats(
    client: Client,
    artist_id: str,
    tracks: list,
    scraped_at: Optional[date] = None,
) -> None:
    """Batch-upsert all tracks into track_stats_daily in chunks of 500."""
    if scraped_at is None:
        scraped_at = date.today()
    if not tracks:
        return

    rows = [
        {
            "artist_id":       artist_id,
            "spotify_track_id": t["track_id"],
            "track_name":       t["name"],
            "album_id":         t["album_id"],
            "playcount":        t["playcount"],
            "scraped_at":       scraped_at.isoformat(),
        }
        for t in tracks
        if t.get("track_id")
    ]

    for i in range(0, len(rows), _CHUNK):
        (
            client.table("track_stats_daily")
            .upsert(rows[i : i + _CHUNK], on_conflict="spotify_track_id,scraped_at")
            .execute()
        )
