import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Judge } from "../models/Judge";
import { JudgeAuthRequest } from "../middleware/judgeAuthMiddleware";

const generateJudgeToken = (id: string, username: string, name: string, roundId?: string): string => {
  const secret = process.env.JWT_SECRET || "supersecret_crowdpulse_jwt_key_2026";
  return jwt.sign(
    { id, username, name, roundId, role: "judge" },
    secret,
    { expiresIn: "7d" }
  );
};

export const judgeLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ message: "Please provide both username and password" });
      return;
    }

    const judge = await Judge.findOne({ username: username.toLowerCase().trim() });
    if (!judge) {
      res.status(401).json({ message: "Invalid judge credentials" });
      return;
    }

    if (judge.status === "disabled") {
      res.status(403).json({ message: "This judge account has been disabled by the administrator" });
      return;
    }

    const isMatch = await bcrypt.compare(password, judge.passwordHash);
    if (!isMatch) {
      res.status(401).json({ message: "Invalid judge credentials" });
      return;
    }

    const token = generateJudgeToken(
      judge._id.toString(),
      judge.username,
      judge.name,
      judge.roundId ? judge.roundId.toString() : undefined
    );

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
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Judge login failed" });
  }
};

export const getJudgeMe = async (req: JudgeAuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.judge) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }

    const judge = await Judge.findById(req.judge.id).select("-passwordHash");
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
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch judge profile" });
  }
};
