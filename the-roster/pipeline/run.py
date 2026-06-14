"""Daily pipeline entry point for the Roster data pipeline.

Usage:
    python run.py                    # runs for today
    python run.py --date 2026-06-01  # runs for a specific date (backfill)
"""
from __future__ import annotations

import argparse
from datetime import date, timedelta

from compute_metrics import (
    classify_tier,
    compute_catalog_depth,
    compute_daily_streams,
    compute_listener_growth_28d,
    compute_momentum,
    compute_stream_velocity_7d,
)
from db import (
    get_all_artists,
    get_daily_streams_range,
    get_ml_n_days_ago,
    get_scrape_raw,
    update_artist_tier,
    upsert_artist_stats_daily,
)


def run(run_date: date = None) -> int:
    """Run the daily pipeline for run_date (defaults to today).

    Returns the number of artists processed.
    """
    if run_date is None:
        run_date = date.today()

    artists = get_all_artists()
    if not artists:
        print("No artists found in database — exiting.")
        return 0

    processed = 0

    for artist in artists:
        artist_id = artist["id"]
        name = artist["name"]

        today_row = get_scrape_raw(artist_id, run_date)
        if today_row is None:
            print(f"  SKIP {name}: no scrape_raw for {run_date}")
            continue

        ml = today_row.get("monthly_listeners")
        today_tracks = today_row.get("track_playcounts") or []

        # Daily stream delta
        yesterday_row = get_scrape_raw(artist_id, run_date - timedelta(days=1))
        yesterday_tracks = (yesterday_row.get("track_playcounts") or []) if yesterday_row else []
        daily_streams = compute_daily_streams(today_tracks, yesterday_tracks)

        # 7-day stream velocity
        streams_last_7 = sum(
            get_daily_streams_range(artist_id, run_date - timedelta(days=6), run_date)
        )
        streams_prev_7 = sum(
            get_daily_streams_range(artist_id, run_date - timedelta(days=13), run_date - timedelta(days=7))
        )
        velocity = compute_stream_velocity_7d(streams_last_7, streams_prev_7)

        # 28-day listener growth
        ml_28d = get_ml_n_days_ago(artist_id, 28, run_date)
        growth = compute_listener_growth_28d(ml, ml_28d) if (ml is not None and ml_28d is not None) else None

        # Catalog depth
        depth = compute_catalog_depth(today_tracks) if today_tracks else None

        # Momentum score
        momentum = compute_momentum(velocity, growth, depth)

        # Upsert artist_stats_daily
        upsert_artist_stats_daily(artist_id, run_date, {
            "monthly_listeners":   ml,
            "daily_streams_top10": daily_streams,
            "stream_velocity_7d":  velocity,
            "listener_growth_28d": growth,
            "catalog_depth_score": depth,
            "momentum_score":      momentum,
        })

        # Tier classification and update if changed
        if ml is not None:
            new_tier = classify_tier(ml)
            if new_tier != artist.get("tier"):
                update_artist_tier(artist_id, new_tier)
                print(f"  TIER {name}: {artist.get('tier')} -> {new_tier}")

        processed += 1
        print(f"  OK  {name} (ml={ml}, streams={daily_streams}, momentum={momentum})")

    return processed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Roster daily pipeline.")
    parser.add_argument("--date", help="ISO date to run for (default: today)", default=None)
    args = parser.parse_args()

    run_date = date.fromisoformat(args.date) if args.date else None
    count = run(run_date)
    print(f"\nDone. Processed {count} artists.")
