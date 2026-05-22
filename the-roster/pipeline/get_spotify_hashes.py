"""
Extracts persisted query hashes from Spotify's JS bundles.
Searches by unique GraphQL field names since operation names may differ in v2.

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

# Unique field names from each query — used to fingerprint the right hash
FINGERPRINTS = {
    "queryArtistOverview":       ["monthlyListeners", "worldRank", "topCities"],
    "queryArtistDiscographyAll": ["queryArtistDiscographyAll", "discographyAll", "artistDiscographyAll"],
    "getAlbum":                  ["albumUnion", "getAlbum"],
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}


def search_hashes(js: str, found: dict) -> None:
    """Search js text for sha256Hash values near our fingerprint strings."""
    # All hashes in this bundle
    all_hashes = re.findall(r'"sha256Hash"\s*:\s*"([a-f0-9]{64})"', js)
    if not all_hashes:
        return

    for op, fingerprints in FINGERPRINTS.items():
        if op in found:
            continue
        for fp in fingerprints:
            if fp not in js:
                continue
            # Find the hash closest to (within 4000 chars of) this fingerprint
            for m in re.finditer(re.escape(fp), js):
                start = max(0, m.start() - 4000)
                end   = min(len(js), m.end() + 4000)
                chunk = js[start:end]
                h = re.search(r'"sha256Hash"\s*:\s*"([a-f0-9]{64})"', chunk)
                if h:
                    found[op] = h.group(1)
                    print(f"  ✓ {op} (via '{fp}'): {h.group(1)}")
                    break
            if op in found:
                break


async def find_hashes():
    sp_dc = os.environ.get("SP_DC", "")
    cookies = {"sp_dc": sp_dc} if sp_dc else {}

    async with AsyncSession(impersonate="chrome124") as session:
        # 1 — collect JS bundle URLs from the homepage
        print("Fetching Spotify homepage…")
        resp = await session.get("https://open.spotify.com/", cookies=cookies, headers=HEADERS)
        html = resp.text

        script_urls = list(dict.fromkeys(re.findall(
            r'src="(https://[^"]+\.js(?:\?[^"]*)?)"', html
        )))
        print(f"Found {len(script_urls)} JS bundle(s) in homepage:")
        for u in script_urls:
            print(f"  {u}")

        # 2 — also fetch the artist page to pick up lazy-loaded chunks
        print("\nFetching Taylor Swift artist page to load artist-specific chunks…")
        artist_resp = await session.get(
            "https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02",
            cookies=cookies,
            headers=HEADERS,
        )
        artist_html = artist_resp.text
        artist_scripts = list(dict.fromkeys(re.findall(
            r'src="(https://[^"]+\.js(?:\?[^"]*)?)"', artist_html
        )))
        all_urls = list(dict.fromkeys(script_urls + artist_scripts))
        new_urls = [u for u in artist_scripts if u not in script_urls]
        if new_urls:
            print(f"Found {len(new_urls)} additional chunk(s) on artist page:")
            for u in new_urls:
                print(f"  {u}")

        # 3 — also search inline <script> content
        found: dict = {}
        print("\nSearching inline scripts…")
        inline = re.findall(r'<script[^>]*>(.*?)</script>', html + artist_html, re.DOTALL)
        for blob in inline:
            search_hashes(blob, found)

        # 4 — fetch and search each JS bundle
        print(f"\nSearching {len(all_urls)} JS bundle(s)…")
        for url in all_urls:
            if len(found) == len(FINGERPRINTS):
                break
            try:
                r = await session.get(url, headers=HEADERS)
                search_hashes(r.text, found)
            except Exception as e:
                print(f"  Could not fetch {url}: {e}")

        # 5 — result
        print()
        if found:
            print("── Found hashes ──")
            for op, h in found.items():
                print(f"  {op}: {h}")
        missing = [op for op in FINGERPRINTS if op not in found]
        if missing:
            print(f"Not found: {missing}")
            print("The operation names or field structure may have changed in v2.")
            print("Check DevTools Payload tab on an artist page for the actual operationName values.")

    return found


if __name__ == "__main__":
    asyncio.run(find_hashes())
