@the-roster/CLAUDE.md

# ROSTER — Game Design Reference
> Full spec: `docs/GDD.md`. This file is the quick-reference for implementation decisions.

---

## Key Constants

| Constant | Value | GDD ref |
|---|---|---|
| Starting treasury | $400,000 | §6.1.3 |
| Economy compression ratio | 10× (applied uniformly to all $ figures) | §6.1.1 |
| Roster cap | 5 artists max | §4.2 |
| Scout slots | 8 max | §9.4.1 |
| Default rev split (artist/label) | 70 / 30 | §4.1 |
| Weekly dev budget | 12% of prior week's royalties | §5.1 |
| Data lag | 48 hours (all players see data 48h old) | §3.4 |
| Leaderboard window | Rolling 90 days, no resets | §8.1 |
| Breaking alert threshold | +25% single-day velocity (Underground: +50%) | §3.3 |
| Development hard cap | 1.60× combined (playlist × release) | §5.5 |

---

## Artist Tiers

| Tier | Monthly listeners | Signable | Signing bonus |
|---|---|---|---|
| Underground | 0 – 50k | Yes | $500 – $2k |
| Emerging | 50k – 500k | Yes | $5k – $20k |
| Rising | 500k – 2M | Yes | $20k – $80k |
| Established | 2M – 10M | Yes | $80k – $300k |
| Regional Star | Top 50 home chart (any ML) | Yes — Major override | $80k – $300k |
| Major | 10M+ (no flag) | **No** | — |

**Underground special rule:** No Momentum Score shown — raw data only. Breaking alert fires at +50% (not +25%). See §3.5.2.

**Regional Star special rule:** Home Crowd bonus = 1.15× royalties on streams from artist's home country. Only applies to players from that same country. See §3.5.3.

---

## Development Multipliers

### Playlist Pitching (stream volume, 7-day duration, resets weekly)
| Spend | Cost vs single-artist dev budget | Multiplier |
|---|---|---|
| Light | 25% | 1.08× |
| Standard | 50% | 1.15× |
| Heavy | 100% | 1.22× |

### Social Push (velocity floor, defensive — does not boost streams)
| Spend | Cost vs single-artist dev budget | Floor |
|---|---|---|
| Light | 25% | −5% max drop |
| Standard | 50% | −2% max drop |
| Heavy | 100% | 0% (streams cannot fall) |

### Release Amplification (event-triggered, treasury-funded, 14-day linear decay)
Triggered when a new track enters the artist's Spotify top 10. Player has 48h to invest.
| Spend | Cost (from treasury, not dev budget) | Peak multiplier |
|---|---|---|
| Light | 1× weekly dev budget | 1.20× |
| Standard | 2× weekly dev budget | 1.35× |
| Heavy | 3× weekly dev budget | 1.50× |

**Royalty formula:** `base streams × playlist pitching × release amplification × rev split %`  
Social push modifies the floor of base streams *before* multipliers — it is not multiplicative.  
**Hard cap: playlist pitching × release amplification ≤ 1.60× regardless of spend.**

---

## Compressed Royalty Reference
*10× compression, 30% label rev split, 4× streams-per-listener, $0.0035/stream*

| Tier | Midpoint ML | Weekly label income | Weekly dev budget (12%) |
|---|---|---|---|
| Underground | 25k | ~$260 | ~$31 |
| Emerging | 275k | ~$2,890 | ~$347 |
| Rising | 1.25M | ~$13,130 | ~$1,576 |
| Established | 6M | ~$63,000 | ~$7,560 |

---

## Contract Terms
| Term | Character |
|---|---|
| 3 months | Low risk, low upside |
| 6 months | Standard (pre-filled default) |
| 12 months | High commitment, max upside/risk |

Early drop penalty = −20 reputation. See §7.3.

---

## Label Reputation (0–1000, event-driven only, never passive)

| Tier | Range | Key unlocks |
|---|---|---|
| New | 0 – 249 | Basic data, standard access |
| Established | 250 – 599 | Stream velocity, catalog depth, loyalty discount at re-sign |
| Veteran | 600 – 1000 | Competitor scout counts, regional breakout signals |

**Reputation events:**
- Contract completes naturally: +15
- Listener growth above baseline trajectory: +1 per % above, capped +40
- Artist tier upgraded during term: +30
- Player re-signed the artist: +10
- Early drop: −20
- Growth 20%+ below baseline: −10
- Floor: 0

Reputation gain measured against **baseline trajectory at signing**, not absolute growth. See §6.2.3.

---

## Scouting

| Tier | Base duration | With affinity modifier (−20%) |
|---|---|---|
| Underground | 8 weeks | 6–7 weeks |
| Emerging | 6 weeks | 5 weeks |
| Rising | 4 weeks | 3 weeks |
| Established | 3 weeks | 2–3 weeks |

**Affinity modifier:** −20% if existing signed artist shares country or genre. Cap is 20% total. See §9.4.3.

**Scout report outputs (3):** Pattern classification (Organic/Spike/Mixed) · Precise signing bonus estimate · Momentum confidence (Stable/Moderate/Volatile). See §9.4.4.

---

## Discovery Model (Search-First)

No open catalog browser. Players find artists by name via search bar. Three curated on-ramps (5–8 artists max each, never a full browser):
1. **Breaking this week** — top 5 by 7-day velocity gain, refreshes Monday
2. **Your genre picks** — 3 artists from player's selected genres
3. **Trending in your region** — 3–5 artists by velocity in player's country

See §9.1–§9.2.

---

## Data Visibility by Progression

| Data field | Required |
|---|---|
| Momentum Score, monthly listeners, tier | Always |
| Underground: raw data only, no score | Always (Underground only) |
| Stream velocity (7d), listener-to-stream ratio, catalog depth | Established reputation+ |
| Pattern classification, precise bonus, momentum confidence | Completed scout report |
| Competitor scout counts on artist | Veteran reputation only |

---

## Momentum Score Formula (internal only — never shown to players)
```
velocity × 0.4 + listener_growth_28d × 0.35 + catalog_depth × 0.25
```
Output: 0–100. Not shown for Underground artists. See §3.2.
