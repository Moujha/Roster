"""Supabase client and all database accessors for the Phase 1 pipeline."""
from __future__ import annotations

import os
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

_client: Optional[Client] = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _client


# ── Artists ───────────────────────────────────────────────────────────────────

def get_all_artists() -> list[dict]:
    """Return all artists: id, spotify_id, name, tier."""
    result = get_client().table("artists").select("id,spotify_id,name,tier").execute()
    return result.data


def update_artist_tier(artist_id: str, tier: str) -> None:
    """Set artists.tier and artists.tier_updated_at to today."""
    get_client().table("artists").update({
        "tier": tier,
        "tier_updated_at": date.today().isoformat(),
    }).eq("id", artist_id).execute()


# ── scrape_raw ────────────────────────────────────────────────────────────────

def get_scrape_raw(artist_id: str, on_date: date) -> dict | None:
    """Return the scrape_raw row for (artist_id, on_date), or None."""
    result = (
        get_client()
        .table("scrape_raw")
        .select("*")
        .eq("artist_id", artist_id)
        .eq("scraped_at", on_date.isoformat())
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def insert_scrape_raw(
    artist_id: str,
    scraped_at: date,
    monthly_listeners: int,
    track_playcounts: list,
) -> None:
    """Upsert one row into scrape_raw on (artist_id, scraped_at)."""
    get_client().table("scrape_raw").upsert(
        {
            "artist_id":         artist_id,
            "scraped_at":        scraped_at.isoformat(),
            "monthly_listeners": monthly_listeners,
            "track_playcounts":  track_playcounts or None,
        },
        on_conflict="artist_id,scraped_at",
    ).execute()


def get_ml_n_days_ago(artist_id: str, n: int, before_date: date) -> int | None:
    """Return monthly_listeners from scrape_raw exactly n days before before_date."""
    target = (before_date - timedelta(days=n)).isoformat()
    result = (
        get_client()
        .table("scrape_raw")
        .select("monthly_listeners")
        .eq("artist_id", artist_id)
        .eq("scraped_at", target)
        .limit(1)
        .execute()
    )
    if result.data and result.data[0]["monthly_listeners"] is not None:
        return int(result.data[0]["monthly_listeners"])
    return None


# ── artist_stats_daily ────────────────────────────────────────────────────────

def get_daily_streams_range(
    artist_id: str,
    start_date: date,
    end_date: date,
) -> list[int]:
    """Return non-null daily_streams_top10 values for artist in [start_date, end_date]."""
    result = (
        get_client()
        .table("artist_stats_daily")
        .select("daily_streams_top10")
        .eq("artist_id", artist_id)
        .gte("date", start_date.isoformat())
        .lte("date", end_date.isoformat())
        .not_.is_("daily_streams_top10", "null")
        .execute()
    )
    return [int(row["daily_streams_top10"]) for row in result.data]


def upsert_artist_stats_daily(artist_id: str, run_date: date, row: dict) -> None:
    """Upsert one row into artist_stats_daily on (artist_id, date)."""
    payload = {"artist_id": artist_id, "date": run_date.isoformat(), **row}
    get_client().table("artist_stats_daily").upsert(
        payload, on_conflict="artist_id,date"
    ).execute()


def get_weekly_streams(artist_id: str, week_end: date) -> int:
    """Sum daily_streams_top10 for the 7 days Mon–Sun ending on week_end."""
    week_start = week_end - timedelta(days=6)
    streams = get_daily_streams_range(artist_id, week_start, week_end)
    return sum(streams)


# ── Contracts ─────────────────────────────────────────────────────────────────

def expire_contracts() -> list[str]:
    """Set status='expired' for all active contracts past their end_date.

    Returns the list of expired contract IDs.
    """
    result = (
        get_client()
        .table("contracts")
        .update({"status": "expired"})
        .eq("status", "active")
        .lte("end_date", date.today().isoformat())
        .select("id,label_id,artist_id,signing_bonus,rev_split_label_pct,"
                "royalties_earned,dev_spend_total,baseline_listeners,start_date,end_date")
        .execute()
    )
    return [row["id"] for row in result.data] if result.data else []


def get_active_contracts() -> list[dict]:
    """Return all active contracts: id, label_id, artist_id, rev_split_label_pct."""
    result = (
        get_client()
        .table("contracts")
        .select("id,label_id,artist_id,rev_split_label_pct")
        .eq("status", "active")
        .execute()
    )
    return result.data


def apply_royalties(contract_id: str, label_id: str, royalties: Decimal) -> None:
    """Add royalties to contracts.royalties_earned and labels.treasury atomically.

    Reads current values first, then writes incremented values. Not
    transactional at the DB level — acceptable for the daily cron context
    where this is the only writer.
    """
    client = get_client()

    contract_row = (
        client.table("contracts")
        .select("royalties_earned")
        .eq("id", contract_id)
        .single()
        .execute()
    ).data
    label_row = (
        client.table("labels")
        .select("treasury")
        .eq("id", label_id)
        .single()
        .execute()
    ).data

    new_earned = Decimal(str(contract_row["royalties_earned"])) + royalties
    new_treasury = Decimal(str(label_row["treasury"])) + royalties

    client.table("contracts").update(
        {"royalties_earned": str(new_earned)}
    ).eq("id", contract_id).execute()

    client.table("labels").update(
        {"treasury": str(new_treasury)}
    ).eq("id", label_id).execute()


# ── label_history ─────────────────────────────────────────────────────────────

def write_label_history(
    contract: dict,
    artist: dict,
    listeners_at_end: int | None,
    reason: str,
) -> None:
    """Insert a completed-contract row into label_history.

    net_pnl = total_royalties - signing_bonus - dev_spend_total

    Args:
        contract:        Full contracts row dict (must have id, label_id, artist_id,
                         signing_bonus, royalties_earned, dev_spend_total,
                         baseline_listeners).
        artist:          artists row dict (must have name, tier).
        listeners_at_end: Current monthly_listeners, or None if unavailable.
        reason:          'natural' or 'dropped'.
    """
    signing_bonus    = Decimal(str(contract["signing_bonus"]))
    total_royalties  = Decimal(str(contract["royalties_earned"]))
    total_dev_spend  = Decimal(str(contract.get("dev_spend_total", 0) or 0))
    net_pnl          = total_royalties - signing_bonus - total_dev_spend

    get_client().table("label_history").insert({
        "label_id":             contract["label_id"],
        "contract_id":          contract["id"],
        "artist_name":          artist["name"],
        "artist_tier":          artist["tier"],
        "listeners_at_signing": contract.get("baseline_listeners"),
        "listeners_at_end":     listeners_at_end,
        "signing_bonus":        str(signing_bonus),
        "total_royalties":      str(total_royalties),
        "total_dev_spend":      str(total_dev_spend),
        "net_pnl":              str(net_pnl),
        "reason":               reason,
        "completed_at":         date.today().isoformat(),
    }).execute()
