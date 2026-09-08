import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server as SocketIOServer } from "socket.io";
import { connectDB, disconnectDB } from "./config/db";
import { initSocket } from "./sockets/socketHandler";
import { errorHandler } from "./middleware/errorMiddleware";

import authRoutes from "./routes/authRoutes";
import eventRoutes from "./routes/eventRoutes";
import activityRoutes from "./routes/activityRoutes";
import quizRoutes from "./routes/quizRoutes";
import { Event } from "./models/Event";
import { Activity } from "./models/Activity";
import { WordCloudResponse } from "./models/WordCloudResponse";
import { Participant } from "./models/Participant";

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Safe dynamic CORS resolution supporting credentials without wildcard conflicts
const corsOriginValidator = (origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) => {
  if (!origin) {
    return callback(null, true);
  }
  // Allow all local dev hosts, LAN IPs, and FRONTEND_URL
  if (
    origin === FRONTEND_URL ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
    /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
    /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin)
  ) {
    return callback(null, origin);
  }
  return callback(null, origin);
};

// Socket.IO setup
const io = new SocketIOServer(server, {
  cors: {
    origin: corsOriginValidator as any,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  },
});

initSocket(io);

// Middleware
app.use(
  cors({
    origin: corsOriginValidator as any,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/quizzes", quizRoutes);

// Error Middleware
app.use(errorHandler);

import { checkAndEndExpiredActivities } from "./controllers/activityController";

// Clean up any legacy demo data from database if present
async function cleanupDemoData() {
  try {
    const demoEvent = await Event.findOne({ joinCode: "3157530" });
    if (demoEvent) {
      await Activity.deleteMany({ eventId: demoEvent._id });
      await Participant.deleteMany({ eventId: demoEvent._id });
      await Event.deleteOne({ _id: demoEvent._id });
      console.log("[Database] Legacy demo event cleaned up successfully.");
    }
  } catch (err: any) {
    console.warn("[Database] Cleanup notice:", err.message);
  }
}

// Start Server
const startServer = async () => {
  server.listen(PORT, () => {
    console.log(`🚀 [Backend] Server listening on http://localhost:${PORT}`);
    console.log(`🔌 [Socket.IO] Real-time engine ready for connections`);
  });

  // Start background ticker to auto-end expired activities (authoritative 1s tick)
  setInterval(checkAndEndExpiredActivities, 1000);

  connectDB()
    .then(async (connected) => {
      if (connected) {
        await cleanupDemoData();
      }
    })
    .catch((err) => {
      console.warn("[MongoDB] Connection notice:", err.message);
    });
};

startServer();


// Graceful Shutdown
process.on("SIGINT", async () => {
  console.log("\n[Backend] Shutting down gracefully...");
  await disconnectDB();
  process.exit(0);
});
