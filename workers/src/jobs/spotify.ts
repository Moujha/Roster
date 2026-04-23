import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Spotify Web API token (client credentials flow)
let accessToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      auth: { username: clientId, password: clientSecret },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
  return accessToken!;
}

export interface SpotifyArtistJob {
  artistId: string;
  spotifyId: string;
}

export async function fetchSpotifyArtist(job: { data: SpotifyArtistJob }) {
  const { artistId, spotifyId } = job.data;
  const token = await getAccessToken();

  // Fetch artist profile (followers, popularity)
  const { data: artistData } = await axios.get(
    `https://api.spotify.com/v1/artists/${spotifyId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  // Spotify API does not expose streams directly — use Chartmetric for that.
  // Here we store what's available: followers and popularity score.
  await prisma.artist.update({
    where: { id: artistId },
    data: {
      // monthlyListeners comes from Chartmetric — see chartmetric.ts
      // instagramFollowers comes from social worker
      updatedAt: new Date(),
    },
  });

  return {
    artistId,
    spotifyId,
    followers: artistData.followers.total,
    popularity: artistData.popularity,
    genres: artistData.genres,
  };
}

// Fetch top tracks for an artist (useful for chart tracking)
export async function fetchSpotifyTopTracks(spotifyId: string) {
  const token = await getAccessToken();
  const { data } = await axios.get(
    `https://api.spotify.com/v1/artists/${spotifyId}/top-tracks?market=US`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data.tracks as Array<{
    id: string;
    name: string;
    popularity: number;
    preview_url: string | null;
  }>;
}

// Batch: enqueue all active artists for Spotify refresh
export async function enqueueAllArtists(queue: import("bullmq").Queue) {
  const artists = await prisma.artist.findMany({
    where: { isActive: true, spotifyId: { not: null } },
    select: { id: true, spotifyId: true },
  });

  const jobs = artists.map((a) => ({
    name: "fetch-artist",
    data: { artistId: a.id, spotifyId: a.spotifyId! },
  }));

  await queue.addBulk(jobs);
  console.log(`Enqueued ${jobs.length} Spotify artist jobs`);
  return jobs.length;
}
