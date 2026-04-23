const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  artists: {
    list: (params?: Record<string, string>) =>
      apiFetch<ArtistListResponse>(`/api/artists?${new URLSearchParams(params)}`),
    get: (id: string) => apiFetch<Artist>(`/api/artists/${id}`),
    history: (id: string, weeks = 10) =>
      apiFetch<ArtistSnapshot[]>(`/api/artists/${id}/history?weeks=${weeks}`),
  },
  leagues: {
    get: (id: string) => apiFetch<League>(`/api/leagues/${id}`),
    create: (body: { name: string; type: string; maxTeams?: number }) =>
      apiFetch<League>("/api/leagues", { method: "POST", body: JSON.stringify(body) }),
    join: (code: string) =>
      apiFetch<{ league: League }>(`/api/leagues/${code}/join`, { method: "POST" }),
  },
  teams: {
    mine: () => apiFetch<Team[]>("/api/teams/mine"),
    create: (body: { name: string; leagueId?: string }) =>
      apiFetch<Team>("/api/teams", { method: "POST", body: JSON.stringify(body) }),
    sign: (teamId: string, body: { artistId: string; contractType?: string }) =>
      apiFetch(`/api/teams/${teamId}/sign`, { method: "POST", body: JSON.stringify(body) }),
    release: (teamId: string, artistId: string) =>
      apiFetch(`/api/teams/${teamId}/release/${artistId}`, { method: "DELETE" }),
    setCaptain: (teamId: string, artistId: string) =>
      apiFetch(`/api/teams/${teamId}/captain/${artistId}`, { method: "PATCH" }),
  },
  market: {
    listings: () => apiFetch<MarketListing[]>("/api/market"),
    bid: (listingId: string, amount: string) =>
      apiFetch(`/api/market/${listingId}/bid`, { method: "POST", body: JSON.stringify({ amount }) }),
  },
  auth: {
    login: (email: string, password: string) =>
      apiFetch<{ token: string; user: { id: string; username: string } }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) }
      ),
    register: (email: string, username: string, password: string) =>
      apiFetch<{ token: string; user: { id: string; username: string } }>(
        "/api/auth/register",
        { method: "POST", body: JSON.stringify({ email, username, password }) }
      ),
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Artist {
  id: string;
  name: string;
  slug: string;
  tier: "S" | "A" | "B" | "C" | "D";
  genre: string;
  country?: string;
  imageUrl?: string;
  monthlyListeners: number;
  weeklyStreams: number;
  instagramFollowers: number;
  tiktokFollowers: number;
  marketValue: string;
  weeklyScore: number;
  totalScore: number;
}

export interface ArtistSnapshot {
  snapshotDate: string;
  weeklyPoints: number;
  weeklyStreams: number;
  monthlyListeners: number;
  streamGrowthPct: number;
  pointsBreakdown?: Record<string, number>;
}

export interface ArtistListResponse {
  artists: Artist[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface League {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
  maxTeams: number;
  members: LeagueMember[];
}

export interface LeagueMember {
  id: string;
  totalPoints: number;
  user: { id: string; username: string; avatarUrl?: string };
  team?: Team;
}

export interface Team {
  id: string;
  name: string;
  totalPoints: number;
  weeklyPoints: number;
  budget: string;
  artists: TeamArtist[];
}

export interface TeamArtist {
  id: string;
  isCaptain: boolean;
  contractType: string;
  purchasePrice: string;
  weeklySalary: string;
  artist: { id: string; name: string; tier: string; weeklyScore: number; imageUrl?: string };
}

export interface MarketListing {
  id: string;
  askingPrice: string;
  expiresAt: string;
  artist: Artist;
  team?: { id: string; name: string };
  topBid?: { amount: string };
}
