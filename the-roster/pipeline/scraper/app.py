"""
Spotify token manager — manages both the access token and client token.

Access token (Bearer):
  1. SPOTIFY_ACCESS_TOKEN env var — manually extracted token for dev/testing.
     Get it: open.spotify.com → DevTools Console →
       fetch('/get_access_token?reason=transpost&productType=web_player')
         .then(r=>r.json()).then(d=>console.log(d.accessToken))
     Valid ~1 hour.
  2. SP_DC env var — automated. Playwright loads a Spotify page and intercepts
     the Bearer token from the web player's first API request.
     Get sp_dc: open.spotify.com → DevTools → Application → Cookies → sp_dc

Client token (required by Spotify's partner API alongside the Bearer token):
  Fetched automatically from clienttoken.spotify.com using the web player
  client ID (a public constant embedded in Spotify's web player JS).
"""
import asyncio
import logging
import os
import time
import uuid
import aiohttp
from curl_cffi.requests import AsyncSession as CurlSession

log = logging.getLogger(__name__)

REFRESH_INTERVAL = 1800  # 30 min; access token valid ~1 hour

SPOTIFY_APP_VERSION  = "1.2.38.17.g766c306b"
_WEB_PLAYER_CLIENT_ID = "d8a5ed958d274c2e8ee717e6a4b0971d"
_CLIENT_TOKEN_URL    = "https://clienttoken.spotify.com/v1/clienttoken"

# ── Access token ──────────────────────────────────────────────────────────────

_access_token: str = ""
_token_expiry: float = 0.0
_lock: asyncio.Lock = None


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
    token = os.environ.get("SPOTIFY_ACCESS_TOKEN", "").strip()
    return token or ""


async def _fetch_token_from_sp_dc(sp_dc: str) -> str:
    """
    Uses Playwright to load a Spotify page with the sp_dc cookie and intercepts
    the Bearer token from the web player's first request to the partner API.
    This is the only reliable method since Spotify's /api/token endpoint is broken.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError(
            "Playwright not installed — required for automated token refresh.\n"
            "Run: pip install playwright && playwright install chromium\n"
            "Or set SPOTIFY_ACCESS_TOKEN manually (expires ~1hr):\n"
            "  Browser console → "
            "fetch('/get_access_token?reason=transpost&productType=web_player')"
            ".then(r=>r.json()).then(d=>console.log(d.accessToken))"
        )

    log.info("  [token] launching browser to intercept Spotify Bearer token…")
    token_holder: list = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context()
        await context.add_cookies([{
            "name": "sp_dc", "value": sp_dc,
            "domain": ".spotify.com", "path": "/", "secure": True,
        }])
        page = await context.new_page()

        def on_request(request):
            if token_holder:
                return
            auth = request.headers.get("authorization", "")
            if auth.startswith("Bearer ") and "api-partner.spotify.com" in request.url:
                token_holder.append(auth[len("Bearer "):])

        page.on("request", on_request)
        await page.goto(
            "https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02",
            wait_until="domcontentloaded",
            timeout=30_000,
        )
        # Wait up to 15s for the partner API request to appear
        for _ in range(30):
            if token_holder:
                break
            await asyncio.sleep(0.5)

        await browser.close()

    if not token_holder:
        raise RuntimeError(
            "Could not intercept Spotify Bearer token from browser.\n"
            "Make sure SP_DC is a valid, non-expired Spotify session cookie."
        )

    log.info("  [token] captured Bearer token via browser intercept")
    return token_holder[0]


async def _fetch_token(_session: aiohttp.ClientSession, skip_env: bool = False) -> str:
    if not skip_env:
        token = await _fetch_token_from_env()
        if token:
            return token
    sp_dc = os.environ.get("SP_DC", "").strip()
    if sp_dc:
        return await _fetch_token_from_sp_dc(sp_dc)
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
    """Force token refresh. If SPOTIFY_ACCESS_TOKEN is set, skip it on refresh
    (it can't change at runtime) and go straight to SP_DC homepage extraction."""
    global _access_token, _token_expiry
    sp_dc = os.environ.get("SP_DC", "").strip()
    async with _get_lock():
        _access_token = await _fetch_token(session, skip_env=bool(sp_dc))
        _token_expiry = time.time() + REFRESH_INTERVAL


async def refresh_token_loop(session: aiohttp.ClientSession) -> None:
    while True:
        await asyncio.sleep(REFRESH_INTERVAL)
        await force_refresh(session)


# ── Client token ──────────────────────────────────────────────────────────────

_client_token: str = ""
_client_token_expiry: float = 0.0
_ct_lock: asyncio.Lock = None


def _get_ct_lock() -> asyncio.Lock:
    global _ct_lock
    if _ct_lock is None:
        _ct_lock = asyncio.Lock()
    return _ct_lock


async def _fetch_client_token(session: aiohttp.ClientSession) -> str:
    """
    Fetches a client token from clienttoken.spotify.com.
    Uses the public Spotify web player client ID.
    """
    payload = {
        "client_data": {
            "client_version": SPOTIFY_APP_VERSION,
            "client_id": _WEB_PLAYER_CLIENT_ID,
            "js_sdk_data": {
                "device_brand": "Apple",
                "device_model": "unknown",
                "os": "macos",
                "os_version": "unknown",
                "device_id": str(uuid.uuid4()),
                "device_type": "computer",
            },
        }
    }
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "user-agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
    }
    async with session.post(_CLIENT_TOKEN_URL, json=payload, headers=headers) as resp:
        resp.raise_for_status()
        data = await resp.json()
        return data["granted_token"]["token"]


async def get_client_token(session: aiohttp.ClientSession) -> str:
    global _client_token, _client_token_expiry
    async with _get_ct_lock():
        if time.time() >= _client_token_expiry:
            _client_token = await _fetch_client_token(session)
            _client_token_expiry = time.time() + REFRESH_INTERVAL
    return _client_token


# ── Headers ───────────────────────────────────────────────────────────────────

def build_headers(token: str, client_token: str = "") -> dict:
    headers = {
        "accept": "application/json",
        "app-platform": "WebPlayer",
        "content-type": "application/json;charset=UTF-8",
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
    if client_token:
        headers["client-token"] = client_token
    return headers
