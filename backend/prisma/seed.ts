import { PrismaClient, ArtistTier, Genre } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_ARTISTS = [
  // S-Tier
  { name: "Taylor Swift", slug: "taylor-swift", tier: "S" as ArtistTier, genre: "POP" as Genre, country: "US", spotifyId: "06HL4z0CvFAxyc27GXpf02", monthlyListeners: 100000000, marketValue: 95000000n },
  { name: "Drake", slug: "drake", tier: "S" as ArtistTier, genre: "HIP_HOP" as Genre, country: "CA", spotifyId: "3TVXtAsR1Inumwj472S9r4", monthlyListeners: 85000000, marketValue: 80000000n },
  { name: "The Weeknd", slug: "the-weeknd", tier: "S" as ArtistTier, genre: "R_AND_B" as Genre, country: "CA", spotifyId: "1Xyo4u8uXC1ZmMpatF05PJ", monthlyListeners: 110000000, marketValue: 100000000n },
  { name: "Bad Bunny", slug: "bad-bunny", tier: "S" as ArtistTier, genre: "LATIN" as Genre, country: "PR", spotifyId: "4q3ewBCX7sLwd24euuV69X", monthlyListeners: 95000000, marketValue: 90000000n },
  // A-Tier
  { name: "Doja Cat", slug: "doja-cat", tier: "A" as ArtistTier, genre: "POP" as Genre, country: "US", spotifyId: "5cj0lLjcoR7YOSnhnX0Po5", monthlyListeners: 40000000, marketValue: 35000000n },
  { name: "Olivia Rodrigo", slug: "olivia-rodrigo", tier: "A" as ArtistTier, genre: "POP" as Genre, country: "US", spotifyId: "1McMsnEElThX1knmY4oliG", monthlyListeners: 38000000, marketValue: 32000000n },
  { name: "Rema", slug: "rema", tier: "A" as ArtistTier, genre: "AFROBEATS" as Genre, country: "NG", spotifyId: "0sIIXMNBa2P7FJPLiAoKqp", monthlyListeners: 25000000, marketValue: 20000000n },
  { name: "Sabrina Carpenter", slug: "sabrina-carpenter", tier: "A" as ArtistTier, genre: "POP" as Genre, country: "US", spotifyId: "74KM79TiuVKeVCqs8QtB0B", monthlyListeners: 32000000, marketValue: 28000000n },
  // B-Tier
  { name: "FKJ", slug: "fkj", tier: "B" as ArtistTier, genre: "ELECTRONIC" as Genre, country: "FR", spotifyId: "4gzpq5DuYFiWvdJtaGMHyx", monthlyListeners: 5000000, marketValue: 4000000n },
  { name: "Amaarae", slug: "amaarae", tier: "B" as ArtistTier, genre: "AFROBEATS" as Genre, country: "GH", spotifyId: "2RIlhEBLkAHjHRbReW5AM3", monthlyListeners: 2000000, marketValue: 1800000n },
  { name: "Rex Orange County", slug: "rex-orange-county", tier: "B" as ArtistTier, genre: "INDIE" as Genre, country: "GB", spotifyId: "6kACVPfCOnqzgfEF5ThsPB", monthlyListeners: 6000000, marketValue: 5000000n },
  { name: "Clairo", slug: "clairo", tier: "B" as ArtistTier, genre: "INDIE" as Genre, country: "US", spotifyId: "5ICs7ApPJheMoIWkBxrAtj", monthlyListeners: 7000000, marketValue: 6000000n },
  // C-Tier
  { name: "Bladee", slug: "bladee", tier: "C" as ArtistTier, genre: "ELECTRONIC" as Genre, country: "SE", spotifyId: "5CyvQVyBqHY7TNhJtiqZFI", monthlyListeners: 500000, marketValue: 400000n },
  { name: "Sudan Archives", slug: "sudan-archives", tier: "C" as ArtistTier, genre: "R_AND_B" as Genre, country: "US", spotifyId: "6GVlS57cFqoH3KtfT5EqLE", monthlyListeners: 600000, marketValue: 500000n },
  // D-Tier
  { name: "Sault", slug: "sault", tier: "D" as ArtistTier, genre: "R_AND_B" as Genre, country: "GB", spotifyId: "22GiMFnHsXgqb6Kvxv7YKK", monthlyListeners: 80000, marketValue: 100000n },
];

async function main() {
  console.log("Seeding artists...");
  for (const artist of SEED_ARTISTS) {
    await prisma.artist.upsert({
      where: { slug: artist.slug },
      update: {},
      create: artist,
    });
  }
  console.log(`Seeded ${SEED_ARTISTS.length} artists.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
