/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co" },      // Spotify images
      { protocol: "https", hostname: "*.spotifycdn.com" },
      { protocol: "https", hostname: "*.cdninstagram.com" },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  },
};

module.exports = nextConfig;
