"""Supabase client and database upsert helpers for the data pipeline."""
import os
from datetime import date
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Optional[Client] = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _client


# ─── Reads ────────────────────────────────────────────────────────────────────

def get_all_artists() -> list:
    """Returns all rows from the artists table: id, spotify_id, name."""
    result = get_client().table("artists").select("id,spotify_id,name").execute()
    return result.data


def get_prev_stats(artist_id: str, before_date: date) -> Optional[dict]:
    """Returns the most recent artist_stats row strictly before before_date."""
    result = (
        get_client()
        .table("artist_stats")
        .select("score_total,score_breakdown")
        .eq("artist_id", artist_id)
        .lt("date", before_date.isoformat())
        .order("date", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_prev_price(artist_id: str, before_date: date) -> Optional[float]:
    """Returns the most recent market price strictly before before_date."""
    result = (
        get_client()
        .table("market_prices")
        .select("price")
        .eq("artist_id", artist_id)
        .lt("date", before_date.isoformat())
        .order("date", desc=True)
        .limit(1)
        .execute()
    )
    return float(result.data[0]["price"]) if result.data else None


# ─── Writes ───────────────────────────────────────────────────────────────────

def upsert_artist(spotify_data: dict) -> str:
    """
    Insert or update an artist row from a Spotify API artist object.
    Returns the internal UUID for the artist.
    """
    images = spotify_data.get("images") or []
    genres = spotify_data.get("genres") or []

    row = {
        "spotify_id": spotify_data["id"],
        "name": spotify_data["name"],
        "image_url": images[0]["url"] if images else None,
        "genre": genres[0] if genres else None,
    }
    result = (
        get_client()
        .table("artists")
        .upsert(row, on_conflict="spotify_id")
        .execute()
    )
    return result.data[0]["id"]


def upsert_artist_stats(
    artist_id: str,
    run_date: date,
    spotify_data: dict,
    chart_data: Optional[dict],
    score: dict,
) -> None:
    """Insert or update the daily stats snapshot for one artist."""
    followers = (spotify_data.get("followers") or {}).get("total")

    row = {
        "artist_id": artist_id,
        "date": run_date.isoformat(),
        # followers.total is the best available proxy for monthly listeners
        "spotify_monthly_listeners": followers,
        # weekly streams from chart data (null if artist not on chart)
        "spotify_streams_7d": chart_data.get("total_streams") if chart_data else None,
        "ig_followers": None,
        "tiktok_followers": None,
        "tiktok_views_7d": None,
        "chart_position": chart_data.get("best_rank") if chart_data else None,
        "score_total": score["total"],
        "score_breakdown": {
            "streams":  score["streams"],
            "social":   score["social"],
            "charts":   score["charts"],
            "momentum": score["momentum"],
        },
    }
    (
        get_client()
        .table("artist_stats")
        .upsert(row, on_conflict="artist_id,date")
        .execute()
    )


def upsert_market_price(artist_id: str, run_date: date, price: dict) -> None:
    """Insert or update today's market price for one artist."""
    row = {
        "artist_id": artist_id,
        "date": run_date.isoformat(),
        "price": price["price"],
        "price_change_pct": price.get("price_change_pct"),
    }
    (
        get_client()
        .table("market_prices")
        .upsert(row, on_conflict="artist_id,date")
        .execute()
    )
