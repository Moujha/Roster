"""
Seed the artists table with an initial curated set.

Run once after deploying the schema:
  cd the-roster/pipeline && python seed.py

No Spotify API credentials needed — artist names are hardcoded.
image_url and genre are left null; the scraper fills them in on first run.
"""
from db import get_client

SEED_ARTISTS = [
    # ── Superstars (50M+ followers) ──────────────────────────────
    {"spotify_id": "06HL4z0CvFAxyc27GXpf02", "name": "Taylor Swift"},
    {"spotify_id": "3TVXtAsR1Inumwj472S9r4", "name": "Drake"},
    {"spotify_id": "1Xyo4u8uXC1ZmMpatF05PJ", "name": "The Weeknd"},
    {"spotify_id": "4q3ewBCX7sLwd24euuV69X", "name": "Bad Bunny"},
    {"spotify_id": "6eUKZXaKkcviH0Ku9w2n3V", "name": "Ed Sheeran"},
    {"spotify_id": "1uNFoZAHBGtllmzznpCI3s", "name": "Justin Bieber"},
    {"spotify_id": "66CXWjxzNUsdJxJ2JdwvnR", "name": "Ariana Grande"},
    # ── A-list (10M–50M followers) ────────────────────────────────
    {"spotify_id": "246dkjvS1zLTtiykXe5h60", "name": "Post Malone"},
    {"spotify_id": "0Y5tJX1MQlPlqiwlOH1tJY", "name": "Travis Scott"},
    {"spotify_id": "2YZyLoL8N0Wb9xBt1NhZWg", "name": "Kendrick Lamar"},
    {"spotify_id": "7tYKF4w9nC0nq9CsPZTHyP", "name": "SZA"},
    {"spotify_id": "790FomKkXshlbRYZFtlgla", "name": "Karol G"},
    {"spotify_id": "6qqNVTkY8uBg9cP3Jd7DAH", "name": "Billie Eilish"},
    {"spotify_id": "3Nrfpe0tUJi4K4DXYWgMUX", "name": "BTS"},
    # ── Rising (1M–10M followers) ─────────────────────────────────
    {"spotify_id": "2h93pZq0e7k5yf4dywlkpM", "name": "Olivia Rodrigo"},
    {"spotify_id": "6KImCVD70vtIoJWnq6nGn3", "name": "Harry Styles"},
    {"spotify_id": "4MCBfE4596Uoi2O4DtmEMz", "name": "Juice WRLD"},
    {"spotify_id": "1McMsnEElThX1knmY4oliG", "name": "Ozuna"},
    # ── Wildcards (genre diversity) ───────────────────────────────
    {"spotify_id": "0oSGxfWSnnOXhD2fKuz2Gy", "name": "David Bowie"},
    {"spotify_id": "4tZwfgrHOc3mvqYlEYSvVi", "name": "Daft Punk"},
    {"spotify_id": "6l3HvQ5sa6mXTsMTB19rO5", "name": "J. Cole"},
    {"spotify_id": "3Y7RZ31TRPVadSFVy1o8os", "name": "H.E.R."},
]


def seed() -> None:
    client = get_client()
    result = (
        client.table("artists")
        .upsert(SEED_ARTISTS, on_conflict="spotify_id")
        .execute()
    )
    print(f"Seeded {len(result.data)} artists:")
    for row in sorted(result.data, key=lambda r: r["name"]):
        print(f"  {row['name']}")


if __name__ == "__main__":
    seed()
