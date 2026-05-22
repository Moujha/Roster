"""
Daily scoring pipeline — entry point (Step 2 of the daily workflow).

Reads scrape data written by `python -m scraper.main` (Step 1),
computes scores and market prices, and upserts to artist_stats + market_prices.

Run manually:
  cd pipeline && python run.py

Scheduled via .github/workflows/pipeline.yml (daily at 07:00 UTC, after scraper).
"""
import sys
from datetime import date

from db import (
    get_all_artists,
    get_latest_scrape,
    get_prev_scrape,
    get_prev_stats,
    get_prev_price,
    upsert_artist_stats,
    upsert_market_price,
)
from fetchers.charts import fetch_global_chart, build_artist_chart_map
from scorer import compute_score, compute_market_price


def run(run_date: date = None) -> int:
    """
    Runs the scoring pipeline for run_date (defaults to today).
    Returns the number of errors so CI can fail on non-zero.
    """
    if run_date is None:
        run_date = date.today()

    print(f"=== Scoring pipeline: {run_date} ===")

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

    # 3. Score, price, upsert — reads scrape data from artist_stats_daily
    success = 0
    errors = 0
    skipped = 0
    for artist in artists:
        name        = artist["name"]
        artist_id   = artist["id"]
        spotify_id  = artist["spotify_id"]
        try:
            scrape_data = get_latest_scrape(artist_id, run_date)
            if not scrape_data:
                print(f"  SKIP {name} — no scrape data for {run_date} (run scraper first)")
                skipped += 1
                continue

            chart_data = chart_map.get(spotify_id)
            prev_scrape = get_prev_scrape(artist_id, run_date)
            prev_price  = get_prev_price(artist_id, run_date)

            score = compute_score(scrape_data, chart_data, prev_scrape)
            price = compute_market_price(scrape_data, prev_price)

            upsert_artist_stats(artist_id, run_date, scrape_data, chart_data, score)
            upsert_market_price(artist_id, run_date, price)

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

    print(f"\nDone: {success} succeeded, {skipped} skipped, {errors} failed")
    return errors


if __name__ == "__main__":
    sys.exit(run())
