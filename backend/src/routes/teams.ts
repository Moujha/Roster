import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

const createTeamSchema = z.object({
  name: z.string().min(2).max(40),
  leagueId: z.string().optional(),
});

const signArtistSchema = z.object({
  artistId: z.string(),
  contractType: z.enum(["STANDARD", "EXCLUSIVE", "DEVELOPMENT", "THREE_SIXTY"]).default("STANDARD"),
});

const CONTRACT_MULTIPLIERS: Record<string, number> = {
  STANDARD: 1,
  EXCLUSIVE: 1.5,
  DEVELOPMENT: 0.6,
  THREE_SIXTY: 2,
};

// POST /teams — create a team
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const team = await prisma.team.create({
    data: {
      userId: req.userId!,
      name: parsed.data.name,
      budget: user.balance,
    },
  });

  if (parsed.data.leagueId) {
    await prisma.leagueMember.updateMany({
      where: { userId: req.userId!, leagueId: parsed.data.leagueId },
      data: { teamId: team.id },
    });
  }

  res.status(201).json(team);
});

// GET /teams/mine — current user's teams
router.get("/mine", requireAuth, async (req: AuthRequest, res: Response) => {
  const teams = await prisma.team.findMany({
    where: { userId: req.userId! },
    include: {
      artists: {
        where: { isActive: true },
        include: { artist: { select: { id: true, name: true, tier: true, weeklyScore: true, imageUrl: true } } },
      },
    },
  });
  res.json(teams.map((t) => ({ ...t, budget: t.budget.toString() })));
});

// POST /teams/:id/sign — sign an artist
router.post("/:id/sign", requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = signArtistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [team, artist] = await Promise.all([
    prisma.team.findFirst({ where: { id: req.params.id, userId: req.userId! } }),
    prisma.artist.findUnique({ where: { id: parsed.data.artistId } }),
  ]);

  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }

  const multiplier = CONTRACT_MULTIPLIERS[parsed.data.contractType];
  const purchasePrice = BigInt(Math.floor(Number(artist.marketValue) * multiplier));
  const salaryMap: Record<string, bigint> = {
    S: 800000n, A: 200000n, B: 40000n, C: 8000n, D: 1000n,
  };
  const weeklySalary = salaryMap[artist.tier] ?? 5000n;

  if (team.budget < purchasePrice) {
    res.status(400).json({ error: "Insufficient budget" });
    return;
  }

  const rosterCount = await prisma.teamArtist.count({
    where: { teamId: team.id, isActive: true },
  });
  if (rosterCount >= 20) {
    res.status(400).json({ error: "Roster full (max 20 artists)" });
    return;
  }

  const alreadySigned = await prisma.teamArtist.findFirst({
    where: { teamId: team.id, artistId: parsed.data.artistId, isActive: true },
  });
  if (alreadySigned) {
    res.status(409).json({ error: "Artist already on roster" });
    return;
  }

  const [, teamArtist] = await prisma.$transaction([
    prisma.team.update({
      where: { id: team.id },
      data: { budget: { decrement: purchasePrice } },
    }),
    prisma.teamArtist.create({
      data: {
        teamId: team.id,
        artistId: parsed.data.artistId,
        contractType: parsed.data.contractType,
        purchasePrice,
        weeklySalary,
      },
    }),
  ]);

  res.status(201).json({
    ...teamArtist,
    purchasePrice: teamArtist.purchasePrice.toString(),
    weeklySalary: teamArtist.weeklySalary.toString(),
  });
});

// DELETE /teams/:id/release/:artistId — release an artist
router.delete("/:id/release/:artistId", requireAuth, async (req: AuthRequest, res: Response) => {
  const team = await prisma.team.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  const teamArtist = await prisma.teamArtist.findFirst({
    where: { teamId: team.id, artistId: req.params.artistId, isActive: true },
  });
  if (!teamArtist) {
    res.status(404).json({ error: "Artist not on roster" });
    return;
  }

  await prisma.teamArtist.update({
    where: { id: teamArtist.id },
    data: { isActive: false, releasedAt: new Date() },
  });

  res.json({ success: true });
});

// PATCH /teams/:id/captain/:artistId — set captain (2x points)
router.patch("/:id/captain/:artistId", requireAuth, async (req: AuthRequest, res: Response) => {
  const team = await prisma.team.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  await prisma.$transaction([
    prisma.teamArtist.updateMany({
      where: { teamId: team.id },
      data: { isCaptain: false },
    }),
    prisma.teamArtist.updateMany({
      where: { teamId: team.id, artistId: req.params.artistId, isActive: true },
      data: { isCaptain: true },
    }),
  ]);

  res.json({ success: true });
});

export default router;
