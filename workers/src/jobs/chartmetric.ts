import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "https://api.chartmetric.com/api";

// Chartmetric is the gold standard for music analytics:
// monthly listeners, streams, playlist adds, radio spins, etc.
// https://api.chartmetric.com/apidoc/

let cmToken: string | null = null;
let cmTokenExpiry = 0;

async function getChartmetricToken(): Promise<string> {
  if (cmToken && Date.now() < cmTokenExpiry) return cmToken;

  const { data } = await axios.post(`${BASE}/token`, {
    refreshtoken: process.env.CHARTMETRIC_API_TOKEN,
  });
  cmToken = data.token;
  cmTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cmToken!;
}

function authHeader() {
  return { Authorization: `Bearer ${cmToken}` };
}

export interface ChartmetricArtistJob {
  artistId: string;
  chartmetricId?: number;
  spotifyId?: string;
}

// Resolve Chartmetric artist ID from Spotify ID
export async function resolveChartmetricId(spotifyId: string): Promise<number | null> {
  await getChartmetricToken();
  try {
    const { data } = await axios.get(`${BASE}/artist/spotify/${spotifyId}/get-ids`, {
      headers: authHeader(),
    });
    return data.obj?.chartmetric_id ?? null;
  } catch {
    return null;
  }
}

// Fetch monthly listeners + stream stats
export async function fetchArtistStats(job: { data: ChartmetricArtistJob }) {
  const { artistId, spotifyId } = job.data;
  await getChartmetricToken();

  let cmId = job.data.chartmetricId;
  if (!cmId && spotifyId) {
    cmId = (await resolveChartmetricId(spotifyId)) ?? undefined;
  }
  if (!cmId) return null;

  // Monthly listeners
  const [listenersRes, statsRes] = await Promise.allSettled([
    axios.get(`${BASE}/artist/${cmId}/where-people-listen`, { headers: authHeader() }),
    axios.get(`${BASE}/artist/${cmId}/stat/spotify`, {
      params: { since: daysAgo(14), until: today(), latest: 1 },
      headers: authHeader(),
    }),
  ]);

  const listeners =
    listenersRes.status === "fulfilled"
      ? (listenersRes.value.data?.obj?.listeners ?? 0)
      : 0;

  const weeklyStreams =
    statsRes.status === "fulfilled"
      ? (statsRes.value.data?.obj?.data?.[0]?.streams ?? 0)
      : 0;

  if (listeners || weeklyStreams) {
    await prisma.artist.update({
      where: { id: artistId },
      data: { monthlyListeners: listeners, weeklyStreams, updatedAt: new Date() },
    });
  }

  return { artistId, monthlyListeners: listeners, weeklyStreams };
}

// Fetch chart positions (Spotify Global, Apple Music, etc.)
export async function fetchChartPositions(job: { data: ChartmetricArtistJob }) {
  const { artistId } = job.data;
  await getChartmetricToken();

  let cmId = job.data.chartmetricId;
  if (!cmId && job.data.spotifyId) {
    cmId = (await resolveChartmetricId(job.data.spotifyId)) ?? undefined;
  }
  if (!cmId) return null;

  const { data } = await axios.get(`${BASE}/artist/${cmId}/charts`, {
    params: { type: "spotify_top_songs" },
    headers: authHeader(),
  });

  const entries = data?.obj?.data ?? [];
  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() - weekDate.getDay()); // Monday

  for (const entry of entries.slice(0, 5)) {
    await prisma.chartEntry.upsert({
      where: {
        id: `${artistId}-spotify_global-${entry.track_name}-${weekDate.toISOString().slice(0, 10)}`,
      },
      update: { position: entry.rank },
      create: {
        id: `${artistId}-spotify_global-${entry.track_name}-${weekDate.toISOString().slice(0, 10)}`,
        artistId,
        chart: "spotify_global",
        position: entry.rank,
        trackName: entry.track_name,
        weekOf: weekDate,
      },
    });
  }

  return entries;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
