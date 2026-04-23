import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import authRoutes from "./routes/auth";
import artistRoutes from "./routes/artists";
import leagueRoutes from "./routes/leagues";
import teamRoutes from "./routes/teams";
import marketRoutes from "./routes/market";

const app = express();

app.use(helmet());
app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/artists", artistRoutes);
app.use("/api/leagues", leagueRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/market", marketRoutes);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.PORT, () => {
  console.log(`Roster API running on port ${config.PORT}`);
});

export default app;
