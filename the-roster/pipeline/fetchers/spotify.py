"""Fetches artist data and stream counts from the Spotify API."""
import os
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from dotenv import load_dotenv

load_dotenv()


def get_spotify_client() -> spotipy.Spotify:
    auth_manager = SpotifyClientCredentials(
        client_id=os.environ["SPOTIFY_CLIENT_ID"],
        client_secret=os.environ["SPOTIFY_CLIENT_SECRET"],
    )
    return spotipy.Spotify(auth_manager=auth_manager)


def fetch_artist(spotify_id: str) -> dict:
    """Returns artist profile data from Spotify."""
    sp = get_spotify_client()
    return sp.artist(spotify_id)
