"use client";

import { Navbar } from "@/components/Navbar";
import { ArtistCard } from "@/components/ArtistCard";
import { api, type Team, type Artist } from "@/lib/api";
import { useState, useEffect } from "react";

export default function DashboardPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.teams.mine().then((teams) => {
      setTeam(teams[0] ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{team?.name ?? "My Roster"}</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Weekly points:{" "}
              <span className="text-brand-400 font-semibold">{team?.weeklyPoints ?? 0}</span>
              {" "}· Total:{" "}
              <span className="text-zinc-100 font-semibold">{team?.totalPoints ?? 0}</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-zinc-400">Budget remaining</div>
            <div className="text-xl font-bold text-gold-400">
              {team ? formatGR(team.budget) : "—"} GR
            </div>
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 h-48 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && !team && (
          <EmptyRoster />
        )}

        {!loading && team && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {team.artists.map((ta) => (
              <ArtistCard
                key={ta.id}
                artist={ta.artist as unknown as Artist}
                isOwned
                isCaptain={ta.isCaptain}
              />
            ))}
          </div>
        )}

        <WeeklyStatsBar team={team} />
      </main>
    </>
  );
}

function EmptyRoster() {
  return (
    <div className="rounded-xl bg-zinc-900 border border-dashed border-zinc-700 p-16 text-center space-y-4">
      <div className="text-4xl">🎵</div>
      <h2 className="text-lg font-semibold">Your roster is empty</h2>
      <p className="text-zinc-400 text-sm max-w-sm mx-auto">
        Head to the Artists page to sign your first acts, or join a league to compete.
      </p>
      <div className="flex gap-3 justify-center">
        <a
          href="/artists"
          className="px-6 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
        >
          Browse Artists
        </a>
        <a
          href="/league"
          className="px-6 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-medium transition-colors"
        >
          Join a League
        </a>
      </div>
    </div>
  );
}

function WeeklyStatsBar({ team }: { team: Team | null }) {
  if (!team) return null;
  return (
    <div className="grid grid-cols-4 gap-4">
      {[
        { label: "Roster Size", value: team.artists.length },
        { label: "Weekly Points", value: team.weeklyPoints },
        { label: "Season Total", value: team.totalPoints },
        { label: "Weekly Salary", value: `${calcSalary(team)} GR/wk` },
      ].map((stat) => (
        <div key={stat.label} className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-xs text-zinc-500">{stat.label}</div>
          <div className="text-xl font-bold mt-1">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

function calcSalary(team: Team) {
  const total = team.artists.reduce((s, ta) => s + parseInt(ta.weeklySalary), 0);
  return formatGR(total.toString());
}

function formatGR(value: string | number) {
  const n = typeof value === "string" ? parseInt(value) : value;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}
