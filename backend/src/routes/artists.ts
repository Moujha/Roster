import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  tier: z.enum(["S", "A", "B", "C", "D"]).optional(),
  genre: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["weeklyScore", "monthlyListeners", "marketValue", "name"]).default("weeklyScore"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

// GET /artists — paginated artist catalog
router.get("/", async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { page, limit, tier, genre, search, sortBy, order } = parsed.data;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { isActive: true };
  if (tier) where.tier = tier;
  if (genre) where.genre = genre;
  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  const [artists, total] = await Promise.all([
    prisma.artist.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: order },
      select: {
        id: true,
        name: true,
        slug: true,
        tier: true,
        genre: true,
        country: true,
        imageUrl: true,
        monthlyListeners: true,
        weeklyStreams: true,
        instagramFollowers: true,
        tiktokFollowers: true,
        marketValue: true,
        weeklyScore: true,
        totalScore: true,
      },
    }),
    prisma.artist.count({ where }),
  ]);

  res.json({
    artists: artists.map((a) => ({ ...a, marketValue: a.marketValue.toString() })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// GET /artists/:id — artist detail with recent metrics
router.get("/:id", async (req: Request, res: Response) => {
  const artist = await prisma.artist.findUnique({
    where: { id: req.params.id },
    include: {
      metrics: {
        orderBy: { snapshotDate: "desc" },
        take: 12,
      },
      chartEntries: {
        orderBy: { weekOf: "desc" },
        take: 20,
      },
    },
  });
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  res.json({
    ...artist,
    marketValue: artist.marketValue.toString(),
  });
});

// GET /artists/:id/history — weekly points history
router.get("/:id/history", async (req: Request, res: Response) => {
  const weeks = Math.min(Number(req.query.weeks) || 10, 52);
  const snapshots = await prisma.artistMetricsSnapshot.findMany({
    where: { artistId: req.params.id },
    orderBy: { snapshotDate: "desc" },
    take: weeks,
    select: {
      snapshotDate: true,
      weeklyPoints: true,
      weeklyStreams: true,
      monthlyListeners: true,
      streamGrowthPct: true,
      pointsBreakdown: true,
    },
  });
  res.json(snapshots);
});

export default router;
