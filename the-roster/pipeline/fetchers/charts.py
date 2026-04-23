"""Fetches chart position data (Spotify Charts, Billboard)."""


def fetch_spotify_charts(region: str = "global") -> list[dict]:
    """Returns today's Spotify chart entries for the given region."""
    raise NotImplementedError


def fetch_billboard_hot100() -> list[dict]:
    """Returns this week's Billboard Hot 100 entries."""
    raise NotImplementedError
