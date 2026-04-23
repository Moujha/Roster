"""
Seed the artists table with an initial curated set.

Run once after deploying the schema:
  cd pipeline && python seed.py

Artists are chosen across tiers (superstars → rising) and genres so the
game has meaningful price variation from day one.
Add or remove Spotify IDs from SEED_ARTISTS freely — duplicates are ignored
(upsert on spotify_id).
"""
import sys
from db import get_client
from fetchers.spotify import fetch_artists_batch


# Spotify artist IDs — edit this list to add/remove artists
SEED_ARTISTS = [
    # ── Superstars (50M+ followers) ──────────────────────────────
    "06HL4z0CvFAxyc27GXpf02",  # Taylor Swift
    "3TVXtAsR1Inumwj472S9r4",  # Drake
    "1Xyo4u8uXC1ZmMpatF05PJ",  # The Weeknd
    "4q3ewBCX7sLwd24euuV69X",  # Bad Bunny
    "6eUKZXaKkcviH0Ku9w2n3V",  # Ed Sheeran
    "1uNFoZAHBGtllmzznpCI3s",  # Justin Bieber
    "66CXWjxzNUsdJxJ2JdwvnR",  # Ariana Grande
    # ── A-list (10M–50M followers) ────────────────────────────────
    "246dkjvS1zLTtiykXe5h60",  # Post Malone
    "0Y5tJX1MQlPlqiwlOH1tJY",  # Travis Scott
    "2YZyLoL8N0Wb9xBt1NhZWg",  # Kendrick Lamar
    "7tYKF4w9nC0nq9CsPZTHyP",  # SZA
    "790FomKkXshlbRYZFtlgla",  # Karol G
    "6qqNVTkY8uBg9cP3Jd7DAH",  # Billie Eilish
    "3Nrfpe0tUJi4K4DXYWgMUX",  # BTS
    # ── Rising (1M–10M followers) ─────────────────────────────────
    "2h93pZq0e7k5yf4dywlkpM",  # Olivia Rodrigo
    "6KImCVD70vtIoJWnq6nGn3",  # Harry Styles
    "4MCBfE4596Uoi2O4DtmEMz",  # Juice WRLD
    "1McMsnEElThX1knmY4oliG",  # Ozuna
    # ── Wildcards (genre diversity) ───────────────────────────────
    "0oSGxfWSnnOXhD2fKuz2Gy",  # David Bowie (legacy catalogue)
    "4tZwfgrHOc3mvqYlEYSvVi",  # Daft Punk (legacy)
    "6l3HvQ5sa6mXTsMTB19rO5",  # J. Cole
    "1Fid2jjqsHViMX6xNH70hE",  # H.E.R.
]


def seed() -> None:
    client = get_client()

    # Fetch in batches (SEED_ARTISTS may exceed 50)
    all_data = []
    for i in range(0, len(SEED_ARTISTS), 50):
        batch = fetch_artists_batch(SEED_ARTISTS[i : i + 50])
        all_data.extend(batch)

    rows = []
    for a in all_data:
        images = a.get("images") or []
        genres = a.get("genres") or []
        rows.append({
            "spotify_id": a["id"],
            "name": a["name"],
            "image_url": images[0]["url"] if images else None,
            "genre": genres[0] if genres else None,
        })

    if not rows:
        print("No artist data returned from Spotify. Check your API credentials.")
        sys.exit(1)

    result = (
        client.table("artists")
        .upsert(rows, on_conflict="spotify_id")
        .execute()
    )

    print(f"Seeded {len(result.data)} artists:")
    for row in sorted(result.data, key=lambda r: r["name"]):
        print(f"  {row['name']}")


if __name__ == "__main__":
    seed()
