# ROSTER — Game Design Document
**MVP · Source of Truth · Version 1.0 · May 2026 · Finalized**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Core Game Loop](#2-core-game-loop)
3. [Data Engine](#3-data-engine)
4. [Signing Mechanic](#4-signing-mechanic)
5. [Development Mechanic](#5-development-mechanic)
6. [Label Health Systems](#6-label-health-systems)
7. [Contract Expiry](#7-contract-expiry)
8. [Competitive Layer](#8-competitive-layer)
9. [Scouting](#9-scouting)
10. [Onboarding](#10-onboarding)
11. [Design Decisions Log](#11-design-decisions-log)
12. [Glossary](#glossary)
13. [Change Log](#change-log)

---

## 1. Overview

### 1.1 Concept

Roster is a persistent web-based record label management game built entirely on real, daily-refreshed Spotify data. Players act as independent label executives — scouting, signing, developing, and profiting from real artists whose streaming metrics update every 24 hours.

**Core premise:** You don't play *about* music. You play *with* music. Every stream, every chart position, every momentum spike is real.

### 1.2 Design Pillars

**Real as the core tension.** Artist behaviour is driven by real-world data. Players cannot control what an artist does — only how they position their label around it.

**Decision window matters.** Competitive advantage comes from *when* and *how* resources are allocated, not just which artists are chosen. Timing is skill.

**Asymmetric information.** Surface data is available to everyone. Deeper signals are gated behind progression. This gap is where expertise lives.

**Persistent identity.** The label has no hard end state. It accumulates history, reputation, and compounding decisions over time.

### 1.3 Confirmed Constraints (MVP)

| Parameter | Decision |
|---|---|
| Platform | Web (browser-first) |
| Data source | Spotify API — daily pull |
| Available signals | Monthly listeners · Top 10 track daily streams |
| Monetisation | None at MVP |
| Artist images | Not used (licensing) |
| Competitive model | Persistent label — rolling 90-day leaderboard, no season resets |
| Catalog discovery | Search-first, no open browser. Curated on-ramps for new players (§9.2). |

---

## 2. Core Game Loop

The loop runs on a weekly decision cadence, anchored by the daily Spotify data refresh.

### 2.1 Phase Overview

| Phase | Cadence | Player action |
|---|---|---|
| Scout | Daily browsing | Filter catalog · monitor Watchlist · spot momentum shifts |
| Sign | On demand | Make contract offer · set bonus, rev split, and term |
| Develop | Weekly | Allocate development budget across signed artists |
| Collect | Weekly (auto) | Royalties calculated from real streams × rev split × multipliers |
| Re-sign / Rotate | On contract expiry | Review P&L · re-sign, release, or drop the artist |

### 2.2 The Decision Cycle

One full loop takes seven real days:

- **Monday:** Player allocates weekly development budget
- **Tue–Sun:** Spotify data refreshes daily, Momentum Scores update, Watchlist alerts fire
- **Sunday:** Weekly royalty calculation runs — streams × rev split × active multipliers
- **Monday:** Player sees results, adjusts strategy, begins next cycle

> **Design intent:** Seven days is short enough to feel responsive, long enough that the music industry's natural pace feels respected. Players check in daily but only decide once a week.

---

## 3. Data Engine

### 3.1 Raw Signals (from Spotify)

| Signal | Description |
|---|---|
| Monthly listeners | 28-day rolling unique listener count. Updated daily. |
| Top 10 daily streams | Per-track daily stream count for an artist's 10 most-streamed tracks. |

### 3.2 Derived Metrics

| Derived metric | Formula / description |
|---|---|
| Stream velocity (7d) | % change in top-10 daily streams vs. 7 days ago. Primary momentum signal. |
| Listener growth (28d) | % change in monthly listeners vs. 28 days ago. Slower but more reliable. |
| Listener-to-stream ratio | Total daily streams ÷ monthly listeners ÷ 28. Above 0.15 = highly engaged fanbase. |
| Catalog depth score | Distribution of streams across top 10 tracks. Concentrated = fragile. Spread = durable. |
| Momentum Score (0–100) | Composite: velocity × 0.4 + listener growth × 0.35 + catalog depth × 0.25 |

> **Note on Momentum Score:** The formula is never exposed to players. They see the 0–100 output and learn to trust it through play. This preserves the feeling of reading the market rather than following a formula.

### 3.3 Breaking Alerts

When any signed or watchlisted artist's 7-day stream velocity exceeds a threshold (suggested: **+25% in a single day**), the game surfaces a Breaking Alert notification — the in-game equivalent of a viral moment.

- **Player response window:** 48 hours to invest a surge budget at a discounted rate
- **If no action taken:** the spike is still captured in royalties at base rate — not responding is a valid choice

### 3.4 Data Freshness & Lag

All players see data that is **48 hours old**. This simulates the information edge real A&R professionals operate with and provides a technical buffer for scraping delays.

### 3.5 Artist Catalog Scope

**Target:** 2,000–10,000 artists in the system. The catalog must be large enough that players regularly encounter artists others have not signed, creating genuine discovery value across all tiers and regions.

#### 3.5.1 Global Tiers

Artists are classified by global monthly listeners into four signable tiers plus one locked tier, with a flag-based override for regional markets:

| Tier | Global ML range | Signable |
|---|---|---|
| Underground | 0 – 50k | Yes |
| Emerging | 50k – 500k | Yes |
| Rising | 500k – 2M | Yes |
| Established | 2M – 10M | Yes |
| Regional Star | Top 50 home chart (any ML) | Yes — override |
| Major | 10M+ (no flag) | No |

#### 3.5.2 Underground Tier — The Conviction Bet

Underground artists (0–50k monthly listeners) are signable but operate under a different data contract. At this scale the Momentum Score is statistically unreliable.

- **No Momentum Score shown.** The artist profile displays raw data only: monthly listeners, top-track daily streams, 7-day stream bar chart.
- **Low signing cost.** Bonus range $500–$2k. Low enough to hold 2–3 speculative Underground bets simultaneously without straining the treasury.
- **Maximum upside.** A player who signs an artist at 20k listeners and holds a 12-month contract through a breakout to 800k locks in a pre-breakout rev split for the entire run.
- **Breaking alert threshold raised.** For Underground artists the alert fires at **+50% daily velocity** (vs +25% for other tiers) to filter noise.

> **Design intent:** Underground signing rewards prior musical knowledge above all else. This is the game's highest-skill, highest-variance play.

#### 3.5.3 Regional Star Flag — Solving the Geography Problem

Global monthly listener counts are biased toward English-language and US-adjacent markets. The Regional Star flag is applied to any artist ranking in the **top 50 of their home country's Spotify chart**.

- **Unlocks signing for Major-tier artists.** A French artist at 12M global ML is normally unsignable. With a Regional Star flag, they become signable at Established tier pricing.
- **Home Crowd bonus.** A **1.15× royalty multiplier** applied to streams from the artist's home country. Only players from that same country receive this bonus.
- **Surfaces in 'Trending in your region'.** Regional Stars from the player's own country appear in the regional on-ramp.
- **Cross-market availability.** Any player can sign a Regional Star regardless of their own country.

> **Example:** A French player searches 'Jul' (~9M global ML). Without the flag, Jul is unsignable. With the Regional Star flag active for France, Jul is signable at Established pricing with 1.15× Home Crowd bonus on French streams. A US player can also sign Jul but receives no bonus.

#### 3.5.4 Signing Bonus by Tier

| Tier | Monthly listeners | Signing bonus range |
|---|---|---|
| Underground | 0 – 50k | $500 – $2k |
| Emerging | 50k – 500k | $5k – $20k |
| Rising | 500k – 2M | $20k – $80k |
| Established | 2M – 10M | $80k – $300k |
| Regional Star (Major override) | 10M+ with home chart top 50 | $80k – $300k |
| Major | 10M+ | Not signable |

---

## 4. Signing Mechanic

### 4.1 Contract Variables

Every signing offer has exactly three variables:

**Signing bonus (one-time)**  
A single payment from the player's treasury at contract start. Market rate set by global monthly listener tier (see §3.5).

**Revenue split (ongoing)**  
The percentage of streaming royalties paid back to the artist. Artist default ask is **70%** (70/30 in artist's favour). Player can offer more generously to win competitive signings. Label reputation shifts what rev splits artists will accept (see §6.2).

**Contract term**

| Term | Character |
|---|---|
| 3 months | Low risk, low upside. Expires before most momentum arcs peak. |
| 6 months | Standard. Enough time to observe one full career phase. |
| 12 months | High commitment. Maximum upside if artist peaks during term; maximum risk if they decline. |

> **Core skill moment:** Reading whether an artist is at the start, middle, or end of their momentum arc — and choosing term length accordingly.

### 4.2 Roster Cap

**MVP roster cap: 5 artists maximum.** This forces genuine prioritisation and prevents players from diversifying away all risk.

### 4.3 Competitive Signing

Multiple players can sign the same artist simultaneously, each with their own terms and development strategy. There is no exclusive lock. The player who extracts more value from the same artist — through better timing, smarter development spend, or a more favourable rev split — wins.

---

## 5. Development Mechanic

> **Design principle:** Development investments create multipliers on real data — they never replace it. Real stream data always dominates. A well-invested label earns 20–35% more than an uninvested one on the same artist in a good week. **Maximum possible boost across all categories: +60%. Realistic well-invested week: +25–35%.**

### 5.1 Weekly Budget

Each week the player has a finite development budget to allocate across their signed artists.

**Budget = 12% of prior week's total royalty income** (midpoint of 10–15% range), split across roster at the player's discretion. A player typically concentrates 40–60% of the budget on one priority artist.

**Reference weekly budgets at 12% reinvestment rate (10× compression, 30% label rev split):**

| Tier | Weekly label income | Weekly dev budget (12%) |
|---|---|---|
| Underground | ~$260 | ~$31 |
| Emerging | ~$2,890 | ~$347 |
| Rising | ~$13,130 | ~$1,576 |
| Established | ~$63,000 | ~$7,560 |

Single-artist development allocation for a priority Emerging artist: **~$140–$210/wk** (40–60% of total budget). All spend tier examples below use this as the reference.

### 5.2 Playlist Pitching — Stream Volume Multiplier

Boosts total stream count for 7 days. Multiplicative on base streams. Decays fully after one week — requires ongoing spend to sustain.

| Spend tier | Cost (% of single-artist dev budget) | Multiplier |
|---|---|---|
| Light | 25% (~$50 for Emerging) | 1.08× (+8% streams) |
| Standard | 50% (~$100 for Emerging) | 1.15× (+15% streams) |
| Heavy | 100% (~$200 for Emerging) | 1.22× (+22% streams) |

**Diminishing returns:** Doubling spend does not double the return (8% → 15% → 22%).  
**Applies to base streams only:** Playlist pitching multiplier is calculated before other multipliers to prevent compounding abuse.

### 5.3 Social Push — Velocity Floor (Defensive)

Does not boost streams directly. Sets a **minimum weekly velocity floor** — preventing a bad real-world week from falling below a threshold. Primarily defensive.

| Spend tier | Cost (% of single-artist dev budget) | Velocity floor |
|---|---|---|
| Light | 25% (~$50 for Emerging) | Maximum weekly drop capped at −5% |
| Standard | 50% (~$100 for Emerging) | Maximum weekly drop capped at −2% |
| Heavy | 100% (~$200 for Emerging) | Streams cannot fall this week (0% floor) |

> **Example:** An artist's streams drop 18% in real life. Heavy social push → player sees 0% drop instead.

Not a permanent fix: If an artist drops 3 weeks running, the floor applies each week but the player is spending their entire budget on defence. The correct decision becomes dropping the artist, not sustaining the spend.

### 5.4 Release Amplification — Event Spike Multiplier

Triggered when a **new track enters the artist's Spotify top 10** (detected from the daily data pull, surfaced as a 48-hour event window).

A one-time investment drawn directly from the **treasury** — not from the weekly development budget — to preserve the player's ability to run playlist pitching simultaneously during a release week.

| Spend tier | Cost (one-time, from treasury) | Peak multiplier / decay |
|---|---|---|
| Light | 1× weekly dev budget (~$347 for Emerging) | 1.20× peak, linear decay to 1.0× over 14 days |
| Standard | 2× weekly dev budget (~$694 for Emerging) | 1.35× peak, linear decay to 1.0× over 14 days |
| Heavy | 3× weekly dev budget (~$1,041 for Emerging) | 1.50× peak, linear decay to 1.0× over 14 days |

**Integrated average:** Heavy release amplification averages ~1.25× across the 14-day window.  
**Player response window:** 48 hours from the new-track event to decide spend level.

### 5.5 Stacking Rules and Hard Cap

All three multipliers can be active simultaneously:

```
Final royalties = base streams × playlist pitching multiplier × release amplification multiplier × rev split %
```

Social push modifies the **floor** of base streams before the multipliers apply — it is not multiplicative.

**Hard cap: The combined volume multiplier (playlist pitching × release amplification) is capped at 1.60× regardless of spend.**

### 5.6 Sanity Check — Design Target Validation

Two labels hold the same Emerging artist (275k ML, ~$2,890/wk base income at 30% rev split):

| Scenario | Weekly royalties |
|---|---|
| Label A — well invested (standard playlist + light release week) | $2,890 × 1.15 × 1.10 = ~$3,658/wk (+27%) |
| Label B — no development spend | $2,890 × 1.0 = $2,890/wk |

**Difference:** +$768/wk. Over a 6-month contract: Label A earns ~$101k, Label B ~$75k. Delta: $26k.

Target confirmed: Label A earns 27% more from the same artist. Real stream data still dominates.

### 5.7 Feedback Loop

- **Monday:** Player allocates weekly development budget across signed artists
- **Tue–Sun:** Real streams arrive daily, multipliers apply in real time
- **Sunday:** Royalty calculation: base streams (floored by social push) × volume multipliers × rev split
- **Monday:** Player sees net result in dashboard, adjusts next week's allocation

---

## 6. Label Health Systems

### 6.1 Treasury

The label's cash position. All income and expenditure flows through the treasury:

| Flow | Direction |
|---|---|
| Weekly streaming royalties | In |
| Signing bonuses | Out |
| Weekly development spend | Out |
| Early contract termination penalty | Out |

#### 6.1.1 Economy Compression Ratio

The game economy uses real-world royalty proportions but applies a **10× compression multiplier** to all financial figures. Signing bonuses and royalties scale together, so relative economics stay honest while the decision cycle compresses to weeks rather than years.

> At real-world rates, an Emerging artist (275k ML) earns the label ~$289/wk at 30% rev split — break-even on a mid-range signing bonus takes 43 weeks. At 10× compression, the same artist earns ~$2,890/wk and break-even arrives in 4–5 weeks.

#### 6.1.2 Compressed Royalty Reference

Weekly label income at default 30% rev split, 10× compression, using 4× streams-per-listener and $0.0035/stream baseline:

| Tier | Midpoint ML | Weekly label income (30% cut) |
|---|---|---|
| Underground | 25k | ~$260 / wk |
| Emerging | 275k | ~$2,890 / wk |
| Rising | 1.25M | ~$13,130 / wk |
| Established | 6M | ~$63,000 / wk |

#### 6.1.3 Starting Treasury — $400,000

New players begin with **$400,000 in seed capital**, framed in-world as a silent backer investment.

> *"You've secured $400,000 in seed funding. Your backer expects results. Don't waste it."*

The $400,000 is designed to cover a specific first-six-weeks cash flow:

| Allocation | Amount | Rationale |
|---|---|---|
| First signing — Emerging (midpoint) | $125,000 | Signs one solid Emerging artist at fair market rate. Starts royalty income. |
| Speculative Underground signing | $10,000 | Low-cost conviction bet. Optional but encouraged. |
| 6-week development buffer | $60,000 | ~$10k/wk development spend while royalties ramp up. |
| Operating reserve | $205,000 | Covers a bad week, funds a second signing, absorbs early mistakes. |

#### 6.1.4 First Six Weeks Cash Flow

| Week | Treasury event |
|---|---|
| Week 1 | Sign Emerging artist (−$125k) + deploy Underground scout (−$10k if signing immediately). Treasury: ~$265k. |
| Week 2 | First royalties arrive (~$2,890). Development budget unlocks. Treasury: ~$258k after $10k dev spend. |
| Week 3–5 | Royalties compounding. Scout running in background. Treasury stabilising around $240–260k. |
| Week 6 | ~$17k royalties collected total. Treasury ~$282k. Underground scout nears completion. |
| Week 7–8 | Scout report ready. If signed: two-artist label earning ~$3,150/wk — self-sustaining. |

> **Design intent:** The player should never feel broke in the first six weeks. But they should feel every signing bonus is a meaningful commitment. $400k is generous enough to absorb one mistake, tight enough that wasting $125k on the wrong artist stings.

### 6.2 Label Reputation

A persistent **0–1000 point score** reflecting the quality of A&R decisions over time. Reputation changes only at discrete events — never passively.

#### 6.2.1 Reputation Tiers and Unlocks

| Tier | Range | Label status | Unlocks |
|---|---|---|---|
| New | 0 – 249 | Independent | Basic data, standard signing access, default rev split floors |
| Established | 250 – 599 | Established | Stream velocity + catalog depth on profiles, loyalty discount at re-sign, improved rev split acceptance |
| Veteran | 600 – 1000 | Veteran | Competitor scout counts on artist profiles, regional breakout signals, top Established artist signing access |

#### 6.2.2 Gaining Reputation — Positive Events

All reputation gains are event-driven, triggered at contract completion or specific milestones:

| Event | Points |
|---|---|
| Contract completes naturally (no early drop) | +15 |
| Artist listener growth exceeded baseline trajectory during term | +1 per % above baseline, capped at +40 |
| Artist tier upgraded during term (e.g. Emerging → Rising) | +30 |
| Player re-signed the artist at contract end | +10 |

**Maximum per exceptional contract: ~+85 points.**  
Path to Established (250 pts): 3 exceptional contracts, or 5–6 solid ones. A sharp player reaches Established within 3–4 months.

#### 6.2.3 The Baseline — Measuring Your Contribution

Growth reputation gain is calculated against the artist's trajectory at signing. The system records at contract start:
- Monthly listeners at signing date
- 28-day listener growth trend at signing (the **baseline trajectory**)

At contract end: `actual average monthly growth %` − `baseline growth %` = **growth contribution**. Only the delta above baseline earns reputation.

> **Example:** Artist was growing at +5%/month at signing. During your 6-month term they grew at +12%/month average. Your contribution: +7%/month × 6 months = +42, capped at +40.

#### 6.2.4 Viral Spike Edge Case

If an artist experiences a real-world viral moment during your contract term, the tier upgrade bonus (+30) still fires if a tier change results. The 'growth above baseline' points are capped normally at +40 — viral growth beyond that is not credited as your achievement.

#### 6.2.5 Losing Reputation — Negative Events

| Event | Points |
|---|---|
| Early contract drop (buyout) | −20 |
| Artist listener growth more than 20% below baseline during term | −10 |

**Floor: 0.** Reputation cannot go below 0.

#### 6.2.6 MVP Implementation Spec

```
On contract completion:
  growth_contribution = avg(actual_monthly_growth%) − baseline_monthly_growth%
  reputation_delta = +15 (completion)
                   + min(growth_contribution, 40) if growth_contribution > 0
                   − 10 if growth_contribution < −20%
                   + 30 if artist tier upgraded during term
                   + 10 if player re-signed the artist

On early drop:
  reputation_delta = −20

Floor: 0. Ceiling: 1000. No passive gain or decay between events.
```

### 6.3 Label History

A permanent, immutable log of every artist ever signed: their stats at signing, their stats at release, total royalties earned, total investment made, and net P&L. No resets.

---

## 7. Contract Expiry — The Core Decision Moment

When a contract expires, the player sees a full artist P&L for the contract period: total streams, total royalties, total development investment, net profit, and a momentum chart showing trajectory across the term.

Three options are available:

### 7.1 Re-sign

The artist's asking price is recalculated based on current real-world stats. If the artist grew during the contract period, they cost more. A **loyalty discount** applies if label reputation is high.

### 7.2 Release

The player releases the artist back to the free catalog. Other players may now sign them. The player banks the earned royalties and frees up a roster slot. Strategically correct when an artist has peaked.

### 7.3 Drop (Early Termination)

The player can terminate a contract before its natural expiry by paying a **buyout penalty** — a fraction of the remaining contract's projected royalty value. Reputation is slightly penalised (−20).

> **Design intent:** The re-sign screen is the emotional climax of each artist arc — the player sees the full history of their relationship with that artist and decides what comes next. This is real A&R work.

---

## 8. Competitive Layer

### 8.1 Rolling 90-Day Leaderboard

No seasons. No resets. The primary leaderboard ranks all players by **total label revenue in the last 90 real days**, updated daily.

The 90-day window is long enough to prevent single viral signings from dominating, short enough for a skilled new player to climb meaningfully within a quarter.

### 8.2 Secondary Rankings

| Ranking | Metric |
|---|---|
| Best emerging label | Revenue from artists who had under 1M monthly listeners at signing |
| Most efficient label | Revenue per dollar spent (rewards frugal operators) |
| Best eye for talent | Average listener growth % across all signed artists during their contract term |

### 8.3 Non-Zero-Sum Competition

Multiple players can hold the same artist simultaneously. Competition is not about locking out opponents — it is about extracting more value from the same artist through superior timing, smarter development, and better contract terms.

---

## 9. Scouting

> **Design decisions (v0.4):** No open catalog browser. Discovery is search-first with curated on-ramps. Watchlist is a passive social curation tool — no alerts. Active scouting is a separate, resource-constrained mechanic with finite slots, a defined duration, and a completed report as its output.

### 9.1 Discovery Model — Search-First

Players do not browse a full artist catalog. The primary interface is a **search bar**: type an artist name to pull up their profile, data, and signing options.

> **Design intent:** Real A&R is not about filtering a spreadsheet — it is about believing in something before the data confirms it. Players who already know the music scene have a real, legitimate edge. That asymmetry is a feature, not a bug.

### 9.2 Curated On-Ramps (New Player Scaffolding)

Three curated surfaces provide scaffolded entry points without exposing a full browsable catalog:

| On-ramp | Description |
|---|---|
| Breaking this week | 5 artists flagged as having exceptional velocity. Refreshes every Monday. |
| Your genre picks | 3 artists from the player's selected genres (chosen during onboarding). |
| Trending in your region | 3–5 artists with strong momentum in the player's country. Changes weekly. |

**Constraint:** On-ramps surface a maximum of **5–8 artists at a time**. They are prompts for search, not alternate catalog browsers.

### 9.3 Watchlist — Passive Social Curation

The Watchlist is a simple, passive curation tool. Any artist — signed or unsigned — can be saved to it.

- **No alerts. No thresholds. No automation.** Players check in manually.
- **Public visibility:** Each player's Watchlist is visible to others — seeing a competitor watching an unfamiliar artist is a discovery signal in itself.
- **Social currency:** A player who added an artist 10 weeks before they broke has a visible, timestamped record of that conviction. This is the 'I called it' moment — the primary social currency of the game.

### 9.4 Scout Slots — The Active Scouting System

Scouting is a separate, resource-constrained mechanic. The player deploys a finite number of scout slots on specific artists. Over a defined period, the scout builds a report producing information that a casual search or Watchlist cannot provide.

#### 9.4.1 Slot Capacity

**Players have 8 scout slots maximum.** The roster cap is 5, so slots always exceed the roster — the player is always building a pipeline simultaneously.

#### 9.4.2 Scouting Duration by Tier

| Tier | Base scouting duration |
|---|---|
| Underground | 8 weeks |
| Emerging | 6 weeks |
| Rising | 4 weeks |
| Established | 3 weeks |

#### 9.4.3 Roster Affinity Modifier

If the player already has a signed artist from the same **country or genre** as the artist being scouted, scouting duration is reduced by **20%**.

- Country match and genre match each contribute independently, but the total cap is 20%.
- **Strategic implication:** A label that commits to a scene scouts that scene faster, compounding its information advantage.

> **Example:** A label with two signed French rap artists scouts a third. Base duration: 6 weeks (Emerging). Affinity modifier applied: 5 weeks (rounded).

#### 9.4.4 The Scout Report

When scouting completes, a report is generated with three outputs:

| Report output | Description |
|---|---|
| Pattern classification | Organic / Spike-driven / Mixed. Characterises the shape of daily stream data over the scouting period. |
| Precise signing bonus | Instead of a tier range (e.g. '$20k–$80k'), gives a specific figure with confidence interval (e.g. '$34k ± 5k'). |
| Momentum confidence | Is the artist's Momentum Score stable or volatile? Displayed as Stable / Moderate / Volatile. |

The slot frees up when the player signs the artist or manually cancels the scout. Signing before the report completes forfeits the outputs — acting on incomplete information is a valid decision.

**Scout report UI:** Inline panel on the artist profile page, revealed below the standard data when a report is ready. No modal, no separate page — three labelled data rows with a short interpretation line each.

#### 9.4.5 The Scouting Timeframe

Two loops running in parallel:

- **Weekly loop (foreground):** Monday budget allocation → daily stream updates → Sunday royalty calculation → repeat.
- **Scouting loop (background):** Scout deployed → 3–8 weeks of passive observation → report ready event → sign, cancel, or hold slot.

### 9.5 Artist Profile — Data Visibility by Scout Status

| Field | Availability |
|---|---|
| Name, genre, tier, region | Always |
| Momentum Score + 28d sparkline | Always (hidden for Underground — raw data shown instead) |
| Monthly listeners (current + 28d change) | Always |
| Top 10 tracks, 7-day stream bars | Always |
| Stream velocity (7d), listener-to-stream ratio | Established label reputation+ |
| Catalog depth score | Established label reputation+ |
| Pattern classification (Organic / Spike / Mixed) | Completed scout report only |
| Precise signing bonus estimate | Completed scout report only |
| Momentum confidence (Stable / Moderate / Volatile) | Completed scout report only |
| Signed by N labels (contract status) | Always |
| Active competitor scouts on this artist | Veteran label reputation only |
| Watchlist button | Always |
| Scout status (Deploy / In progress / Report ready) | Always |
| Sign button | Always (roster slot required) |

### 9.6 Information Asymmetry (Progression)

| Reputation stage | Data unlocked |
|---|---|
| New label | Momentum Score, monthly listeners, basic tier, career stage |
| Established label | 7-day stream velocity, listener growth trend (28d), catalog depth score |
| Veteran label | Genre trend context, regional breakout signal, number of active competitor scouts on this artist |

---

## 10. Onboarding — First 15 Minutes

The onboarding sequence must get the player to their first signed artist within 15 minutes.

### 10.1 Design Constraints

- No tutorial walls. Every step must feel like playing, not being taught.
- First signature must happen in session one. The royalty drip is the retention hook.
- Prior music knowledge should be immediately rewarded, not neutralised by forced tutorials.

### 10.2 Onboarding Flow

**Step 1 — Label creation (2 min)**  
The player names their label. No logo upload, no elaborate customisation. Screen: single input, large text, dark background. Ghost text: *"What's your label called?"*

**Step 2 — Genre declaration (1 min)**  
*"What music do you know?"* The player selects 1–2 genres from a visual grid (not a dropdown). Genre tiles show real genre names — Hip-hop, not 'Urban'. Afrobeats, not 'World'.

**Step 3 — First artist suggestion (3 min)**  
Exactly 3 artist profiles side by side. Each shows: name, Momentum Score, monthly listeners, and a one-line data hook (e.g. "Up 34% this week").

- Option A: Player recognises one and searches directly → rewarded for prior knowledge
- Option B: Player clicks one of the 3 → guided into the artist profile page
- Option C: Player ignores all 3 and types in the search bar → respected, game steps back

The search bar is always visible and always active. Players who know what they want should never be forced through suggestions.

**Step 4 — First artist profile (3 min)**  
A single contextual tooltip appears on the Momentum Score: *"This score combines streaming growth, listener momentum, and catalog depth. Higher = more heat right now."* That is the **only tooltip** in the entire onboarding.

**Step 5 — First signing offer (4 min)**  
The signing screen shows the three contract variables with sensible defaults pre-filled (midpoint bonus, 70/30 rev split, 6-month term). A live preview shows estimated weekly royalties. Player confirms → artist signed, treasury deducted, roster slot filled.

**Step 6 — First week framing (2 min)**  
A single post-signing screen explains the weekly cadence as a label memo framed in-world:

> *Welcome to the label. Your first artist is signed. Royalties start flowing from their real Spotify streams — updated every day. Every Monday you'll allocate your development budget. Every Sunday your weekly royalties land. The leaderboard updates daily. Now find your next artist.*

### 10.3 What Onboarding Deliberately Excludes

- No tutorial on the leaderboard — discovered naturally after the first royalty payout
- No explanation of development budget — surfaced only when the first Monday allocation prompt appears
- No walkthrough of contract expiry — irrelevant until the first contract approaches its end
- No forced Watchlist tutorial — the feature is visible and self-explanatory

---

## 11. Design Decisions Log

All design questions have been resolved. This section is the complete decision log.

| Decision | Resolution |
|---|---|
| Starting treasury | $400,000 seed capital. 10× economy compression applied. See §6.1. |
| Development multiplier values | All three categories fully specified in §5. Hard cap at 1.60× combined. |
| Artist catalog curation | Player-sourced model. Operator seeds initial catalog; players submit artists. |
| Regional Star flag threshold | Top 50 per country. Consistent across all markets. |
| Regional leaderboard | Not in MVP. Global 90-day leaderboard already captures Home Crowd bonus revenue. |
| Underground data presentation | 'Low signal' badge in place of Momentum Score with one-line explanation. 7-day bar chart + raw listener count only. |
| Reputation scoring formula | 0–1000 point scale. Three tiers. Event-driven only. Full spec in §6.2. |
| Leaderboard introduction timing | Surface passively at end of week 1, immediately after first royalty payout notification. |
| Curated on-ramp refresh logic | Fully algorithmic: top 5 by 7-day stream velocity gain (Breaking this week), top 3–5 by velocity within player's country (Trending in your region). Operator can suppress any result. |
| Scout slot capacity progression | Flat 8 slots for MVP. If playtesting reveals players feel capped, add +2 at Established and +2 at Veteran post-launch. |
| Affinity modifier scope | Country and genre only for MVP. No expansion until validated in playtesting. |
| Scout report UI | Inline panel on artist profile page. No modal. Three labelled data rows. |

---

## Glossary

| Term | Definition |
|---|---|
| Momentum Score | Composite 0–100 index derived from stream velocity, listener growth, and catalog depth. Not shown for Underground artists. |
| Stream velocity | 7-day percentage change in an artist's top-10 daily streams. |
| Listener-to-stream ratio | Measures how frequently fans replay an artist's music. Proxy for fanbase depth. Above 0.15 = highly engaged. |
| Catalog depth score | How evenly streams are distributed across an artist's top 10 tracks. Higher = more durable. |
| Breaking alert | Notification triggered when a signed or watchlisted artist's single-day stream velocity exceeds +25% (Underground: +50%). |
| Rev split | Revenue split between artist and label. Expressed as artist% / label%. Default: 70/30. |
| Development budget | Weekly pool of in-game currency available to allocate across signed artists as multiplier investments. 12% of prior week's royalties. |
| Release amplification | Development investment category applied during the first 14 days of a new track's release. Peak 1.20–1.50×, treasury-funded, 14-day linear decay. |
| Buyout penalty | Cost to terminate a contract early. Calculated as a fraction of remaining projected royalty value. |
| Label reputation | Persistent 0–1000 score reflecting historical A&R quality. Affects signing access, rev split thresholds, and loyalty discounts. Event-driven only. |
| Rolling 90-day leaderboard | Primary competitive ranking. Total label revenue over the last 90 real days. Updates daily. No resets. |
| Watchlist | Player-curated list of artists. Passive, unlimited, no alerts. Publicly visible with timestamps. |
| Scout slot | Active resource deployed on a specific artist. 8 max. Runs 3–8 weeks. Produces a scout report on completion. |
| Scout report | Three outputs: pattern classification (Organic/Spike/Mixed), precise signing bonus estimate, momentum confidence (Stable/Moderate/Volatile). |
| Pattern classification | Scout report output. Characterises an artist's daily stream shape as Organic, Spike-driven, or Mixed. |
| Momentum confidence | Scout report output. Rates how stable the Momentum Score has been during scouting. Stable / Moderate / Volatile. |
| Roster affinity modifier | 20% scouting duration reduction when existing signed artists share a country or genre with the artist being scouted. |
| Curated on-ramps | Three small, regularly refreshed surfaces (Breaking this week, Your genre picks, Trending in your region) for new player scaffolding. |
| Search-first model | Core discovery philosophy: players must know or find an artist's name. No open catalog browser. |
| Underground tier | Artists with 0–50k global monthly listeners. Signable. No Momentum Score shown. Highest risk, highest potential upside. |
| Regional Star flag | Applied to artists ranking in the top 50 of their home country's Spotify chart. Unlocks Major-tier signing at Established pricing. |
| Home Crowd bonus | 1.15× royalty multiplier on streams from a Regional Star's home country. Only applies to players from that same country. |
| Economy compression ratio | 10× multiplier applied uniformly to all financial figures. Preserves real-world proportions, compresses decision cycle from years to weeks. |
| Starting treasury | $400,000 seed capital. Covers 6 weeks of label operations before royalties become self-sustaining. |
| Playlist pitching | Development investment. Applies 1.08–1.22× multiplier to weekly stream volume. Decays after 7 days. |
| Social push | Development investment. Sets minimum weekly velocity floor (−5% to 0%). Defensive mechanic. |
| Velocity floor | Minimum weekly stream change percentage enforced by social push. Heavy = 0% floor. |
| Development hard cap | Combined playlist pitching × release amplification multiplier cannot exceed 1.60×. |
| Baseline trajectory | Artist's 28-day listener growth trend recorded at signing. Benchmark for reputation calculation. |
| Growth contribution | Difference between actual average monthly listener growth during a contract term and the baseline trajectory at signing. |

---

## Change Log

| Version | Changes |
|---|---|
| v0.1 — May 2026 | Initial draft. All core systems defined: data engine, signing, development, label health, contract expiry, competitive layer, scouting. |
| v0.2 — May 2026 | Scouting redesigned: search-first model adopted. Curated on-ramps (§9.2). Watchlist social layer expanded (§9.3). Full onboarding flow added as §10. |
| v0.3 — May 2026 | Artist tier model overhauled (§3.5). Underground tier added. Regional Star flag introduced. Home Crowd bonus (1.15×) defined. |
| v0.4 — May 2026 | Scouting system redesigned (§9). Watchlist simplified. Active scouting introduced: 8 scout slots, tier-based duration (3–8 weeks), roster affinity modifier (−20%), scout report with three outputs. |
| v0.5 — May 2026 | Treasury system fully specified (§6.1). 10× economy compression established. Starting treasury set at $400,000. 6-week cash flow arc defined. |
| v0.6 — May 2026 | Development mechanic fully specified (§5). Playlist pitching (1.08–1.22×), social push (velocity floor −5% to 0%), release amplification (1.20–1.50× peak, 14-day decay). 1.60× hard cap defined. |
| v0.7 — May 2026 | Reputation system fully specified (§6.2). 0–1000 scale, three tiers (New/Established/Veteran), event-driven only. Baseline trajectory mechanic defined. |
| v0.8 — May 2026 | All remaining open questions resolved. GDD fully resolved — all systems specified, no open design blockers. |
| v1.0 — May 2026 | Document finalized. All systems locked. No open questions remaining. Ready for technical specification phase. |

---

*ROSTER GDD v1.0 — Finalized. All systems specified. No open design blockers.*
