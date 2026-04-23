import Link from "next/link";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/artists", label: "Artists" },
  { href: "/market", label: "Market" },
  { href: "/league", label: "League" },
];

export function Navbar() {
  return (
    <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
        <Link href="/" className="font-bold text-lg text-gradient">
          Roster
        </Link>

        <div className="flex items-center gap-6">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-zinc-400">
            <span className="text-gold-400 font-semibold">100M</span>
            <span className="text-zinc-600 ml-1">GR</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-sm font-bold">
            U
          </div>
        </div>
      </div>
    </nav>
  );
}
