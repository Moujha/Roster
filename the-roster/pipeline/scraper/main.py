"""
Spotify stream scraper for THE ROSTER.

Usage:
  cd the-roster/pipeline
  python -m scraper.main

Schedule (daily at 06:00 UTC, before the GitHub Actions scorer runs):
  0 6 * * * cd /path/to/the-roster/pipeline && python -m scraper.main >> scraper.log 2>&1

Required env vars (copy pipeline/.env.example → pipeline/.env):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""
import asyncio
import logging
import os
import sys
from datetime import date

import aiohttp
from dotenv import load_dotenv
from supabase import create_client

from .app import get_token, refresh_token_loop
from .spotify import scrape_artist
from .supabase_store import store_artist_stats, store_track_stats

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def _load_artists(url: str, key: str) -> list:
    client = create_client(url, key)
    result = client.table("artists").select("id,spotify_id,name").execute()
    return result.data


async def run() -> int:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    scraped_at = date.today()

    artists = _load_artists(url, key)
    if not artists:
        log.warning("No artists in DB. Run pipeline/seed.py first.")
        return 0

    log.info(f"Scraping {len(artists)} artists for {scraped_at}")
    supabase = create_client(url, key)

    success = errors = 0

    async with aiohttp.ClientSession() as session:
        await get_token(session)  # warm up
        refresh_task = asyncio.create_task(refresh_token_loop(session))

        try:
            for artist in artists:
                name = artist.get("name") or artist["spotify_id"]
                log.info(f"[{name}] starting…")
                try:
                    result = await scrape_artist(session, artist["spotify_id"])

                    store_artist_stats(supabase, artist["id"], result["overview"], scraped_at)
                    store_track_stats(supabase, artist["id"], result["all_tracks"], scraped_at)

                    listeners = result["overview"].get("monthly_listeners")
                    track_count = len(result["all_tracks"])
                    listeners_str = f"{listeners:,}" if isinstance(listeners, int) else "?"
                    log.info(f"[{name}] ✓  {track_count} tracks  {listeners_str} monthly listeners")
                    success += 1
                except Exception as exc:
                    log.error(f"[{name}] FAILED: {exc}")
                    errors += 1
        finally:
            refresh_task.cancel()

    log.info(f"Done — {success} ok, {errors} failed")
    return errors


def main() -> None:
    sys.exit(asyncio.run(run()))


if __name__ == "__main__":
    main()
