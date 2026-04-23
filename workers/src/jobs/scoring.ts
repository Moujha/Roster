import { PrismaClient, Artist, ArtistMetricsSnapshot } from "@prisma/client";

const prisma = new PrismaClient();

export interface PointsBreakdown {
  streaming: number;
  streamGrowth: number;
  listenerMilestone: number;
  charts: number;
  instagram: number;
  tiktok: number;
  youtube: number;
  release: number;
  penalty: number;
  total: number;
}

// ─── Streaming points ────────────────────────────────────────────────────────

function streamingPoints(weeklyStreams: number): number {
  if (weeklyStreams >= 200_000_000) return 100;
  if (weeklyStreams >= 50_000_000) return 50;
  if (weeklyStreams >= 10_000_000) return 25;
  if (weeklyStreams >= 2_000_000) return 12;
  if (weeklyStreams >= 500_000) return 5;
  return 2;
}

// ─── Week-over-week growth bonus ─────────────────────────────────────────────

function growthBonus(growthPct: number): number {
  if (growthPct >= 100) return 60;
  if (growthPct >= 50) return 30;
  if (growthPct >= 25) return 15;
  if (growthPct >= 10) return 5;
  return 0;
}

// ─── Monthly listener milestone (compare to previous snapshot) ───────────────

function milestoneBonus(current: number, previous: number): number {
  const milestones = [1_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000];
  const bonuses = [50, 100, 150, 200, 300];
  let bonus = 0;
  for (let i = 0; i < milestones.length; i++) {
    if (previous < milestones[i] && current >= milestones[i]) {
      bonus += bonuses[i];
    }
  }
  return bonus;
}

// ─── Chart position points ───────────────────────────────────────────────────

function chartPoints(peakPosition: number | null | undefined): number {
  if (!peakPosition) return 0;
  if (peakPosition === 1) return 100;
  if (peakPosition <= 5) return 60;
  if (peakPosition <= 10) return 40;
  if (peakPosition <= 25) return 20;
  if (peakPosition <= 50) return 10;
  if (peakPosition <= 100) return 5;
  return 0;
}

// ─── Instagram points ────────────────────────────────────────────────────────

function instagramPoints(followers: number, engagementRate: number): number {
  const followerPts = Math.min(Math.floor(followers / 500_000), 15);
  const engagementBonus = engagementRate > 3 ? 10 : 0;
  return followerPts + engagementBonus;
}

// ─── TikTok points ───────────────────────────────────────────────────────────

function tiktokPoints(soundUses: number): number {
  if (soundUses >= 10_000_000) return 50;
  if (soundUses >= 500_000) return 25;
  return 0;
}

// ─── YouTube points ──────────────────────────────────────────────────────────

function youtubePoints(weeklyViews: number): number {
  if (weeklyViews >= 10_000_000) return 20;
  return 0;
}

// ─── Penalty points ──────────────────────────────────────────────────────────

function penaltyPoints(growthPct: number): number {
  if (growthPct <= -30) return -15;
  return 0;
}

// ─── Main scoring function ───────────────────────────────────────────────────

export function calculateWeeklyPoints(
  snapshot: Partial<ArtistMetricsSnapshot>,
  previousSnapshot: Partial<ArtistMetricsSnapshot> | null
): PointsBreakdown {
  const streaming = streamingPoints(snapshot.weeklyStreams ?? 0);
  const growth = growthBonus(snapshot.streamGrowthPct ?? 0);
  const milestone = milestoneBonus(
    snapshot.monthlyListeners ?? 0,
    previousSnapshot?.monthlyListeners ?? 0
  );
  const charts = chartPoints(snapshot.spotifyGlobalPeak ?? snapshot.billboardHot100Peak);
  const ig = instagramPoints(snapshot.instagramFollowers ?? 0, snapshot.instagramEngagement ?? 0);
  const tt = tiktokPoints(snapshot.tiktokSoundUses ?? 0);
  const yt = youtubePoints(snapshot.youtubeWeeklyViews ?? 0);
  const penalty = penaltyPoints(snapshot.streamGrowthPct ?? 0);

  const total = streaming + growth + milestone + charts + ig + tt + yt + penalty;

  return {
    streaming,
    streamGrowth: growth,
    listenerMilestone: milestone,
    charts,
    instagram: ig,
    tiktok: tt,
    youtube: yt,
    release: 0, // set separately when release events are ingested
    penalty,
    total,
  };
}

