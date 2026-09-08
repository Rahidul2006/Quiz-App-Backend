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
const eventController_1 = require("./controllers/eventController");
// Clean up any legacy demo data from database if present
async function cleanupDemoData() {
    try {
        const demoEvent = await Event_1.Event.findOne({ joinCode: "3157530" });
        if (demoEvent) {
            await Activity_1.Activity.deleteMany({ eventId: demoEvent._id });
            await Participant_1.Participant.deleteMany({ eventId: demoEvent._id });
            await Event_1.Event.deleteOne({ _id: demoEvent._id });
            console.log("[Database] Legacy demo event cleaned up successfully.");
        }
    }
    catch (err) {
        console.warn("[Database] Cleanup notice:", err.message);
    }
}
// Start Server
const startServer = async () => {
    server.listen(PORT, () => {
        console.log(`🚀 [Backend] Server listening on http://localhost:${PORT}`);
        console.log(`🔌 [Socket.IO] Real-time engine ready for connections`);
    });
    // Start background ticker to auto-end expired events (every 5 seconds)
    setInterval(eventController_1.checkAndEndExpiredEvents, 5000);
    (0, db_1.connectDB)()
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
    await (0, db_1.disconnectDB)();
    process.exit(0);
});
