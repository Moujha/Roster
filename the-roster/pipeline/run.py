"""
Daily data pipeline — entry point.

Execution order:
  1. Load all artists from the DB
  2. Fetch the Spotify Global Weekly Top 200 chart (one request)
  3. Fetch Spotify artist metadata in batches of 50
  4. For each artist: compute score + price, upsert to DB

Run manually:
  cd pipeline && python run.py

Scheduled via .github/workflows/pipeline.yml (daily at 07:00 UTC).
"""
import sys
from datetime import date

from db import (
    get_all_artists,
    get_prev_stats,
    get_prev_price,
    upsert_artist_stats,
    upsert_market_price,
)
from fetchers.spotify import fetch_artists_batch
from fetchers.charts import fetch_global_chart, build_artist_chart_map
from scorer import compute_score, compute_market_price


def _chunks(lst: list, n: int):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


def run(run_date: date = None) -> int:
    """
    Runs the full pipeline for run_date (defaults to today).
    Returns the number of errors so CI can fail on non-zero.
    """
    if run_date is None:
        run_date = date.today()

    print(f"=== Pipeline run: {run_date} ===")

    # 1. Load artists
    artists = get_all_artists()
    if not artists:
        print("No artists in DB. Run seed.py first.")
        return 0
    print(f"Artists to process: {len(artists)}")

    # 2. Chart data (one request covers all artists)
    print("Fetching Spotify Global Weekly chart...")
    chart_entries = fetch_global_chart()
    chart_map = build_artist_chart_map(chart_entries)
    print(f"  {len(chart_entries)} chart entries, {len(chart_map)} unique charting artists")

    # 3. Spotify metadata in batches of 50
    print("Fetching Spotify artist metadata...")
    spotify_ids = [a["spotify_id"] for a in artists]
    spotify_map: dict = {}
    for batch in _chunks(spotify_ids, 50):
        for artist_data in fetch_artists_batch(batch):
            spotify_map[artist_data["id"]] = artist_data
    print(f"  Fetched {len(spotify_map)} / {len(artists)} artists from Spotify")

    # 4. Score, price, upsert
    success = 0
    errors = 0
    for artist in artists:
        name = artist["name"]
        try:
            spotify_data = spotify_map.get(artist["spotify_id"])
            if not spotify_data:
                print(f"  SKIP {name} — not found in Spotify API response")
                continue

            chart_data  = chart_map.get(artist["spotify_id"])
            prev_stats  = get_prev_stats(artist["id"], run_date)
            prev_price  = get_prev_price(artist["id"], run_date)

            score = compute_score(spotify_data, chart_data, prev_stats)
            price = compute_market_price(spotify_data, prev_price)

            upsert_artist_stats(artist["id"], run_date, spotify_data, chart_data, score)
            upsert_market_price(artist["id"], run_date, price)

            chart_info = f" chart=#{chart_data['best_rank']}" if chart_data else ""
            print(
                f"  OK  {name}: "
                f"score={score['total']}{chart_info} "
                f"price=${price['price']:,.0f}"
            )
            success += 1
        except Exception as exc:
            print(f"  ERR {name}: {exc}")
            errors += 1

    print(f"\nDone: {success} succeeded, {errors} failed")
    return errors


if __name__ == "__main__":
    sys.exit(run())
