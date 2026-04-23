import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-sm">
          Season 1 — Draft opens soon
        </div>

        <h1 className="text-6xl font-bold tracking-tight">
          <span className="text-gradient">Roster</span>
        </h1>

        <p className="text-xl text-zinc-400 max-w-xl mx-auto leading-relaxed">
          Build your dream music label. Sign real artists, compete in weekly
          leagues, and climb the A&R leaderboard using live streaming and
          social data.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/dashboard"
            className="px-8 py-3 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors"
          >
            Open Dashboard
          </Link>
          <Link
            href="/market"
            className="px-8 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium transition-colors"
          >
            Browse Market
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-6 pt-12 text-left">
          <FeatureCard
            icon="🎵"
            title="Real Data"
            desc="Points update daily from Spotify, TikTok, YouTube, and Billboard charts."
          />
          <FeatureCard
            icon="⚡"
            title="Live Market"
            desc="Buy and sell artists in 48-hour transfer windows. Prices move with performance."
          />
          <FeatureCard
            icon="🏆"
            title="Leagues"
            desc="Classic, Draft, and Grand Prix formats. Head-to-head or cumulative."
          />
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
      <div className="text-2xl">{icon}</div>
      <h3 className="font-semibold text-zinc-100">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
    </div>
  );
}
