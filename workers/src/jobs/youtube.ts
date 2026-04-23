import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const YT_BASE = "https://www.googleapis.com/youtube/v3";

export interface YouTubeJob {
  artistId: string;
  youtubeChannelId: string;
}

export async function fetchYouTubeStats(job: { data: YouTubeJob }) {
  const { artistId, youtubeChannelId } = job.data;
  const apiKey = process.env.YOUTUBE_API_KEY!;

  const { data } = await axios.get(`${YT_BASE}/channels`, {
    params: {
      part: "statistics,snippet",
      id: youtubeChannelId,
      key: apiKey,
    },
  });

  const channel = data.items?.[0];
  if (!channel) return null;

  const stats = channel.statistics;
  const subscriberCount = parseInt(stats.subscriberCount ?? "0");
  const viewCount = parseInt(stats.viewCount ?? "0");

  await prisma.artist.update({
    where: { id: artistId },
    data: { youtubeSubscribers: subscriberCount, updatedAt: new Date() },
  });

  // Fetch most viewed video from last 7 days
  const weeklyViews = await fetchWeeklyViews(youtubeChannelId, apiKey);

  return { artistId, subscriberCount, viewCount, weeklyViews };
}

async function fetchWeeklyViews(channelId: string, apiKey: string): Promise<number> {
  const publishedAfter = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  const searchRes = await axios.get(`${YT_BASE}/search`, {
    params: {
      part: "id",
      channelId,
      type: "video",
      publishedAfter,
      order: "viewCount",
      maxResults: 10,
      key: apiKey,
    },
  });

  const videoIds = searchRes.data.items?.map((v: { id: { videoId: string } }) => v.id.videoId).join(",");
  if (!videoIds) return 0;

  const videoRes = await axios.get(`${YT_BASE}/videos`, {
    params: { part: "statistics", id: videoIds, key: apiKey },
  });

  return videoRes.data.items?.reduce(
    (sum: number, v: { statistics: { viewCount?: string } }) =>
      sum + parseInt(v.statistics.viewCount ?? "0"),
    0
  ) ?? 0;
}

export async function enqueueYouTubeJobs(queue: import("bullmq").Queue) {
  const artists = await prisma.artist.findMany({
    where: { isActive: true, youtubeChannelId: { not: null } },
    select: { id: true, youtubeChannelId: true },
  });

  const jobs = artists.map((a) => ({
    name: "fetch-youtube",
    data: { artistId: a.id, youtubeChannelId: a.youtubeChannelId! },
  }));

  await queue.addBulk(jobs);
  return jobs.length;
}
