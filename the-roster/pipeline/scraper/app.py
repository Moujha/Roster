"""
Spotify anonymous token manager.
No developer account needed — uses the web player's public token endpoint.
"""
import asyncio
import time
import aiohttp

TOKEN_URL = "https://open.spotify.com/get_access_token"
REFRESH_INTERVAL = 500  # seconds; token is valid ~3600s

# Update from open.spotify.com page source (search "spotify-app-version") if getting 400s
SPOTIFY_APP_VERSION = "1.2.38.17.g766c306b"

_access_token: str = ""
_token_expiry: float = 0.0
_lock: asyncio.Lock = None  # initialised lazily (event loop must exist)


def _get_lock() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


async def _fetch_token(session: aiohttp.ClientSession) -> str:
    params = {"reason": "transpost", "productType": "web_player"}
    async with session.get(TOKEN_URL, params=params) as resp:
        resp.raise_for_status()
        data = await resp.json()
        return data["accessToken"]


async def get_token(session: aiohttp.ClientSession) -> str:
    global _access_token, _token_expiry
    async with _get_lock():
        if time.time() >= _token_expiry:
            _access_token = await _fetch_token(session)
            _token_expiry = time.time() + REFRESH_INTERVAL
    return _access_token


async def force_refresh(session: aiohttp.ClientSession) -> None:
    """Force an immediate token refresh (called on 401 responses)."""
    global _access_token, _token_expiry
    async with _get_lock():
        _access_token = await _fetch_token(session)
        _token_expiry = time.time() + REFRESH_INTERVAL


async def refresh_token_loop(session: aiohttp.ClientSession) -> None:
    """Background task: proactively refresh the token every REFRESH_INTERVAL seconds."""
    while True:
        await asyncio.sleep(REFRESH_INTERVAL)
        await force_refresh(session)


def build_headers(token: str) -> dict:
    return {
        "accept": "application/json",
        "app-platform": "WebPlayer",
        "content-type": "application/json",
        "origin": "https://open.spotify.com",
        "referer": "https://open.spotify.com/",
        "spotify-app-version": SPOTIFY_APP_VERSION,
        "user-agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "authorization": f"Bearer {token}",
    }
