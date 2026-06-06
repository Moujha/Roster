"""Royalty computation functions for the Roster data pipeline."""
from decimal import Decimal

STREAM_RATE = Decimal('0.035')  # $0.035/stream (10x economy compression per GDD §6.1.1)


def compute_weekly_royalties(weekly_streams: int, rev_split_label_pct: float) -> Decimal:
    """Weekly royalties earned by the label for one active contract.

    Formula: weekly_streams * $0.035 * (rev_split_label_pct / 100)

    Args:
        weekly_streams:      Sum of daily_streams_top10 for the Mon–Sun week.
        rev_split_label_pct: Label's revenue share percentage, e.g. 30.0 means 30%.
    """
    return Decimal(weekly_streams) * STREAM_RATE * (Decimal(str(rev_split_label_pct)) / Decimal('100'))


def compute_buyout_penalty(weeks_remaining: int, weekly_royalties_est: Decimal) -> Decimal:
    """Early-drop buyout penalty deducted from the label's treasury.

    Formula: weeks_remaining * weekly_royalties_est * 0.5

    Args:
        weeks_remaining:       Full weeks left in the contract term.
        weekly_royalties_est:  Most recent weekly royalties figure for the contract.
    """
    return Decimal(weeks_remaining) * weekly_royalties_est * Decimal('0.5')
