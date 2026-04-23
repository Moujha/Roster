import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

export const QUEUES = {
  SPOTIFY: "spotify",
  YOUTUBE: "youtube",
  SOCIAL: "social",
  SCORING: "scoring",
  MARKET: "market",
} as const;

export function createQueue(name: string) {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });
}

export function createWorker<T>(
  name: string,
  processor: (job: { data: T; name: string }) => Promise<unknown>,
  concurrency = 5
) {
  return new Worker(name, processor as Parameters<typeof Worker>[1], {
    connection,
    concurrency,
  });
}

export const queues = {
  spotify: createQueue(QUEUES.SPOTIFY),
  youtube: createQueue(QUEUES.YOUTUBE),
  social: createQueue(QUEUES.SOCIAL),
  scoring: createQueue(QUEUES.SCORING),
  market: createQueue(QUEUES.MARKET),
};
