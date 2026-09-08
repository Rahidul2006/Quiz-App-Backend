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

// Seed Initial Demo Event in MongoDB if none exist
async function seedInitialData() {
  try {
    const existing = await Event.findOne({ joinCode: "3157530" });
    if (!existing) {
      console.log("[MongoDB] Seeding initial demo event: React Kolkata Offline Meetup 2026...");
      const event = await Event.create({
        title: "React Kolkata Offline Meetup 2026",
        description: "Annual gathering of React, Next.js and frontend developers in Kolkata.",
        joinCode: "3157530",
        status: "active",
        theme: "dark",
        settings: {
          require_name: true,
          allow_anonymous: false,
          show_live_results: true,
        },
      });

      // Seed Word Cloud Activity
      const wordCloud = await Activity.create({
        eventId: event._id,
        type: "word_cloud",
        title: "Where Are You Joining From?",
        status: "active",
        orderIndex: 0,
        settings: { show_live_results: true },
      });

      event.activeActivityId = wordCloud._id as any;
      await event.save();

      // Seed Poll Activity
      await Activity.create({
        eventId: event._id,
        type: "poll",
        title: "Where are you joining from?",
        status: "draft",
        orderIndex: 1,
        settings: { poll_type: "multiple", allow_multiple: true, show_live_results: true },
        options: [
          { text: "Techno India University", order_index: 0 },
          { text: "Brainware University", order_index: 1 },
          { text: "JIS College of Engineering", order_index: 2 },
          { text: "Other Institutes / Working Pros", order_index: 3 },
        ],
      });

      // Seed Quiz Activity
      await Activity.create({
        eventId: event._id,
        type: "quiz",
        title: "React Kolkata Speed Trivia ⚡",
        status: "draft",
        orderIndex: 2,
        settings: { quiz_state: "answering" },
        questions: [
          {
            question_text: "Which organization primarily created and maintains React?",
            time_limit_sec: 15,
            points: 1000,
            explanation: "React was created by Jordan Walke, a software engineer at Meta (Facebook).",
            order_index: 0,
            options: [
              { option_text: "Google", is_correct: false, order_index: 0 },
              { option_text: "Meta", is_correct: true, order_index: 1 },
              { option_text: "Vercel", is_correct: false, order_index: 2 },
              { option_text: "Microsoft", is_correct: false, order_index: 3 },
            ],
          },
          {
            question_text: "Which hook is used in React to manage component side effects?",
            time_limit_sec: 15,
            points: 1000,
            explanation: "useEffect lets you synchronize a component with an external system.",
            order_index: 1,
            options: [
              { option_text: "useState", is_correct: false, order_index: 0 },
              { option_text: "useEffect", is_correct: true, order_index: 1 },
              { option_text: "useMemo", is_correct: false, order_index: 2 },
              { option_text: "useCallback", is_correct: false, order_index: 3 },
            ],
          },
        ],
      });

      // Seed participants & words
      const sampleParticipants = [
        "Prodipta Roy",
        "Rashmi Tiwari",
        "Suman Singha",
        "Soumyadeep Dey",
        "Subha Sasmal",
      ];
      for (const name of sampleParticipants) {
        await Participant.create({
          eventId: event._id,
          name,
          sessionToken: "sess_" + Math.random().toString(36).substring(2, 10),
        });
      }

      const words = [
        "React Kolkata",
        "React Kolkata",
        "Techno India",
        "Techno India",
        "Kolkata",
        "Brainware University",
        "JISCE",
        "Howrah",
        "Siliguri",
      ];
      for (const w of words) {
        await WordCloudResponse.create({
          activityId: wordCloud._id,
          participantId: "seed_part",
          word: w,
          normalizedWord: w.toLowerCase().replace(/[^\w\s]/gi, ""),
        });
      }

      console.log("[MongoDB] Initial demo event seeded successfully!");
    }
  } catch (err) {
    console.warn("[MongoDB] Seed check:", err);
  }
}

// Start Server
const startServer = async () => {
  server.listen(PORT, () => {
    console.log(`🚀 [Backend] Server listening on http://localhost:${PORT}`);
    console.log(`🔌 [Socket.IO] Real-time engine ready for connections`);
  });

  connectDB()
    .then((connected) => {
      if (connected) {
        seedInitialData();
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
