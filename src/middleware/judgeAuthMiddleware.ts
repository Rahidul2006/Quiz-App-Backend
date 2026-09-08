import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Judge } from "../models/Judge";

export interface JudgeAuthRequest extends Request {
  judge?: {
    id: string;
    username: string;
    name: string;
    roundId?: string;
    role: "judge";
  };
}

export const requireJudge = async (
  req: JudgeAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Judge authentication token required" });
    return;
  }

  const jwtSecret = process.env.JWT_SECRET || "supersecret_crowdpulse_jwt_key_2026";

  try {
    const decoded = jwt.verify(token, jwtSecret) as {
      id: string;
      username: string;
      name: string;
      roundId?: string;
      role: string;
    };

    if (decoded.role !== "judge") {
      res.status(403).json({ message: "Forbidden: Judge privileges required" });
      return;
    }

    // Verify judge still exists and is not disabled
    const judge = await Judge.findById(decoded.id);
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
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired judge token" });
  }
};
