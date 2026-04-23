import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

const listSchema = z.object({
  artistId: z.string(),
  teamId: z.string(),
  askingPrice: z.coerce.bigint().positive(),
  durationHours: z.coerce.number().min(1).max(72).default(48),
});

const bidSchema = z.object({
  amount: z.coerce.bigint().positive(),
});

// GET /market — active listings
router.get("/", async (_req, res: Response) => {
  const listings = await prisma.marketListing.findMany({
    where: { status: "OPEN", expiresAt: { gt: new Date() } },
    include: {
      artist: {
        select: { id: true, name: true, tier: true, genre: true, weeklyScore: true, imageUrl: true, marketValue: true },
      },
      team: { select: { id: true, name: true } },
      bids: { orderBy: { amount: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(
    listings.map((l) => ({
      ...l,
      askingPrice: l.askingPrice.toString(),
      artist: { ...l.artist, marketValue: l.artist.marketValue.toString() },
      topBid: l.bids[0] ? { amount: l.bids[0].amount.toString() } : null,
    }))
  );
});

// POST /market/list — list an artist for sale
router.post("/list", requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = listSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const team = await prisma.team.findFirst({
    where: { id: parsed.data.teamId, userId: req.userId! },
  });
  if (!team) {
    res.status(403).json({ error: "Not your team" });
    return;
  }

  const onRoster = await prisma.teamArtist.findFirst({
    where: { teamId: parsed.data.teamId, artistId: parsed.data.artistId, isActive: true },
  });
  if (!onRoster) {
    res.status(400).json({ error: "Artist not on your roster" });
    return;
  }

  const existing = await prisma.marketListing.findFirst({
    where: { artistId: parsed.data.artistId, status: "OPEN" },
  });
  if (existing) {
    res.status(409).json({ error: "Artist already listed" });
    return;
  }

  const expiresAt = new Date(Date.now() + parsed.data.durationHours * 3600 * 1000);
  const listing = await prisma.marketListing.create({
    data: {
      artistId: parsed.data.artistId,
      teamId: parsed.data.teamId,
      askingPrice: parsed.data.askingPrice,
      expiresAt,
    },
  });

  res.status(201).json({ ...listing, askingPrice: listing.askingPrice.toString() });
});

// POST /market/:listingId/bid — place a bid
router.post("/:listingId/bid", requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = bidSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const listing = await prisma.marketListing.findUnique({
    where: { id: req.params.listingId },
    include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
  });

  if (!listing || listing.status !== "OPEN" || listing.expiresAt < new Date()) {
    res.status(404).json({ error: "Listing not found or expired" });
    return;
  }

  const topBid = listing.bids[0]?.amount ?? listing.askingPrice - 1n;
  if (parsed.data.amount <= topBid) {
    res.status(400).json({ error: `Bid must be higher than current top bid of ${topBid}` });
    return;
  }

  const bid = await prisma.marketBid.create({
    data: {
      listingId: listing.id,
      bidderId: req.userId!,
      amount: parsed.data.amount,
    },
  });

  res.status(201).json({ ...bid, amount: bid.amount.toString() });
});

export default router;
