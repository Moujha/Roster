"""
Unit tests for scorer.py — no credentials required.
Run: python test_scorer.py
"""
import sys
from scorer import compute_score, compute_market_price, _score_followers, _score_chart_rank

PASS = 0
FAIL = 0


def check(label: str, actual, expected):
    global PASS, FAIL
    if actual == expected:
        print(f"  PASS  {label}")
        PASS += 1
    else:
        print(f"  FAIL  {label}: got {actual!r}, expected {expected!r}")
        FAIL += 1


def approx(a, b, tol=0.01):
    return abs(a - b) <= tol


# ── _score_followers ──────────────────────────────────────────────
print("follower tiers")
check("50M+",   _score_followers(50_000_000), 25.0)
check("20M+",   _score_followers(25_000_000), 20.0)
check("5M+",    _score_followers(6_000_000),  15.0)
check("1M+",    _score_followers(2_000_000),  10.0)
check("100K+",  _score_followers(500_000),    5.0)
check("<100K",  _score_followers(50_000),     1.0)

# ── _score_chart_rank ─────────────────────────────────────────────
print("chart rank tiers")
check("rank 1",   _score_chart_rank(1),    25.0)
check("rank 3",   _score_chart_rank(3),    20.0)
check("rank 10",  _score_chart_rank(10),   16.0)
check("rank 25",  _score_chart_rank(25),   12.0)
check("rank 50",  _score_chart_rank(50),   8.0)
check("rank 100", _score_chart_rank(100),  4.0)
check("rank 200", _score_chart_rank(200),  2.0)
check("no chart", _score_chart_rank(None), 0.0)

# ── compute_score ─────────────────────────────────────────────────
print("compute_score")
artist = {"popularity": 80, "followers": {"total": 10_000_000}}
score = compute_score(artist, chart_data=None, prev_stats=None)
# streams = 80*0.5=40, social=15 (5M+), charts=0, momentum=0
assert approx(score["streams"], 40.0),  f"streams {score['streams']}"
assert approx(score["social"],  15.0),  f"social {score['social']}"
assert approx(score["charts"],   0.0),  f"charts {score['charts']}"
assert approx(score["momentum"], 0.0),  f"momentum {score['momentum']}"
assert approx(score["total"],   55.0),  f"total {score['total']}"
print("  PASS  base score (no chart, no prev)")
PASS += 1

score2 = compute_score(artist, chart_data={"best_rank": 5, "total_streams": 1_000_000})
assert approx(score2["charts"], 20.0), f"charts {score2['charts']}"
assert approx(score2["total"],  75.0), f"total {score2['total']}"
print("  PASS  score with chart #5")
PASS += 1

# momentum: prev popularity was 60 → streams_score was 30; now 40 → delta=+10 → capped at +5
prev = {"score_breakdown": {"streams": 30.0}}
score3 = compute_score(artist, chart_data=None, prev_stats=prev)
assert approx(score3["momentum"], 5.0), f"momentum {score3['momentum']}"
print("  PASS  momentum capped at +5")
PASS += 1

# ── compute_market_price ──────────────────────────────────────────
print("compute_market_price")
# 10M followers → base $2M; popularity 80 → modifier 0.8+(80/100)*0.4=1.12
price = compute_market_price(artist, prev_price=None)
expected_price = round(2_000_000 * (0.8 + 0.8 * 0.4), 2)
assert approx(price["price"], expected_price, tol=1.0), f"price {price['price']}"
assert price["price_change_pct"] is None
print(f"  PASS  price=${price['price']:,.2f}, no prev")
PASS += 1

price2 = compute_market_price(artist, prev_price=2_000_000.0)
assert price2["price_change_pct"] is not None
print(f"  PASS  price_change_pct={price2['price_change_pct']}%")
PASS += 1

# ── summary ───────────────────────────────────────────────────────
print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(FAIL)
