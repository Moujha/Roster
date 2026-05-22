"""
Core async Spotify scraper — 3 GraphQL queries, retry logic, album concurrency.
"""
import asyncio
import json
import logging
from typing import Optional

import aiohttp

from .app import get_token, get_client_token, force_refresh, build_headers
from .queries import (
    GRAPHQL_URL,
    EXT_ARTIST_OVERVIEW,
    EXT_DISCOGRAPHY_ALL,
    EXT_GET_ALBUM,
)

log = logging.getLogger(__name__)

MAX_RETRIES    = 3
REQUEST_DELAY  = 0.5   # seconds between every request (rate-limit courtesy)
ALBUM_WORKERS  = 5     # concurrent album fetches per artist


async def _gql(
    session: aiohttp.ClientSession,
    operation: str,
    variables: dict,
    extensions: str,
) -> dict:
    """
    Execute one GraphQL POST request against Spotify's v2 partner API.
    Retries up to MAX_RETRIES times with exponential backoff.
    Refreshes the auth token immediately on 401.
    """
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
                    log.warning(f"  [{operation}] {resp.status} error body: {body_text[:300]}")
                    resp.raise_for_status()
                data = await resp.json()
                if "errors" in data:
                    log.warning(f"  [{operation}] GraphQL errors: {data['errors']}")
                log.warning(f"  [{operation}] raw response: {str(data)[:300]}")
                return data
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            if attempt == MAX_RETRIES:
                raise
            wait = 2 ** attempt
            log.warning(f"  [{operation}] attempt {attempt + 1} failed: {exc} — retry in {wait}s")
            await asyncio.sleep(wait)
    return {}


# ── The 3 queries ─────────────────────────────────────────────────────────────

async def fetch_artist_overview(
    session: aiohttp.ClientSession, artist_id: str
) -> dict:
    """
    Returns:
        {
            "monthly_listeners": int | None,
            "followers": int | None,
            "top_tracks": [{"track_id": str, "name": str, "playcount": int}]
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
            "track_id": track.get("id", ""),
            "name":     track.get("name", ""),
            "playcount": int(track.get("playcount") or 0),
        })

    return {
        "monthly_listeners": stats.get("monthlyListeners"),
        "followers":         stats.get("followers"),
        "top_tracks":        top_tracks,
    }


async def fetch_all_album_ids(
    session: aiohttp.ClientSession, artist_id: str
) -> list:
    """Returns every album ID for the artist, paginated (50 per page)."""
    album_ids: list = []
    offset = 0
    limit  = 50
    total: Optional[int] = None

    while True:
        variables = {
            "uri":    f"spotify:artist:{artist_id}",
            "offset": offset,
            "limit":  limit,
        }
        data = await _gql(session, "queryArtistDiscographyAll", variables, EXT_DISCOGRAPHY_ALL)

        discog = (
            (data.get("data") or {})
            .get("artistUnion", {})
            .get("discography", {})
            .get("all", {})
        )

        if total is None:
            total = discog.get("totalCount", 0)

        for item in discog.get("items", []):
            for release in (item.get("releases") or {}).get("items", []):
                album_ids.append(release["id"])

        offset += limit
        if offset >= (total or 0):
            break

    return album_ids


async def fetch_album_tracks(
    session: aiohttp.ClientSession, album_id: str
) -> list:
    """
    Returns all tracks for one album (paginated).
    Each element: {"track_id", "name", "playcount", "album_id"}
    """
    tracks: list = []
    offset = 0
    limit  = 50
    total: Optional[int] = None

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


# ── Full artist scrape ────────────────────────────────────────────────────────

async def scrape_artist(session: aiohttp.ClientSession, artist_id: str) -> dict:
    """
    Runs all 3 queries for one artist.
    Returns:
        {
            "overview": {monthly_listeners, followers, top_tracks},
            "all_tracks": [{track_id, name, playcount, album_id}, ...]
        }
    """
    # Step 1 — artist overview (stats + top tracks)
    overview = await fetch_artist_overview(session, artist_id)

    # Step 2 — full discography album IDs
    album_ids = await fetch_all_album_ids(session, artist_id)
    log.debug(f"  {len(album_ids)} albums to process")

    # Step 3 — tracks from every album, with bounded concurrency
    semaphore = asyncio.Semaphore(ALBUM_WORKERS)

    async def bounded_fetch(album_id: str) -> list:
        async with semaphore:
            return await fetch_album_tracks(session, album_id)

    results = await asyncio.gather(
        *[bounded_fetch(aid) for aid in album_ids],
        return_exceptions=True,
    )

    all_tracks: list = []
    for r in results:
        if isinstance(r, Exception):
            log.warning(f"  Album fetch error: {r}")
        else:
            all_tracks.extend(r)

    # Deduplicate by track_id (same track can appear across multiple releases)
    seen: set = set()
    deduped: list = []
    for t in all_tracks:
        if t["track_id"] and t["track_id"] not in seen:
            seen.add(t["track_id"])
            deduped.append(t)

    return {"overview": overview, "all_tracks": deduped}
