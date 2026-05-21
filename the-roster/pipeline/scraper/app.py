"""
Spotify token manager — uses the web player's internal token endpoint.

Two modes:
  1. SPOTIFY_ACCESS_TOKEN env var — use a manually extracted token (dev/testing).
     Get it: open.spotify.com → DevTools Console →
       fetch('/get_access_token?reason=transpost&productType=web_player')
         .then(r=>r.json()).then(d=>console.log(d.accessToken))
     Valid ~1 hour.

  2. SP_DC env var — automated daily pipeline. Extracts the token from the
     Spotify homepage HTML (not the WAF-blocked API endpoint).
     Get sp_dc: open.spotify.com → DevTools → Application → Cookies → sp_dc
"""
import asyncio
import os
import re
import time
import aiohttp
from curl_cffi.requests import AsyncSession as CurlSession

REFRESH_INTERVAL = 1800  # 30 min; token is valid ~1 hour

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


_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}


async def _fetch_token_from_env() -> str:
    """Return the manually set SPOTIFY_ACCESS_TOKEN if present."""
    token = os.environ.get("SPOTIFY_ACCESS_TOKEN", "").strip()
    return token or ""


async def _fetch_token_from_homepage(sp_dc: str) -> str:
    """
    Extract access token from Spotify homepage HTML.
    The page embeds {"accessToken":"BQD..."} in a script tag when loaded
    with a valid sp_dc cookie. Uses curl_cffi Chrome impersonation to pass
    Fastly bot checks on the HTML endpoint (different WAF rules than the API).
    """
    async with CurlSession(impersonate="chrome124") as curl:
        resp = await curl.get(
            "https://open.spotify.com/",
            cookies={"sp_dc": sp_dc},
            headers=_BROWSER_HEADERS,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Spotify homepage returned {resp.status_code}: {resp.text[:200]}")
        match = re.search(r'"accessToken"\s*:\s*"([^"]+)"', resp.text)
        if not match:
            raise RuntimeError("accessToken not found in Spotify homepage — sp_dc may be expired")
        return match.group(1)


async def _fetch_token(_session: aiohttp.ClientSession) -> str:
    # Mode 1: manually extracted token
    token = await _fetch_token_from_env()
    if token:
        return token

    # Mode 2: automated extraction via homepage HTML
    sp_dc = os.environ.get("SP_DC", "").strip()
    if sp_dc:
        return await _fetch_token_from_homepage(sp_dc)

    raise RuntimeError(
        "No Spotify credentials found. Set either:\n"
        "  SPOTIFY_ACCESS_TOKEN — token from browser DevTools Console\n"
        "  SP_DC               — sp_dc cookie from browser Application tab"
    )


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
