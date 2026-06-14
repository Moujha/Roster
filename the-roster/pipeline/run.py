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
from fetchers.charts import fetch_country_chart
from db import (
    get_all_artists,
    get_artists_with_country,
    get_daily_streams_range,
    get_ml_n_days_ago,
    get_scrape_raw,
    bulk_set_regional_star,
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

    update_regional_stars()

    return processed


def update_regional_stars() -> None:
    """Update is_regional_star for all artists based on their country's top-50 chart.

    If a country chart fetch fails, that country is skipped — flags are never
    cleared due to a network error.
    """
    artists = get_artists_with_country()
    if not artists:
        return

    by_country: dict[str, list[dict]] = {}
    for a in artists:
        country = (a.get("country") or "").upper()
        if country:
            by_country.setdefault(country, []).append(a)

    star_ids: list[str] = []
    non_star_ids: list[str] = []

    for country, country_artists in by_country.items():
        entries = fetch_country_chart(country)
        if not entries:
            print(f"  [regional_star] {country}: no chart data, skipping")
            continue

        top50_spotify_ids = {
            artist_id
            for entry in entries
            if (entry.get("rank") or 999) <= 50
            for artist_id in entry.get("artist_ids", [])
        }

        stars = 0
        for a in country_artists:
            spotify_id = a.get("spotify_id")
            if not spotify_id:
                continue
            if spotify_id in top50_spotify_ids:
                star_ids.append(a["id"])
                stars += 1
            else:
                non_star_ids.append(a["id"])
        print(f"  [regional_star] {country}: {stars}/{len(country_artists)} stars")

    bulk_set_regional_star(star_ids, non_star_ids)
    print(f"  [regional_star] Done: {len(star_ids)} stars, {len(non_star_ids)} cleared")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Roster daily pipeline.")
    parser.add_argument("--date", help="ISO date to run for (default: today)", default=None)
    args = parser.parse_args()

    run_date = date.fromisoformat(args.date) if args.date else None
    count = run(run_date)
    print(f"\nDone. Processed {count} artists.")
