"""
Extracts persisted query hashes for our 3 operations from Spotify's JS bundles.

Usage:
  cd the-roster/pipeline
  python get_spotify_hashes.py
"""
import asyncio
import re
import os
from dotenv import load_dotenv
from curl_cffi.requests import AsyncSession

load_dotenv()

OPERATIONS = [
    "queryArtistOverview",
    "queryArtistDiscographyAll",
    "getAlbum",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


async def find_hashes():
    sp_dc = os.environ.get("SP_DC", "")
    cookies = {"sp_dc": sp_dc} if sp_dc else {}

    async with AsyncSession(impersonate="chrome124") as session:
        print("Fetching Spotify homepage to discover JS bundles…")
        resp = await session.get("https://open.spotify.com/", cookies=cookies, headers=HEADERS)
        html = resp.text

        # Collect all <script src="..."> URLs
        script_urls = list(dict.fromkeys(
            re.findall(r'src="(https://[^"]+\.js(?:\?[^"]*)?)"', html)
        ))
        print(f"Found {len(script_urls)} JS bundle(s)")

        hashes = {}

        for url in script_urls:
            if len(hashes) == len(OPERATIONS):
                break
            try:
                resp = await session.get(url, headers={"User-Agent": HEADERS["User-Agent"]})
                js = resp.text
            except Exception as e:
                print(f"  Could not fetch {url}: {e}")
                continue

            for op in OPERATIONS:
                if op in hashes:
                    continue
                # Pattern: "operationName":"queryFoo" ... "sha256Hash":"abc..." (within ~2000 chars)
                patterns = [
                    rf'"operationName"\s*:\s*"{re.escape(op)}"[^\x00]{{0,2000}}?"sha256Hash"\s*:\s*"([a-f0-9]{{64}})"',
                    rf'"sha256Hash"\s*:\s*"([a-f0-9]{{64}})"[^\x00]{{0,2000}}?"operationName"\s*:\s*"{re.escape(op)}"',
                    rf'{re.escape(op)}[^\x00]{{0,500}}sha256Hash[^\x00]{{0,100}}"([a-f0-9]{{64}})"',
                ]
                for pattern in patterns:
                    match = re.search(pattern, js, re.DOTALL)
                    if match:
                        hashes[op] = match.group(1)
                        print(f"  ✓ {op}: {match.group(1)}")
                        break

        if len(hashes) < len(OPERATIONS):
            missing = [op for op in OPERATIONS if op not in hashes]
            print(f"\nCould not find hashes for: {missing}")
            print("Try running with SP_DC set in .env if you haven't already.")
        else:
            print("\n── Paste these into queries.py ──")
            for op, h in hashes.items():
                print(f'{op}: "{h}"')

    return hashes


if __name__ == "__main__":
    asyncio.run(find_hashes())
