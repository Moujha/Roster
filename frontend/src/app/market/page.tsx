"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Navbar } from "@/components/Navbar";
import { api, type MarketListing } from "@/lib/api";
import clsx from "clsx";

const TIER_COLORS: Record<string, string> = {
  S: "text-yellow-400 bg-yellow-400/10",
  A: "text-orange-400 bg-orange-400/10",
  B: "text-blue-400 bg-blue-400/10",
  C: "text-green-400 bg-green-400/10",
  D: "text-zinc-400 bg-zinc-700/40",
};

export default function MarketPage() {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidding, setBidding] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState("");

  useEffect(() => {
    api.market.listings().then((l) => {
      setListings(l);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const submitBid = async (listingId: string) => {
    try {
      await api.market.bid(listingId, bidAmount);
      setBidding(null);
      setBidAmount("");
      // Refresh
      const l = await api.market.listings();
      setListings(l);
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  };

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Transfer Market</h1>
            <p className="text-sm text-zinc-400 mt-1">
              {listings.length} active listing{listings.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm text-zinc-400">Window open</span>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 h-48 animate-pulse" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-xl bg-zinc-900 border border-dashed border-zinc-700 p-16 text-center">
            <p className="text-zinc-400">No artists currently listed. List one from your roster.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <div key={listing.id} className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0">
                    {listing.artist.imageUrl ? (
                      <Image src={listing.artist.imageUrl} alt={listing.artist.name} width={48} height={48} className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 text-lg">
                        {listing.artist.name[0]}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={clsx("text-xs font-bold px-1.5 py-0.5 rounded", TIER_COLORS[listing.artist.tier])}>
                        {listing.artist.tier}
                      </span>
                      <span className="font-semibold truncate">{listing.artist.name}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{listing.team?.name ?? "Free Agent"}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-zinc-500">Weekly pts</div>
                    <div className="font-bold text-brand-400">{listing.artist.weeklyScore}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-zinc-500">Asking price</div>
                    <div className="font-semibold text-gold-400">{formatGR(listing.askingPrice)} GR</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Top bid</div>
                    <div className="font-semibold">
                      {listing.topBid ? `${formatGR(listing.topBid.amount)} GR` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Closes</div>
                    <div className="font-semibold">{timeUntil(listing.expiresAt)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Market value</div>
                    <div className="font-semibold">{formatGR(listing.artist.marketValue)} GR</div>
                  </div>
                </div>

                {bidding === listing.id ? (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Bid amount (GR)"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 focus:outline-none focus:border-brand-500"
                    />
                    <button
                      onClick={() => submitBid(listing.id)}
                      className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium"
                    >
                      Bid
                    </button>
                    <button
                      onClick={() => setBidding(null)}
                      className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setBidding(listing.id)}
                    className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-medium transition-colors"
                  >
                    Place Bid
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function formatGR(value: string): string {
  const n = parseInt(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  if (h > 24) return `${Math.floor(h / 24)}d`;
  return `${h}h`;
}
