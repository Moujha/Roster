"""Tests for royalties.py — run with: pytest test_royalties.py -v"""
from decimal import Decimal
import pytest
from royalties import compute_weekly_royalties, compute_buyout_penalty, STREAM_RATE


# ── STREAM_RATE constant ──────────────────────────────────────────────────────

def test_stream_rate_value():
    assert STREAM_RATE == Decimal('0.035')


# ── compute_weekly_royalties ──────────────────────────────────────────────────

def test_weekly_royalties_gdd_sanity_check():
    # GDD §6.1.2: 275k streams * $0.035 * 30% = $2,887.50
    result = compute_weekly_royalties(275_000, 30.0)
    assert result == Decimal('2887.50')

def test_weekly_royalties_zero_streams():
    assert compute_weekly_royalties(0, 30.0) == Decimal('0.00')

def test_weekly_royalties_zero_split():
    assert compute_weekly_royalties(100_000, 0.0) == Decimal('0.00')

def test_weekly_royalties_full_split():
    # 100_000 * 0.035 * 1.0 = 3500.00
    result = compute_weekly_royalties(100_000, 100.0)
    assert result == Decimal('3500.00')

def test_weekly_royalties_small_streams():
    # 1000 * 0.035 * 30% = 10.50
    result = compute_weekly_royalties(1_000, 30.0)
    assert result == Decimal('10.50')

def test_weekly_royalties_returns_decimal():
    result = compute_weekly_royalties(10_000, 25.0)
    assert isinstance(result, Decimal)


# ── compute_buyout_penalty ────────────────────────────────────────────────────

def test_buyout_penalty_basic():
    # 4 weeks * $100/wk * 0.5 = $200
    result = compute_buyout_penalty(4, Decimal('100.00'))
    assert result == Decimal('200.00')

def test_buyout_penalty_zero_weeks():
    assert compute_buyout_penalty(0, Decimal('500.00')) == Decimal('0.00')

def test_buyout_penalty_zero_royalties():
    assert compute_buyout_penalty(12, Decimal('0.00')) == Decimal('0.00')

def test_buyout_penalty_returns_decimal():
    result = compute_buyout_penalty(6, Decimal('250.00'))
    assert isinstance(result, Decimal)

def test_buyout_penalty_fractional():
    # 3 weeks * $33.33 * 0.5 = $49.995 — verify rounding behaviour (no assert on exact value)
    result = compute_buyout_penalty(3, Decimal('33.33'))
    assert result == Decimal('3') * Decimal('33.33') * Decimal('0.5')
