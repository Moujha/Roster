import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// We use Apify actors to scrape Instagram & TikTok metrics.
// Apify provides managed scraping infrastructure with rotating proxies.
// Instagram actor: apify/instagram-profile-scraper
// TikTok actor: clockworks/tiktok-profile-scraper

const APIFY_BASE = "https://api.apify.com/v2";

async function runApifyActor(actorId: string, input: Record<string, unknown>) {
  const apiToken = process.env.APIFY_API_TOKEN!;
  const runRes = await axios.post(
    `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`,
    input,
    {
      params: { token: apiToken, timeout: 60 },
      timeout: 90000,
    }
  );
  return runRes.data as unknown[];
}

export interface SocialJob {
  artistId: string;
  platform: "instagram" | "tiktok";
  handle: string;
}

export async function fetchInstagramStats(job: { data: SocialJob }) {
  const { artistId, handle } = job.data;

  const items = await runApifyActor("apify/instagram-profile-scraper", {
    usernames: [handle],
  });

  const profile = items[0] as {
    followersCount?: number;
    postsCount?: number;
    // Engagement calculated from recent posts
    avgLikes?: number;
    avgComments?: number;
  } | undefined;

  if (!profile) return null;

  const followers = profile.followersCount ?? 0;
  const engagement =
    followers > 0
      ? (((profile.avgLikes ?? 0) + (profile.avgComments ?? 0)) / followers) * 100
      : 0;

  await prisma.artist.update({
    where: { id: artistId },
    data: {
      instagramFollowers: followers,
      instagramEngagement: Math.min(engagement, 100),
      updatedAt: new Date(),
    },
  });

  return { artistId, handle, followers, engagement };
}

export async function fetchTikTokStats(job: { data: SocialJob }) {
  const { artistId, handle } = job.data;

  const items = await runApifyActor("clockworks/tiktok-profile-scraper", {
    profiles: [handle],
    resultsType: "details",
  });

  const profile = items[0] as {
    stats?: { followerCount?: number; heartCount?: number; videoCount?: number };
  } | undefined;

  if (!profile?.stats) return null;

  const followers = profile.stats.followerCount ?? 0;

  await prisma.artist.update({
    where: { id: artistId },
    data: { tiktokFollowers: followers, updatedAt: new Date() },
  });

  return { artistId, handle, followers };
}

export async function enqueueSocialJobs(queue: import("bullmq").Queue) {
  const artists = await prisma.artist.findMany({
    where: {
      isActive: true,
      OR: [{ instagramHandle: { not: null } }, { tiktokHandle: { not: null } }],
    },
    select: { id: true, instagramHandle: true, tiktokHandle: true },
  });

  const jobs: Array<{ name: string; data: SocialJob }> = [];

  for (const artist of artists) {
    if (artist.instagramHandle) {
      jobs.push({ name: "instagram", data: { artistId: artist.id, platform: "instagram", handle: artist.instagramHandle } });
    }
    if (artist.tiktokHandle) {
      jobs.push({ name: "tiktok", data: { artistId: artist.id, platform: "tiktok", handle: artist.tiktokHandle } });
    }
  }

  await queue.addBulk(jobs);
  return jobs.length;
}