// ─── Score all artists for a gameweek ────────────────────────────────────────

export interface ScoreGameweekJob {
  gameweekId: string;
  leagueId: string;
}

export async function scoreGameweek(job: { data: ScoreGameweekJob }) {
  const { gameweekId, leagueId } = job.data;

  const gameweek = await prisma.gameweek.findUnique({
    where: { id: gameweekId },
  });
  if (!gameweek || gameweek.isScored) return;

  // Pull the latest snapshots tied to this gameweek
  const snapshots = await prisma.artistMetricsSnapshot.findMany({
    where: { gameweekId },
    include: { artist: true },
  });

  console.log(`Scoring ${snapshots.length} artist snapshots for gameweek ${gameweek.number}`);

  for (const snapshot of snapshots) {
    const previousSnapshot = await prisma.artistMetricsSnapshot.findFirst({
      where: {
        artistId: snapshot.artistId,
        snapshotDate: { lt: snapshot.snapshotDate },
      },
      orderBy: { snapshotDate: "desc" },
    });

    const breakdown = calculateWeeklyPoints(snapshot, previousSnapshot);

    await prisma.artistMetricsSnapshot.update({
      where: { id: snapshot.id },
      data: {
        weeklyPoints: breakdown.total,
        pointsBreakdown: breakdown as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });

    await prisma.artist.update({
      where: { id: snapshot.artistId },
      data: {
        weeklyScore: breakdown.total,
        totalScore: { increment: breakdown.total },
        updatedAt: new Date(),
      },
    });
  }

  // Update market values based on performance
  await updateMarketValues(snapshots.map((s) => s.artist));

  // Score all teams in this league
  await scoreTeams(leagueId, gameweekId, snapshots);

  await prisma.gameweek.update({
    where: { id: gameweekId },
    data: { isScored: true, scoredAt: new Date() },
  });

  console.log(`Gameweek ${gameweek.number} scored.`);
}

// ─── Update market values ────────────────────────────────────────────────────

async function updateMarketValues(artists: Artist[]) {
  for (const artist of artists) {
    // Simple value model: base value per tier × performance factor
    const tierBase: Record<string, bigint> = {
      S: 50_000_000n, A: 10_000_000n, B: 1_000_000n, C: 200_000n, D: 50_000n,
    };
    const base = tierBase[artist.tier] ?? 100_000n;
    const performanceFactor = 1 + artist.weeklyScore / 1000;
    const newValue = BigInt(Math.floor(Number(base) * performanceFactor));

    await prisma.artist.update({
      where: { id: artist.id },
      data: { marketValue: newValue },
    });
  }
}

// ─── Score teams from artist scores ─────────────────────────────────────────

async function scoreTeams(
  leagueId: string,
  gameweekId: string,
  snapshots: ArtistMetricsSnapshot[]
) {
  const pointsByArtist = new Map(snapshots.map((s) => [s.artistId, s.weeklyPoints]));

  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: {
      team: {
        include: { artists: { where: { isActive: true } } },
      },
    },
  });

  for (const member of members) {
    if (!member.team) continue;

    let weeklyPoints = 0;
    for (const ta of member.team.artists) {
      const pts = pointsByArtist.get(ta.artistId) ?? 0;
      const multiplier = ta.isCaptain ? 2 : 1;
      weeklyPoints += pts * multiplier;
    }

    await prisma.team.update({
      where: { id: member.team.id },
      data: {
        weeklyPoints,
        totalPoints: { increment: weeklyPoints },
      },
    });

    await prisma.leagueMember.update({
      where: { id: member.id },
      data: { totalPoints: { increment: weeklyPoints } },
    });
  }

  // Resolve head-to-head matchups
  const matchups = await prisma.matchup.findMany({ where: { gameweekId } });
  for (const matchup of matchups) {
    const home = await prisma.team.findUnique({ where: { id: matchup.homeTeamId } });
    const away = await prisma.team.findUnique({ where: { id: matchup.awayTeamId } });
    if (!home || !away) continue;

    const winnerId =
      home.weeklyPoints > away.weeklyPoints
        ? home.id
        : away.weeklyPoints > home.weeklyPoints
        ? away.id
        : null;

    await prisma.matchup.update({
      where: { id: matchup.id },
      data: {
        homePoints: home.weeklyPoints,
        awayPoints: away.weeklyPoints,
        winnerId,
      },
    });
  }
}
