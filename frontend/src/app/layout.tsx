import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roster — Music Fantasy Manager",
  description: "Build your dream music label. Compete with real artist data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
