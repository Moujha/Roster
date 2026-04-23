import cron from "node-cron";
import { queues, createWorker } from "./queue";
import { fetchSpotifyArtist, enqueueAllArtists } from "./jobs/spotify";
import { fetchArtistStats, fetchChartPositions } from "./jobs/chartmetric";
import { fetchYouTubeStats, enqueueYouTubeJobs } from "./jobs/youtube";
import { fetchInstagramStats, fetchTikTokStats, enqueueSocialJobs } from "./jobs/social";
import { scoreGameweek } from "./jobs/scoring";

// ─── Workers ─────────────────────────────────────────────────────────────────

createWorker(queues.spotify.name, async (job) => {
  if (job.name === "fetch-artist") return fetchSpotifyArtist(job as Parameters<typeof fetchSpotifyArtist>[0]);
}, 5);

createWorker(queues.youtube.name, async (job) => {
  if (job.name === "fetch-youtube") return fetchYouTubeStats(job as Parameters<typeof fetchYouTubeStats>[0]);
}, 3);

createWorker(queues.social.name, async (job) => {
  if (job.name === "instagram") return fetchInstagramStats(job as Parameters<typeof fetchInstagramStats>[0]);
  if (job.name === "tiktok") return fetchTikTokStats(job as Parameters<typeof fetchTikTokStats>[0]);
}, 2);

createWorker(queues.scoring.name, async (job) => {
  if (job.name === "score-gameweek") return scoreGameweek(job as Parameters<typeof scoreGameweek>[0]);
}, 1);

// ─── Scheduled jobs ──────────────────────────────────────────────────────────

// Refresh Spotify + Chartmetric data every 6 hours
const DATA_CRON = process.env.DATA_REFRESH_CRON ?? "0 */6 * * *";
cron.schedule(DATA_CRON, async () => {
  console.log("[cron] Triggering data refresh...");
  await enqueueAllArtists(queues.spotify);
  await enqueueYouTubeJobs(queues.youtube);
});

// Social media refresh once per day (rate-limit friendly)
cron.schedule("0 8 * * *", async () => {
  console.log("[cron] Triggering social media refresh...");
  await enqueueSocialJobs(queues.social);
});

// Score gameweeks every Monday at 02:00
const SCORING_CRON = process.env.SCORING_CRON ?? "0 2 * * 1";
cron.schedule(SCORING_CRON, async () => {
  console.log("[cron] Scoring gameweeks...");
  // This just triggers; actual gameweek IDs are pushed by the backend
  // when an admin closes the gameweek via POST /api/admin/gameweeks/:id/score
});

console.log("Workers running. Crons scheduled.");
console.log(`  Data refresh: ${DATA_CRON}`);
console.log(`  Social refresh: 0 8 * * *`);
console.log(`  Scoring: ${SCORING_CRON}`);
