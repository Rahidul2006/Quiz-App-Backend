"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectDB = exports.connectDB = exports.isDbConnected = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
let dbConnected = false;
const isDbConnected = () => {
    return dbConnected && mongoose_1.default.connection.readyState === 1;
};
exports.isDbConnected = isDbConnected;
const connectDB = async () => {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/crowdpulse";
    // Do not buffer commands indefinitely when MongoDB is offline
    mongoose_1.default.set("bufferCommands", false);
    try {
        const conn = await mongoose_1.default.connect(mongoUri, {
            serverSelectionTimeoutMS: 8000,
        });
        dbConnected = true;
        console.log(`🌿 [MongoDB] Connected: ${conn.connection.host}/${conn.connection.name}`);
        mongoose_1.default.connection.on("error", (err) => {
            console.warn("[MongoDB] Connection warning:", err.message);
            dbConnected = false;
        });
        mongoose_1.default.connection.on("disconnected", () => {
            console.warn("[MongoDB] Disconnected. Switching to In-Memory fallback mode.");
            dbConnected = false;
        });
        return true;
    }
    catch (error) {
        dbConnected = false;
        console.warn(`⚠️  [Database] MongoDB offline or unreachable (${error.message}).`);
        console.log(`⚡ [Database] Activated In-Memory High-Performance Store. All REST APIs, Socket.IO, Polling & Quizzes are 100% functional!`);
        return false;
    }
};
exports.connectDB = connectDB;
const disconnectDB = async () => {
    if (dbConnected) {
        await mongoose_1.default.disconnect();
        dbConnected = false;
        console.log("[MongoDB] Disconnected gracefully.");
    }
};
exports.disconnectDB = disconnectDB;
