# Roster

Music industry fantasy management game.

Sign real artists. Compete in leagues. Win with data.

## Stack

| Layer | Tech |
|-------|------|
| Backend API | Node.js + Express + TypeScript + Prisma |
| Database | PostgreSQL |
| Cache / Queues | Redis + BullMQ |
| Frontend | Next.js 14 + Tailwind CSS |
| Data Workers | BullMQ jobs (Spotify, YouTube, TikTok, Instagram) |

## Quick Start

```bash
# 1. Start Postgres + Redis
docker-compose up -d

# 2. Install dependencies
yarn install

# 3. Set up environment
cp .env.example .env
# Fill in API keys (Spotify, YouTube, Chartmetric, etc.)

# 4. Run database migrations + seed
yarn db:migrate
yarn db:seed

# 5. Run everything
yarn dev
```

- API: http://localhost:3001
- Frontend: http://localhost:3000
- DB Studio: `yarn db:studio`

## Folder Structure

```
├── backend/         Express API + Prisma schema
│   ├── prisma/      Schema + migrations + seed
│   └── src/
│       ├── routes/  artists, leagues, teams, market, auth
│       ├── db/      Prisma client
│       └── middleware/
├── workers/         BullMQ data jobs + scoring engine
│   └── src/
│       └── jobs/    spotify, chartmetric, youtube, social, scoring
├── frontend/        Next.js app
│   └── src/
│       ├── app/     dashboard, artists, market, league pages
│       ├── components/
│       └── lib/     API client + types
└── docs/
    └── GAME_DESIGN.md   Full game design document
```

## API Keys Needed

| Service | Purpose | Link |
|---------|---------|------|
| Spotify Web API | Artist metadata | https://developer.spotify.com |
| Chartmetric | Monthly listeners, streams | https://api.chartmetric.com |
| YouTube Data API v3 | Subscribers, views | https://console.cloud.google.com |
| Apify | Instagram + TikTok scraping | https://apify.com |
| Last.fm | Scrobbles (optional) | https://www.last.fm/api |

See `docs/GAME_DESIGN.md` for full rules, scoring system, and roadmap.
