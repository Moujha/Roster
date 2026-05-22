"""
Core async Spotify scraper — GraphQL queries, retry logic, album concurrency.

Currently uses 2 queries:
  - queryArtistOverview  → stats (monthly listeners, followers) + top 10 tracks
  - getAlbum             → all tracks from a single album

queryArtistDiscographyAll hash not yet captured (see get_spotify_hashes.py).
Until then, only top-10 tracks per artist are stored.
"""
import asyncio
import json
import logging

import aiohttp

from .app import get_token, get_client_token, force_refresh, build_headers
from .queries import GRAPHQL_URL, EXT_ARTIST_OVERVIEW, EXT_GET_ALBUM

log = logging.getLogger(__name__)

MAX_RETRIES   = 3
REQUEST_DELAY = 0.5
ALBUM_WORKERS = 5


async def _gql(
    session: aiohttp.ClientSession,
    operation: str,
    variables: dict,
    extensions: str,
) -> dict:
    """POST one GraphQL request to Spotify's v2 partner API with retry + token refresh."""
    for attempt in range(MAX_RETRIES + 1):
        token = await get_token(session)
        client_token = await get_client_token(session)
        body = {
            "operationName": operation,
            "variables": variables,
            "extensions": json.loads(extensions),
        }
        try:
            await asyncio.sleep(REQUEST_DELAY)
            async with session.post(
                GRAPHQL_URL,
                headers=build_headers(token, client_token),
                json=body,
            ) as resp:
                if resp.status == 401:
                    log.warning(f"  [{operation}] 401 — token expired, forcing refresh (attempt {attempt + 1})")
                    await force_refresh(session)
                    continue
                if resp.status >= 400:
                    body_text = await resp.text()
                    log.warning(f"  [{operation}] {resp.status} error: {body_text[:300]}")
                    resp.raise_for_status()
                data = await resp.json()
                if "errors" in data:
                    log.warning(f"  [{operation}] GraphQL errors: {data['errors']}")
                log.debug(f"  [{operation}] ok — keys: {list((data.get('data') or {}).keys())}")
                return data
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            if attempt == MAX_RETRIES:
                raise
            wait = 2 ** attempt
            log.warning(f"  [{operation}] attempt {attempt + 1} failed: {exc} — retry in {wait}s")
            await asyncio.sleep(wait)
    return {}


async def fetch_artist_overview(session: aiohttp.ClientSession, artist_id: str) -> dict:
    """
    Returns artist stats + top 10 tracks by playcount.
    {
        "monthly_listeners": int | None,
        "followers": int | None,
        "top_tracks": [{"track_id", "name", "playcount"}]
    }
    """
    variables = {
        "uri": f"spotify:artist:{artist_id}",
        "locale": "",
        "includePrerelease": True,
    }
    data = await _gql(session, "queryArtistOverview", variables, EXT_ARTIST_OVERVIEW)

    artist = ((data.get("data") or {}).get("artistUnion")) or {}
    stats  = artist.get("stats") or {}
    raw_tracks = (
        (artist.get("discography") or {})
        .get("topTracks", {})
        .get("items", [])
    )

    top_tracks = []
    for item in raw_tracks:
        track = item.get("track") or {}
        top_tracks.append({
            "track_id": track.get("id") or track.get("uri", "").split(":")[-1],
            "name":     track.get("name", ""),
            "playcount": int(track.get("playcount") or 0),
        })

    return {
        "monthly_listeners": stats.get("monthlyListeners"),
        "followers":         stats.get("followers"),
        "top_tracks":        top_tracks,
    }


async def fetch_album_tracks(session: aiohttp.ClientSession, album_id: str) -> list:
    """
    Returns all tracks for one album (paginated).
    Each element: {"track_id", "name", "playcount", "album_id"}
    """
    tracks: list = []
    offset = 0
    limit  = 50
    total  = None

    while True:
        variables = {
            "uri":    f"spotify:album:{album_id}",
            "locale": "",
            "offset": offset,
            "limit":  limit,
        }
        data = await _gql(session, "getAlbum", variables, EXT_GET_ALBUM)

        album_union = (data.get("data") or {}).get("albumUnion") or {}
        tracks_data = album_union.get("tracks") or {}

        if total is None:
            total = tracks_data.get("totalCount", 0)

        items = tracks_data.get("items") or []
        for item in items:
            track = item.get("track") or {}
            uri      = track.get("uri", "")
            track_id = uri.split(":")[-1] if ":" in uri else uri
            tracks.append({
                "track_id": track_id,
                "name":     track.get("name", ""),
                "playcount": int(track.get("playcount") or 0),
                "album_id": album_id,
            })

        offset += limit
        if not items or offset >= (total or 0):
            break

    return tracks


async def scrape_artist(session: aiohttp.ClientSession, artist_id: str) -> dict:
    """
    Scrapes one artist. Returns:
    {
        "overview":   {monthly_listeners, followers, top_tracks},
        "all_tracks": [{track_id, name, playcount, album_id}, ...]
    }

    Currently only returns the top-10 tracks (queryArtistDiscographyAll hash
    not yet captured — run get_spotify_hashes.py to update).
    """
    overview = await fetch_artist_overview(session, artist_id)

    # Use top tracks as all_tracks until we have the discography hash
    all_tracks = [
        {**t, "album_id": ""}
        for t in overview.get("top_tracks", [])
    ]

    return {"overview": overview, "all_tracks": all_tracks}
