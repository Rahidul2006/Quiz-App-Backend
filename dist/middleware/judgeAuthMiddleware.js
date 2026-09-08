"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireJudge = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Judge_1 = require("../models/Judge");
const requireJudge = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
        res.status(401).json({ message: "Judge authentication token required" });
        return;
    }
    const jwtSecret = process.env.JWT_SECRET || "supersecret_crowdpulse_jwt_key_2026";
    try {
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        if (decoded.role !== "judge") {
            res.status(403).json({ message: "Forbidden: Judge privileges required" });
            return;
        }
        // Verify judge still exists and is not disabled
        const judge = await Judge_1.Judge.findById(decoded.id);
        if (!judge) {
            res.status(401).json({ message: "Judge account not found" });
            return;
        }
        if (judge.status === "disabled") {
            res.status(403).json({ message: "Judge account is disabled. Please contact the administrator." });
            return;
        }
        req.judge = {
            id: judge._id.toString(),
            username: judge.username,
            name: judge.name,
            roundId: judge.roundId ? judge.roundId.toString() : undefined,
            role: "judge",
        };
        next();
    }
    catch (err) {
        res.status(401).json({ message: "Invalid or expired judge token" });
    }
};
exports.requireJudge = requireJudge;
