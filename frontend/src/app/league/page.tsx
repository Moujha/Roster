"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { api, type League } from "@/lib/api";
import clsx from "clsx";

export default function LeaguePage() {
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"join" | "create" | "view">("join");
  const [code, setCode] = useState("");
  const [createForm, setCreateForm] = useState({ name: "", type: "CLASSIC", maxTeams: 12 });
  const [error, setError] = useState("");

  const joinLeague = async () => {
    setError("");
    try {
      const { league: l } = await api.leagues.join(code.toUpperCase());
      setLeague(l);
      setMode("view");
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  const createLeague = async () => {
    setError("");
    try {
      const l = await api.leagues.create(createForm);
      setLeague(l);
      setMode("view");
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Leagues</h1>

        {mode !== "view" && (
          <div className="flex gap-2">
            <button
              onClick={() => setMode("join")}
              className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition-colors", mode === "join" ? "bg-brand-500 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-100")}
            >
              Join League
            </button>
            <button
              onClick={() => setMode("create")}
              className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition-colors", mode === "create" ? "bg-brand-500 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-100")}
            >
              Create League
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-4 max-w-md">
            <h2 className="font-semibold">Join with Invite Code</h2>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ENTER6X"
              maxLength={6}
              className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-lg font-mono text-center tracking-widest focus:outline-none focus:border-brand-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={joinLeague}
              disabled={code.length !== 6}
              className="w-full py-3 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-medium transition-colors"
            >
              Join League
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-4 max-w-md">
            <h2 className="font-semibold">Create a New League</h2>
            <div className="space-y-3">
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="League name"
                className="w-full px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm focus:outline-none focus:border-brand-500"
              />
              <select
                value={createForm.type}
                onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm focus:outline-none"
              >
                <option value="CLASSIC">Classic (Head-to-Head)</option>
                <option value="CUMULATIVE">Open (Cumulative)</option>
                <option value="DRAFT">Draft League</option>
                <option value="GRAND_PRIX">Grand Prix (4-week sprint)</option>
              </select>
              <div className="flex items-center gap-3">
                <label className="text-sm text-zinc-400 w-28">Max Teams</label>
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={createForm.maxTeams}
                  onChange={(e) => setCreateForm({ ...createForm, maxTeams: parseInt(e.target.value) })}
                  className="w-24 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={createLeague}
              disabled={!createForm.name}
              className="w-full py-3 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-medium transition-colors"
            >
              Create League
            </button>
          </div>
        )}

        {mode === "view" && league && (
          <LeagueView league={league} />
        )}
      </main>
    </>
  );
}

function LeagueView({ league }: { league: League }) {
  const sorted = [...league.members].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div>
          <h2 className="text-xl font-bold">{league.name}</h2>
          <div className="flex items-center gap-3 text-sm text-zinc-400 mt-1">
            <span>{league.type}</span>
            <span>·</span>
            <span className="font-mono tracking-widest text-zinc-300">{league.code}</span>
            <span>·</span>
            <span>{league.members.length} / {league.maxTeams} managers</span>
          </div>
        </div>
        <div className={clsx(
          "ml-auto px-3 py-1 rounded-full text-xs font-semibold",
          league.status === "ACTIVE" ? "bg-green-400/10 text-green-400" : "bg-zinc-700 text-zinc-300"
        )}>
          {league.status}
        </div>
      </div>

      <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 text-xs font-semibold text-zinc-500 grid grid-cols-12">
          <span className="col-span-1">#</span>
          <span className="col-span-5">Manager</span>
          <span className="col-span-3 text-right">Weekly</span>
          <span className="col-span-3 text-right">Total</span>
        </div>
        {sorted.map((member, i) => (
          <div
            key={member.id}
            className="px-4 py-3 border-b border-zinc-800/60 last:border-0 grid grid-cols-12 items-center hover:bg-zinc-800/30"
          >
            <span className={clsx("col-span-1 font-bold text-sm", i === 0 ? "text-gold-400" : "text-zinc-500")}>
              {i + 1}
            </span>
            <div className="col-span-5 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-400">
                {member.user.username[0].toUpperCase()}
              </div>
              <span className="text-sm font-medium">{member.user.username}</span>
              {member.team && (
                <span className="text-xs text-zinc-500 truncate">{member.team.name}</span>
              )}
            </div>
            <span className="col-span-3 text-right text-sm text-brand-400 font-semibold">
              {(member.team?.weeklyPoints ?? 0).toLocaleString()}
            </span>
            <span className="col-span-3 text-right text-sm font-bold">
              {member.totalPoints.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
