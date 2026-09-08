"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
const generateToken = (id, email, role) => {
    const secret = process.env.JWT_SECRET || "supersecret_crowdpulse_jwt_key_2026";
    return jsonwebtoken_1.default.sign({ id, email, role }, secret, { expiresIn: "7d" });
};
const register = async (req, res) => {
    try {
        const { email, password, fullName } = req.body;
        if (!email || !password || !fullName) {
            res.status(400).json({ message: "Please provide email, password, and full name." });
            return;
        }
        const existingUser = await User_1.User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            res.status(409).json({ message: "An account with this email already exists." });
            return;
        }
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(password, salt);
        const user = await User_1.User.create({
            email: email.toLowerCase(),
            passwordHash,
            fullName,
            role: "admin",
        });
        const token = generateToken(user._id.toString(), user.email, user.role);
        res.status(201).json({
            token,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
            },
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Registration failed" });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ message: "Please provide both email and password." });
            return;
        }
        // Support instant demo login if demo account requested
        if (email === "admin@demo.org" && password === "demo123") {
            let demoUser = await User_1.User.findOne({ email: "admin@demo.org" });
            if (!demoUser) {
                const salt = await bcryptjs_1.default.genSalt(10);
                const passwordHash = await bcryptjs_1.default.hash("demo123", salt);
                demoUser = await User_1.User.create({
                    email: "admin@demo.org",
                    passwordHash,
                    fullName: "Demo Event Host",
                    role: "admin",
                });
            }
            const token = generateToken(demoUser._id.toString(), demoUser.email, demoUser.role);
            res.json({
                token,
                user: {
                    id: demoUser._id,
                    email: demoUser.email,
                    fullName: demoUser.fullName,
                    role: demoUser.role,
                },
            });
            return;
        }
        const user = await User_1.User.findOne({ email: email.toLowerCase() });
        if (!user) {
            res.status(401).json({ message: "Invalid email or password." });
            return;
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            res.status(401).json({ message: "Invalid email or password." });
            return;
        }
        const token = generateToken(user._id.toString(), user.email, user.role);
        res.json({
            token,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
            },
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Login failed" });
    }
};
exports.login = login;
const getMe = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const user = await User_1.User.findById(req.user.id).select("-passwordHash");
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        res.json({ user });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to retrieve user profile" });
    }
};
exports.getMe = getMe;
