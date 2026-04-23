import Image from "next/image";
import clsx from "clsx";
import type { Artist } from "@/lib/api";

const TIER_COLORS: Record<string, string> = {
  S: "bg-yellow-500 text-yellow-950",
  A: "bg-orange-500 text-orange-950",
  B: "bg-blue-500 text-blue-950",
  C: "bg-green-600 text-green-950",
  D: "bg-zinc-600 text-zinc-100",
};

interface ArtistCardProps {
  artist: Artist;
  onSign?: (artist: Artist) => void;
  isOwned?: boolean;
  isCaptain?: boolean;
}

export function ArtistCard({ artist, onSign, isOwned, isCaptain }: ArtistCardProps) {
  return (
    <div
      className={clsx(
        "relative rounded-xl bg-zinc-900 border transition-all",
        isCaptain ? "border-gold-400 ring-1 ring-gold-400/40" : "border-zinc-800 hover:border-zinc-600"
      )}
    >
      {isCaptain && (
        <span className="absolute top-2 right-2 text-xs font-bold text-gold-400 bg-gold-400/10 px-2 py-0.5 rounded-full">
          Captain ×2
        </span>
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0">
            {artist.imageUrl ? (
              <Image src={artist.imageUrl} alt={artist.name} width={48} height={48} className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 text-lg">
                {artist.name[0]}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={clsx("text-xs font-bold px-1.5 py-0.5 rounded", TIER_COLORS[artist.tier])}>
                {artist.tier}
              </span>
              <span className="font-semibold truncate">{artist.name}</span>
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">{artist.genre.replace("_", " ")}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Weekly pts" value={artist.weeklyScore.toLocaleString()} highlight />
          <Stat label="Mkt value" value={`${formatGR(artist.marketValue)} GR`} />
          <Stat label="Monthly listeners" value={formatNum(artist.monthlyListeners)} />
          <Stat label="TikTok" value={formatNum(artist.tiktokFollowers)} />
        </div>

        {onSign && !isOwned && (
          <button
            onClick={() => onSign(artist)}
            className="w-full py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
          >
            Sign — {formatGR(artist.marketValue)} GR
          </button>
        )}

        {isOwned && (
          <div className="w-full py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm text-center font-medium">
            On Roster
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-zinc-500">{label}</div>
      <div className={clsx("font-semibold", highlight ? "text-brand-400" : "text-zinc-200")}>{value}</div>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}

function formatGR(value: string): string {
  const n = parseInt(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}
