"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJudgeMe = exports.judgeLogin = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Judge_1 = require("../models/Judge");
const generateJudgeToken = (id, username, name, roundId) => {
    const secret = process.env.JWT_SECRET || "supersecret_crowdpulse_jwt_key_2026";
    return jsonwebtoken_1.default.sign({ id, username, name, roundId, role: "judge" }, secret, { expiresIn: "7d" });
};
const judgeLogin = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ message: "Please provide both username and password" });
            return;
        }
        const judge = await Judge_1.Judge.findOne({ username: username.toLowerCase().trim() });
        if (!judge) {
            res.status(401).json({ message: "Invalid judge credentials" });
            return;
        }
        if (judge.status === "disabled") {
            res.status(403).json({ message: "This judge account has been disabled by the administrator" });
            return;
        }
        const isMatch = await bcryptjs_1.default.compare(password, judge.passwordHash);
        if (!isMatch) {
            res.status(401).json({ message: "Invalid judge credentials" });
            return;
        }
        const token = generateJudgeToken(judge._id.toString(), judge.username, judge.name, judge.roundId ? judge.roundId.toString() : undefined);
        res.json({
            token,
            judge: {
                id: judge._id,
                username: judge.username,
                name: judge.name,
                roundId: judge.roundId,
                weight: judge.weight,
                tieBreakPriority: judge.tieBreakPriority,
                status: judge.status,
            },
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Judge login failed" });
    }
};
exports.judgeLogin = judgeLogin;
const getJudgeMe = async (req, res) => {
    try {
        if (!req.judge) {
            res.status(401).json({ message: "Not authenticated" });
            return;
        }
        const judge = await Judge_1.Judge.findById(req.judge.id).select("-passwordHash");
        if (!judge) {
            res.status(404).json({ message: "Judge not found" });
            return;
        }
        res.json({
            judge: {
                id: judge._id,
                username: judge.username,
                name: judge.name,
                roundId: judge.roundId,
                weight: judge.weight,
                tieBreakPriority: judge.tieBreakPriority,
                status: judge.status,
            },
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch judge profile" });
    }
};
exports.getJudgeMe = getJudgeMe;
