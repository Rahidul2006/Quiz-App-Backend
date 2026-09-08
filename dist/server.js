"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const socket_io_1 = require("socket.io");
const db_1 = require("./config/db");
const socketHandler_1 = require("./sockets/socketHandler");
const errorMiddleware_1 = require("./middleware/errorMiddleware");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const eventRoutes_1 = __importDefault(require("./routes/eventRoutes"));
const activityRoutes_1 = __importDefault(require("./routes/activityRoutes"));
const quizRoutes_1 = __importDefault(require("./routes/quizRoutes"));
const Event_1 = require("./models/Event");
const Activity_1 = require("./models/Activity");
const WordCloudResponse_1 = require("./models/WordCloudResponse");
const Participant_1 = require("./models/Participant");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
// Safe dynamic CORS resolution supporting credentials without wildcard conflicts
const corsOriginValidator = (origin, callback) => {
    if (!origin) {
        return callback(null, true);
    }
    // Allow all local dev hosts, LAN IPs, and FRONTEND_URL
    if (origin === FRONTEND_URL ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
        /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
        /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin)) {
        return callback(null, origin);
    }
    return callback(null, origin);
};
// Socket.IO setup
const io = new socket_io_1.Server(server, {
    cors: {
        origin: corsOriginValidator,
        methods: ["GET", "POST", "PATCH", "DELETE"],
        credentials: true,
    },
});
(0, socketHandler_1.initSocket)(io);
// Middleware
app.use((0, cors_1.default)({
    origin: corsOriginValidator,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Health Check
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date() });
});
// API Routes
app.use("/api/auth", authRoutes_1.default);
app.use("/api/events", eventRoutes_1.default);
app.use("/api/activities", activityRoutes_1.default);
app.use("/api/quizzes", quizRoutes_1.default);
// Error Middleware
app.use(errorMiddleware_1.errorHandler);
// Seed Initial Demo Event in MongoDB if none exist
async function seedInitialData() {
    try {
        const existing = await Event_1.Event.findOne({ joinCode: "3157530" });
        if (!existing) {
            console.log("[MongoDB] Seeding initial demo event: React Kolkata Offline Meetup 2026...");
            const event = await Event_1.Event.create({
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
            const wordCloud = await Activity_1.Activity.create({
                eventId: event._id,
                type: "word_cloud",
                title: "Where Are You Joining From?",
                status: "active",
                orderIndex: 0,
                settings: { show_live_results: true },
            });
            event.activeActivityId = wordCloud._id;
            await event.save();
            // Seed Poll Activity
            await Activity_1.Activity.create({
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
            await Activity_1.Activity.create({
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
                await Participant_1.Participant.create({
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
                await WordCloudResponse_1.WordCloudResponse.create({
                    activityId: wordCloud._id,
                    participantId: "seed_part",
                    word: w,
                    normalizedWord: w.toLowerCase().replace(/[^\w\s]/gi, ""),
                });
            }
            console.log("[MongoDB] Initial demo event seeded successfully!");
        }
    }
    catch (err) {
        console.warn("[MongoDB] Seed check:", err);
    }
}
const eventController_1 = require("./controllers/eventController");
// Start Server
const startServer = async () => {
    server.listen(PORT, () => {
        console.log(`🚀 [Backend] Server listening on http://localhost:${PORT}`);
        console.log(`🔌 [Socket.IO] Real-time engine ready for connections`);
    });
    // Start background ticker to auto-end expired events (every 5 seconds)
    setInterval(eventController_1.checkAndEndExpiredEvents, 5000);
    (0, db_1.connectDB)()
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
    await (0, db_1.disconnectDB)();
    process.exit(0);
});
