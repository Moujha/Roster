"""Fetches artist metadata from the Spotify Web API.

Note on available data:
  - followers.total    → stored as spotify_monthly_listeners (best proxy from official API)
  - popularity (0-100) → Spotify's own metric, derived from recent streams with recency weighting
  - Monthly listeners and raw stream counts are not exposed by the official API
"""
import os
from typing import Optional
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from dotenv import load_dotenv

load_dotenv()

_client: Optional[spotipy.Spotify] = None


def get_client() -> spotipy.Spotify:
    global _client
    if _client is None:
        _client = spotipy.Spotify(
            auth_manager=SpotifyClientCredentials(
                client_id=os.environ["SPOTIFY_CLIENT_ID"],
                client_secret=os.environ["SPOTIFY_CLIENT_SECRET"],
            ),
            requests_timeout=10,
        )
    return _client


def fetch_artist(spotify_id: str) -> dict:
    """Returns a single artist object from Spotify."""
    return get_client().artist(spotify_id)


def fetch_artists_batch(spotify_ids: list) -> list:
    """
    Fetch up to 50 artists in a single API call.
    Filters out None entries (deleted/invalid IDs).
    """
    result = get_client().artists(spotify_ids[:50])
    return [a for a in result["artists"] if a is not None]
