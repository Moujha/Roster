# Roster — Game Design Document v0.1

## Concept

**Roster** is a fantasy management game set in the music industry.
Players act as A&R executives / label managers, signing real artists to their
virtual roster and competing in weekly leagues based on real-world streaming,
chart, and social media data.

Inspired by **Football Manager** (depth, management sim, transfers) and
**Mon Petit Gazon** (fantasy points, head-to-head leagues, weekly scoring).

---

## Core Loop

```
Draft / Sign Artists → Artists earn real-world points → Weekly scoring
→ Leaderboard update → Transfer window → Repeat
```

1. **Pre-season draft** — auction or snake draft to build starting roster
2. **Weekly gameweeks** — points calculated from real data (Monday → Sunday)
3. **Transfer market** — buy/sell/trade artists between gameweeks
4. **Season end** — winner takes the league prize pool (virtual currency)

---

## Artist Tiers & Market Values

| Tier | Monthly Listeners | Starting Value (GR) | Weekly Salary (GR) | Example Artists |
|------|------------------|---------------------|--------------------|-----------------|
| S (Superstar) | 50M+ | 40M – 100M | 800k | Taylor Swift, Drake, Weeknd |
| A (A-List) | 10M – 50M | 8M – 40M | 200k | Doja Cat, Olivia Rodrigo |
| B (Established) | 1M – 10M | 1M – 8M | 40k | Rema, FKJ, Amaarae |
| C (Rising) | 100k – 1M | 200k – 1M | 8k | Emerging breakout acts |
| D (Emerging) | < 100k | 50k – 200k | 1k | Underground / blog buzz |

**Starting budget per manager:** 100,000,000 GR (Gold Records)
**Roster size:** 12 artists minimum, 20 maximum
**Salary cap:** Managers must maintain positive weekly cash flow

---

## Weekly Scoring System

### Streaming (Spotify Weekly Streams)

| Weekly Streams | Points |
|----------------|--------|
| < 500k | 2 |
| 500k – 2M | 5 |
| 2M – 10M | 12 |
| 10M – 50M | 25 |
| 50M – 200M | 50 |
| 200M+ | 100 |

### Growth Bonus (week-over-week stream growth)

| Growth % | Bonus Points |
|----------|-------------|
| +10% | +5 |
| +25% | +15 |
| +50% | +30 |
| +100% (viral) | +60 |

### Monthly Listener Milestones (one-time bonus when crossed)

| Milestone | Bonus |
|-----------|-------|
| 1M | +50 |
| 5M | +100 |
| 10M | +150 |
| 25M | +200 |
| 50M | +300 |

### Chart Positions (Billboard Hot 100 / Global Spotify)

| Position | Points |
|----------|--------|
| #1 | +100 |
| Top 5 | +60 |
| Top 10 | +40 |
| Top 25 | +20 |
| Top 50 | +10 |
| Top 100 | +5 |

### Social Media (weekly)

| Metric | Points |
|--------|--------|
| Instagram: every 500k followers | +1 (cap 15) |
| Instagram engagement rate > 3% | +10 |
| TikTok: trending sound (>500k videos) | +25 |
| TikTok: >10M sound uses in week | +50 |
| YouTube: #1 trending video | +30 |
| YouTube: weekly video > 10M views | +20 |

### Release Bonuses

| Event | Bonus |
|-------|-------|
| Album release week | +75 |
| EP release | +40 |
| Single release | +20 |
| Feature on #1 track | +35 |
| Tour announced (major venue) | +15 |
| Award win (Grammy/MTV/BET) | +50 |

### Penalty Events

| Event | Points |
|-------|--------|
| Streaming decline > 30% week-over-week | -15 |
| Controversy / cancellation event | -40 |
| Label dispute / hiatus announced | -25 |
| No release in > 16 weeks (stagnation penalty) | -5 |

---

## Transfer Market

- **Transfer windows:** Open 48h between gameweeks (Fri 18:00 – Sun 12:00)
- **Pricing:** Market value fluctuates based on recent performance
  - +5% per week of scoring above their tier average
  - -3% per week of underperformance
  - +20% spike on album release week
- **Loan deals:** Borrow an artist for 3 weeks at 30% of market value (no ownership)
- **Bidding wars:** Multiple managers can bid; highest bid wins after window closes
- **Free agents:** Artists not on any roster are free to sign at base market value

---

## Deal Mechanics (Label Simulation)

Inspired by real music industry deals, managers can negotiate:

| Deal Type | Cost Multiplier | Benefit |
|-----------|----------------|---------|
| Exclusive Deal | 1.5x market value | No other manager can sign them |
| Development Deal | 0.6x market value | Long-term; artist grows faster |
| 360 Deal | 2x market value | Points from touring + merch included |
| Feature Deal | Fixed 500k GR | Artist featured on your #1 (bonus points) |
| Radio Promo Deal | 200k GR/week | +10 pts/week from radio play |

---

## League Types

### Classic League (Mon Petit Gazon style)
- 8–16 managers
- Head-to-head weekly matchups
- Season: 20 gameweeks
- Playoffs: Top 4 in final 4 weeks

### Open League (cumulative)
- Up to 100 managers
- Ranked by total points accumulated
- Weekly prize for top performer

### Draft League (Football Manager style)
- Snake draft at season start
- Each artist can only be owned by one manager
- Trade system with offers/counter-offers
- Waiver wire for dropped artists

### Grand Prix (monthly)
- Short 4-week sprints
- No draft — buy any artist
- Lower budget (20M GR)

---

## Data Sources

| Platform | API | Refresh Rate | Metrics |
|----------|-----|-------------|---------|
| Spotify | Spotify Web API + Chartmetric | Daily | Monthly listeners, weekly streams, chart positions |
| YouTube | YouTube Data API v3 | Daily | Subscribers, video views, trending |
| Instagram | Unofficial / Apify | Weekly | Followers, engagement rate |
| TikTok | Unofficial / Apify | Daily | Followers, sound uses, trending |
| Billboard | Scraper / Chartmetric | Weekly | Hot 100, genre charts |
| Apple Music | Unofficial | Weekly | Chart positions |
| Last.fm | Last.fm API | Weekly | Scrobbles, listeners |
| Songkick / Bandsintown | Official API | Weekly | Tour dates, venues |
| News | Google News API | Daily | Press mentions |

---

## Roadmap

### Phase 1 — Foundation (current)
- [ ] Project setup (monorepo, DB, API)
- [ ] Spotify data ingestion pipeline
- [ ] Artist catalog with ~5,000 artists seeded
- [ ] Basic scoring engine
- [ ] User auth + team management

### Phase 2 — Core Game
- [ ] League creation and management
- [ ] Transfer market
- [ ] Frontend dashboard
- [ ] Draft system

### Phase 3 — Social Data
- [ ] TikTok + Instagram workers
- [ ] News sentiment scoring
- [ ] Real-time notifications

### Phase 4 — Deals & Advanced
- [ ] Deal system
- [ ] Mobile-responsive UI
- [ ] Public API for stats
- [ ] Season history
