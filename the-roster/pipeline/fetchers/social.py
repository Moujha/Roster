"""Fetches Instagram and TikTok follower/engagement data."""


def fetch_instagram_stats(handle: str) -> dict:
    """Returns follower count and recent post engagement for an IG handle."""
    raise NotImplementedError


def fetch_tiktok_stats(handle: str) -> dict:
    """Returns follower count and 7-day view count for a TikTok handle."""
    raise NotImplementedError
