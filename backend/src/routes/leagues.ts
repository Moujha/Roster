import { Router, Response } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

const createLeagueSchema = z.object({
  name: z.string().min(3).max(50),
  type: z.enum(["CLASSIC", "CUMULATIVE", "DRAFT", "GRAND_PRIX"]),
  maxTeams: z.coerce.number().min(2).max(100).default(12),
});

// POST /leagues — create a league
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createLeagueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const code = nanoid(6).toUpperCase();
  const league = await prisma.league.create({
    data: {
      ...parsed.data,
      code,
      members: {
        create: {
          userId: req.userId!,
          isOwner: true,
        },
      },
    },
    include: { members: true },
  });

  res.status(201).json(league);
});

// POST /leagues/:code/join — join by invite code
router.post("/:code/join", requireAuth, async (req: AuthRequest, res: Response) => {
  const league = await prisma.league.findUnique({
    where: { code: req.params.code },
    include: { _count: { select: { members: true } } },
  });
  if (!league) {
    res.status(404).json({ error: "League not found" });
    return;
  }
  if (league._count.members >= league.maxTeams) {
    res.status(409).json({ error: "League is full" });
    return;
  }
  if (league.status !== "SETUP" && league.status !== "ACTIVE") {
    res.status(409).json({ error: "League is not accepting new members" });
    return;
  }

  const existing = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId: req.userId! } },
  });
  if (existing) {
    res.status(409).json({ error: "Already a member" });
    return;
  }

  const member = await prisma.leagueMember.create({
    data: { leagueId: league.id, userId: req.userId! },
  });

  res.status(201).json({ league, member });
});

// GET /leagues/:id — league detail with standings
router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const league = await prisma.league.findUnique({
    where: { id: req.params.id },
    include: {
      members: {
        include: { user: { select: { id: true, username: true, avatarUrl: true } }, team: true },
        orderBy: { totalPoints: "desc" },
      },
      gameweeks: { orderBy: { number: "asc" } },
    },
  });
  if (!league) {
    res.status(404).json({ error: "League not found" });
    return;
  }
  res.json(league);
});

// GET /leagues/:id/matchups/:weekNumber
router.get("/:id/matchups/:weekNumber", requireAuth, async (req: AuthRequest, res: Response) => {
  const gameweek = await prisma.gameweek.findFirst({
    where: { leagueId: req.params.id, number: Number(req.params.weekNumber) },
    include: {
      matchups: {
        include: {
          homeTeam: { select: { id: true, name: true, totalPoints: true } },
          awayTeam: { select: { id: true, name: true, totalPoints: true } },
        },
      },
    },
  });
  if (!gameweek) {
    res.status(404).json({ error: "Gameweek not found" });
    return;
  }
  res.json(gameweek);
});

export default router;
