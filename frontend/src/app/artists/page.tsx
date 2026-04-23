"use client";

import { useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import { ArtistCard } from "@/components/ArtistCard";
import { api, type Artist, type ArtistListResponse } from "@/lib/api";

const TIERS = ["S", "A", "B", "C", "D"] as const;
const GENRES = ["POP", "HIP_HOP", "R_AND_B", "ELECTRONIC", "ROCK", "INDIE", "LATIN", "AFROBEATS", "K_POP"];

export default function ArtistsPage() {
  const [data, setData] = useState<ArtistListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [genre, setGenre] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page) };
    if (search) params.search = search;
    if (tier) params.tier = tier;
    if (genre) params.genre = genre;

    api.artists.list(params).then((d) => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [search, tier, genre, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Artist Catalog</h1>
          <span className="text-sm text-zinc-400">
            {data ? `${data.pagination.total.toLocaleString()} artists` : ""}
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search artists..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-brand-500 w-56"
          />
          <select
            value={tier}
            onChange={(e) => { setTier(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 focus:outline-none"
          >
            <option value="">All Tiers</option>
            {TIERS.map((t) => <option key={t} value={t}>Tier {t}</option>)}
          </select>
          <select
            value={genre}
            onChange={(e) => { setGenre(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 focus:outline-none"
          >
            <option value="">All Genres</option>
            {GENRES.map((g) => <option key={g} value={g}>{g.replace("_", " ")}</option>)}
          </select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 h-52 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {data?.artists.map((artist) => (
              <ArtistCard
                key={artist.id}
                artist={artist}
                onSign={() => {/* TODO: sign flow */}}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-zinc-400">
              {page} / {data.pagination.pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.pages, p + 1))}
              disabled={page === data.pagination.pages}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </>
  );
}
