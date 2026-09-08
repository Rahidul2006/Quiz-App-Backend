import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { AuthRequest } from "../middleware/authMiddleware";

const generateToken = (id: string, email: string, role: string): string => {
  const secret = process.env.JWT_SECRET || "supersecret_crowdpulse_jwt_key_2026";
  return jwt.sign({ id, email, role }, secret, { expiresIn: "7d" });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password || !fullName) {
      res.status(400).json({ message: "Please provide email, password, and full name." });
      return;
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(409).json({ message: "An account with this email already exists." });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
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
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Registration failed" });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: "Please provide both email and password." });
      return;
    }

    // Support instant demo login if demo account requested
    if (email === "admin@demo.org" && password === "demo123") {
      let demoUser = await User.findOne({ email: "admin@demo.org" });
      if (!demoUser) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash("demo123", salt);
        demoUser = await User.create({
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

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
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
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Login failed" });
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve user profile" });
  }
};
