import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import pino from "pino";

import analyticsRouter from "./routes/analytics.js";
import { verifyToken } from "./middleware/auth.js";

// ─── Logger ──────────────────────────────────────────────────

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

// ─── Config ──────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const MONGO_URI =
  process.env.MONGO_URI ?? "mongodb://localhost:27017/dashanalytics";
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

// ─── Express App ─────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Body parsing
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Compression
app.use(compression());

// Request logging
app.use(
  morgan("short", {
    stream: { write: (message: string) => logger.info(message.trim()) },
  }),
);

// Global rate limiter
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "900000", 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "100", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ─── Health Check ────────────────────────────────────────────

app.get("/health", (_req, res) => {
  const mongoState = mongoose.connection.readyState;
  res.status(mongoState === 1 ? 200 : 503).json({
    status: mongoState === 1 ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongo: ["disconnected", "connected", "connecting", "disconnecting"][
      mongoState
    ],
  });
});

// ─── API Routes ──────────────────────────────────────────────

app.use("/api/analytics", verifyToken, analyticsRouter);

// ─── Global Error Handler ────────────────────────────────────

app.use(
  (
    err: Error & { status?: number; code?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status = err.status ?? 500;
    const message =
      status === 500 && process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message;

    logger.error({ err, status }, "Unhandled error");

    res.status(status).json({
      error: {
        message,
        code: err.code ?? "INTERNAL_ERROR",
        status,
      },
    });
  },
);

// ─── WebSocket Server ────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(4001, "Authentication required");
    return;
  }

  logger.info("WebSocket client connected");

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      logger.debug({ message }, "WS message received");

      // Handle subscription to specific metric channels
      if (message.type === "subscribe" && message.channel) {
        (ws as unknown as Record<string, unknown>).channel = message.channel;
        ws.send(
          JSON.stringify({
            type: "subscribed",
            channel: message.channel,
          }),
        );
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    }
  });

  ws.on("close", () => {
    logger.info("WebSocket client disconnected");
  });
});

// Broadcast helper for real-time metric updates
export function broadcastMetricUpdate(
  metric: string,
  value: number,
  timestamp: string,
) {
  const payload = JSON.stringify({
    type: "metric_update",
    payload: { metric, value, timestamp },
  });

  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  });
}

// ─── Database Connection & Server Start ──────────────────────

async function bootstrap() {
  try {
    await mongoose.connect(MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info("Connected to MongoDB");

    mongoose.connection.on("error", (err) => {
      logger.error({ err }, "MongoDB connection error");
    });

    httpServer.listen(PORT, () => {
      logger.info(`Server listening on http://localhost:${PORT}`);
      logger.info(`WebSocket server available at ws://localhost:${PORT}/ws`);
      logger.info(`Environment: ${process.env.NODE_ENV ?? "development"}`);
    });
  } catch (err) {
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
  }
}

// Graceful shutdown
const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    httpServer.close(() => {
      logger.info("HTTP server closed");
    });

    wss.close(() => {
      logger.info("WebSocket server closed");
    });

    await mongoose.disconnect();
    logger.info("MongoDB disconnected");

    process.exit(0);
  });
});

bootstrap();
