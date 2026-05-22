"""
Captures persisted query hashes by intercepting real browser network requests.
Uses Playwright to load an artist page and record what Spotify's web player sends.

One-time setup:
  pip install playwright
  playwright install chromium

Usage:
  cd the-roster/pipeline
  python get_spotify_hashes.py
"""
import asyncio
import json
import os
import sys
from dotenv import load_dotenv

load_dotenv()

ARTIST_URL = "https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02"  # Taylor Swift
TARGET_OPS  = {"queryArtistOverview", "queryArtistDiscographyAll", "getAlbum"}


async def capture():
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Playwright not installed. Run:")
        print("  pip install playwright && playwright install chromium")
        sys.exit(1)

    sp_dc = os.environ.get("SP_DC", "")
    if not sp_dc:
        print("Warning: SP_DC not set in .env — page may not load as authenticated user.")

    queries: dict = {}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context()

        if sp_dc:
            await context.add_cookies([{
                "name":   "sp_dc",
                "value":  sp_dc,
                "domain": ".spotify.com",
                "path":   "/",
                "secure": True,
            }])

        page = await context.new_page()

        def on_request(request):
            if "pathfinder/v2/query" not in request.url:
                return
            try:
                body = json.loads(request.post_data or "{}")
            except Exception:
                return
            op   = body.get("operationName", "")
            ext  = body.get("extensions", {})
            h    = (ext.get("persistedQuery") or {}).get("sha256Hash", "")
            if op and h and op not in queries:
                queries[op] = h
                print(f"  ✓ {op}: {h}")

        page.on("request", on_request)

        print(f"Loading artist page: {ARTIST_URL}")
        await page.goto(ARTIST_URL, wait_until="networkidle", timeout=30_000)

        # Scroll to trigger discography lazy-loads
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(3)

        await browser.close()

    print()
    if not queries:
        print("No queries captured. Make sure SP_DC is set and the page loaded correctly.")
        return {}

    missing = TARGET_OPS - set(queries)
    found   = {op: h for op, h in queries.items() if op in TARGET_OPS}

    print("── Captured hashes ──")
    for op, h in queries.items():
        marker = "  ← needed" if op in TARGET_OPS else ""
        print(f"  {op}: {h}{marker}")

    if missing:
        print(f"\nStill missing: {sorted(missing)}")
        print("Navigate to an album page to capture getAlbum, then re-run.")
    else:
        print("\n── Paste into queries.py ──")
        for op, h in found.items():
            print(f'  {op}: "{h}"')

    return queries


if __name__ == "__main__":
    asyncio.run(capture())
