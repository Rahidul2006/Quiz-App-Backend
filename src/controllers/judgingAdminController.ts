import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { JudgingRound } from "../models/JudgingRound";
import { Judge } from "../models/Judge";
import { JudgingTeam } from "../models/JudgingTeam";
import { JudgingCriterion } from "../models/JudgingCriterion";
import { JudgeAssignment } from "../models/JudgeAssignment";
import { Evaluation } from "../models/Evaluation";
import { emitToJudgingRoom } from "../sockets/socketHandler";
import {
  listExternalCollections,
  fetchTeamsFromCollection,
  importSingleTeamToRound,
} from "../services/externalDbService";

// ==========================================
// 1. ROUND MANAGEMENT
// ==========================================

export const getRounds = async (req: Request, res: Response): Promise<void> => {
  try {
    const rounds = await JudgingRound.find().sort({ createdAt: -1 });
    res.json(rounds.map((r) => ({ ...r.toObject(), id: r._id })));
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch rounds" });
  }
};

export const getRoundById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const round = await JudgingRound.findById(id);
    if (!round) {
      res.status(404).json({ message: "Round not found" });
      return;
    }
    res.json({ ...round.toObject(), id: round._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch round" });
  }
};

export const createRound = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, evaluationMode, allowJudgeEditAfterSubmit } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ message: "Round name is required" });
      return;
    }

    const round = await JudgingRound.create({
      name: name.trim(),
      description: description ? description.trim() : "",
      evaluationMode: evaluationMode === "assigned" ? "assigned" : "all",
      allowJudgeEditAfterSubmit: Boolean(allowJudgeEditAfterSubmit),
      status: "active",
      isLocked: false,
    });

    res.status(201).json({ ...round.toObject(), id: round._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create round" });
  }
};

export const updateRound = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, evaluationMode, allowJudgeEditAfterSubmit, isLocked, status } = req.body;

    const round = await JudgingRound.findById(id);
    if (!round) {
      res.status(404).json({ message: "Round not found" });
      return;
    }

    if (name !== undefined) round.name = name.trim();
    if (description !== undefined) round.description = description.trim();
    if (evaluationMode !== undefined) round.evaluationMode = evaluationMode;
    if (allowJudgeEditAfterSubmit !== undefined) round.allowJudgeEditAfterSubmit = Boolean(allowJudgeEditAfterSubmit);
    if (isLocked !== undefined) {
      round.isLocked = Boolean(isLocked);
      if (round.isLocked) round.status = "locked";
      else if (round.status === "locked") round.status = "active";
    }
    if (status !== undefined) round.status = status;

    await round.save();

    emitToJudgingRoom("judging:round_updated", {
      roundId: round._id.toString(),
      roundName: round.name,
      isLocked: round.isLocked,
      status: round.status,
      evaluationMode: round.evaluationMode,
      allowJudgeEditAfterSubmit: round.allowJudgeEditAfterSubmit,
    });
    if (isLocked !== undefined) {
      emitToJudgingRoom("judging:lock_changed", {
        roundId: round._id.toString(),
        roundName: round.name,
        isLocked: round.isLocked,
        status: round.status,
      });
    }

    res.json({ ...round.toObject(), id: round._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update round" });
  }
};

export const toggleLockRound = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const round = await JudgingRound.findById(id);
    if (!round) {
      res.status(404).json({ message: "Round not found" });
      return;
    }

    round.isLocked = !round.isLocked;
    round.status = round.isLocked ? "locked" : "active";
    await round.save();

    emitToJudgingRoom("judging:lock_changed", {
      roundId: round._id.toString(),
      roundName: round.name,
      isLocked: round.isLocked,
      status: round.status,
    });
    emitToJudgingRoom("judging:round_updated", {
      roundId: round._id.toString(),
      roundName: round.name,
      isLocked: round.isLocked,
      status: round.status,
      evaluationMode: round.evaluationMode,
      allowJudgeEditAfterSubmit: round.allowJudgeEditAfterSubmit,
    });

    res.json({
      message: round.isLocked ? "Judging locked successfully" : "Judging reopened successfully",
      isLocked: round.isLocked,
      status: round.status,
      round: { ...round.toObject(), id: round._id },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to toggle round lock" });
  }
};

export const deleteRound = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await JudgingRound.findByIdAndDelete(id);
    await JudgingTeam.deleteMany({ roundId: id });
    await JudgingCriterion.deleteMany({ roundId: id });
    await JudgeAssignment.deleteMany({ roundId: id });
    await Evaluation.deleteMany({ roundId: id });

    res.json({ message: "Judging round and associated entities deleted" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete round" });
  }
};

// ==========================================
// 2. JUDGE MANAGEMENT
// ==========================================

export const getJudges = async (req: Request, res: Response): Promise<void> => {
  try {
    // Judges are global — no round filtering. All judges evaluate the active round.
    const judges = await Judge.find({}).select("-passwordHash").sort({ createdAt: 1 });
    res.json(judges.map((j) => ({ ...j.toObject(), id: j._id })));
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch judges" });
  }
};

export const createJudge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, username, password, weight, tieBreakPriority, status, roundId } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ message: "Judge name is required" });
      return;
    }

    if (!username || !username.trim()) {
      res.status(400).json({ message: "Username is required" });
      return;
    }

    const cleanUsername = username.toLowerCase().trim();
    const existing = await Judge.findOne({ username: cleanUsername });
    if (existing) {
      res.status(409).json({ message: `Username '${cleanUsername}' is already taken.` });
      return;
    }

    const plainPassword = password && password.trim() ? password.trim() : crypto.randomBytes(4).toString("hex");
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(plainPassword, salt);

    const judge = await Judge.create({
      name: name.trim(),
      username: cleanUsername,
      passwordHash,
      weight: typeof weight === "number" && weight > 0 ? weight : 1.0,
      tieBreakPriority: Number(tieBreakPriority) || 1,
      status: status === "disabled" ? "disabled" : "active",
      roundId: roundId || null,
      role: "judge",
    });

    res.status(201).json({
      judge: {
        id: judge._id,
        _id: judge._id,
        name: judge.name,
        username: judge.username,
        weight: judge.weight,
        tieBreakPriority: judge.tieBreakPriority,
        status: judge.status,
        roundId: judge.roundId,
      },
      plainPassword, // Returned once so admin can show/copy credentials
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create judge" });
  }
};

export const updateJudge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, weight, tieBreakPriority, status, roundId } = req.body;

    const judge = await Judge.findById(id);
    if (!judge) {
      res.status(404).json({ message: "Judge not found" });
      return;
    }

    if (name !== undefined) judge.name = name.trim();
    if (weight !== undefined) judge.weight = Math.max(0.1, Number(weight) || 1.0);
    if (tieBreakPriority !== undefined) judge.tieBreakPriority = Number(tieBreakPriority) || 1;
    if (status !== undefined) judge.status = status === "disabled" ? "disabled" : "active";
    if (roundId !== undefined) judge.roundId = roundId;

    await judge.save();
    res.json({
      id: judge._id,
      _id: judge._id,
      name: judge.name,
      username: judge.username,
      weight: judge.weight,
      tieBreakPriority: judge.tieBreakPriority,
      status: judge.status,
      roundId: judge.roundId,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update judge" });
  }
};

export const regenerateJudgePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const judge = await Judge.findById(id);
    if (!judge) {
      res.status(404).json({ message: "Judge not found" });
      return;
    }

    const newPlainPassword = crypto.randomBytes(4).toString("hex") + "!";
    const salt = await bcrypt.genSalt(10);
    judge.passwordHash = await bcrypt.hash(newPlainPassword, salt);
    await judge.save();

    res.json({
      message: "Password regenerated successfully",
      username: judge.username,
      newPassword: newPlainPassword,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to regenerate password" });
  }
};

export const toggleJudgeStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const judge = await Judge.findById(id);
    if (!judge) {
      res.status(404).json({ message: "Judge not found" });
      return;
    }

    judge.status = judge.status === "active" ? "disabled" : "active";
    await judge.save();

    emitToJudgingRoom("judging:judge_status_changed", {
      judgeId: judge._id.toString(),
      status: judge.status,
    });

    res.json({
      message: `Judge status changed to ${judge.status}`,
      status: judge.status,
      id: judge._id,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to toggle judge status" });
  }
};

export const deleteJudge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await Judge.findByIdAndDelete(id);
    await JudgeAssignment.deleteMany({ judgeId: id });
    await Evaluation.deleteMany({ judgeId: id });

    res.json({ message: "Judge deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete judge" });
  }
};

// ==========================================
// 3. TEAM MANAGEMENT
// ==========================================

export const getTeams = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roundId } = req.params;
    const teams = await JudgingTeam.find({ roundId }).sort({ orderIndex: 1, teamCode: 1 });
    res.json(teams.map((t) => ({ ...t.toObject(), id: t._id })));
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch teams" });
  }
};

/**
 * Set a round as the active (primary) round.
 * Marks all other rounds as draft status and broadcasts to all judges via Socket.IO.
 */
export const setActiveRound = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const round = await JudgingRound.findById(id);
    if (!round) {
      res.status(404).json({ message: "Round not found" });
      return;
    }

    // Before activating requested round, make every other round inactive/draft
    // Ensures database ends with exactly ONE status: "active" round
    await JudgingRound.updateMany(
      { _id: { $ne: id } },
      { status: "draft" }
    );

    // Save requested round as status: "active"
    round.status = "active";
    await round.save();

    // Broadcast exactly one judging:round_switched event
    emitToJudgingRoom("judging:round_switched", {
      roundId: round._id.toString(),
      roundName: round.name,
      isLocked: round.isLocked,
      switchedAt: new Date(),
    });

    res.json({
      message: `Round '${round.name}' is now the active judging round. All judges will be notified.`,
      round: { ...round.toObject(), id: round._id },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to set active round" });
  }
};

// ==========================================
// 3b. EXTERNAL DB IMPORT (Dynamic — Any MongoDB)
// ==========================================

/**
 * Connect to any external MongoDB URI and list its collections.
 * Body: { uri: string, dbName?: string }
 */
export const connectExternalDb = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uri, dbName } = req.body;
    if (!uri || !uri.trim()) {
      res.status(400).json({ message: "MongoDB URI is required" });
      return;
    }

    const { resolvedDbName, collections } = await listExternalCollections(
      uri.trim(),
      dbName?.trim() || undefined
    );

    res.json({
      success: true,
      dbName: resolvedDbName,
      collections,
    });
  } catch (error: any) {
    const msg = error.message || "Failed to connect to external database";
    if (msg.includes("Database name is required")) {
      res.status(400).json({ message: msg });
      return;
    }
    res.status(500).json({
      message: `Connection failed: ${msg}`,
    });
  }
};

/**
 * Preview teams from a specific collection in an external MongoDB.
 * Body: { uri, dbName?, collection, teamNameField?, projectField?, membersField? }
 */
export const previewExternalDbTeams = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uri, dbName, collection, teamNameField, projectField, membersField } = req.body;
    if (!uri || !uri.trim()) {
      res.status(400).json({ message: "MongoDB URI is required" });
      return;
    }
    if (!collection || !collection.trim()) {
      res.status(400).json({ message: "Collection name is required" });
      return;
    }

    const teams = await fetchTeamsFromCollection(
      uri.trim(),
      dbName?.trim() || undefined,
      collection.trim(),
      {
        teamNameField: teamNameField?.trim() || undefined,
        projectField: projectField?.trim() || undefined,
        membersField: membersField?.trim() || undefined,
        limit: 200,
      }
    );

    res.json({
      success: true,
      count: teams.length,
      teams,
    });
  } catch (error: any) {
    const msg = error.message || "Failed to preview teams from external database";
    if (msg.includes("Database name is required")) {
      res.status(400).json({ message: msg });
      return;
    }
    res.status(500).json({ message: msg });
  }
};

/**
 * Import a single team from external data into a round.
 * Body: { teamName, projectName, members, memberDetails?, teamCodePrefix? }
 */
export const importSingleTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roundId } = req.params;
    const { teamName, projectName, members, memberDetails, teamCodePrefix } = req.body;

    if (!teamName || !teamName.trim()) {
      res.status(400).json({ message: "teamName is required" });
      return;
    }

    const round = await JudgingRound.findById(roundId);
    if (!round) {
      res.status(404).json({ message: "Round not found" });
      return;
    }

    const teamData = {
      teamName: teamName.trim(),
      projectName: (projectName || "").trim() || `${teamName.trim()} Project`,
      members: (members || "").trim(),
      memberCount: Array.isArray(memberDetails) ? memberDetails.length : 0,
      memberDetails: Array.isArray(memberDetails) ? memberDetails : [],
    };

    const team = await importSingleTeamToRound(roundId, teamData, teamCodePrefix?.trim() || "EXT");
    res.status(201).json({ ...team.toObject(), id: team._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to import team" });
  }
};

export const createTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roundId } = req.params;
    const { teamCode, teamName, projectName, members } = req.body;

    if (!teamName || !teamName.trim()) {
      res.status(400).json({ message: "Team name is required" });
      return;
    }
    if (!projectName || !projectName.trim()) {
      res.status(400).json({ message: "Project name is required" });
      return;
    }

    const count = await JudgingTeam.countDocuments({ roundId });
    const code = teamCode && teamCode.trim() ? teamCode.trim() : `TEAM-${String(count + 1).padStart(3, "0")}`;

    const existing = await JudgingTeam.findOne({ roundId, teamCode: code });
    if (existing) {
      res.status(409).json({ message: `Team code '${code}' already exists in this round` });
      return;
    }

    const team = await JudgingTeam.create({
      roundId,
      teamCode: code,
      teamName: teamName.trim(),
      projectName: projectName.trim(),
      members: members ? members.trim() : "",
      orderIndex: count,
    });

    res.status(201).json({ ...team.toObject(), id: team._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create team" });
  }
};

export const updateTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { teamCode, teamName, projectName, members, orderIndex } = req.body;

    const team = await JudgingTeam.findById(id);
    if (!team) {
      res.status(404).json({ message: "Team not found" });
      return;
    }

    if (teamCode !== undefined) team.teamCode = teamCode.trim();
    if (teamName !== undefined) team.teamName = teamName.trim();
    if (projectName !== undefined) team.projectName = projectName.trim();
    if (members !== undefined) team.members = members.trim();
    if (orderIndex !== undefined) team.orderIndex = Number(orderIndex);

    await team.save();
    res.json({ ...team.toObject(), id: team._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update team" });
  }
};

export const deleteTeam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await JudgingTeam.findByIdAndDelete(id);
    await JudgeAssignment.deleteMany({ teamId: id });
    await Evaluation.deleteMany({ teamId: id });

    res.json({ message: "Team and related assignments deleted" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete team" });
  }
};

// ==========================================
// 4. CRITERIA MANAGEMENT
// ==========================================

export const getCriteria = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roundId } = req.params;
    const criteria = await JudgingCriterion.find({ roundId }).sort({ orderIndex: 1 });
    res.json(criteria.map((c) => ({ ...c.toObject(), id: c._id })));
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch criteria" });
  }
};

export const createCriterion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roundId } = req.params;
    const { name, maxScore, description } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ message: "Criterion name is required" });
      return;
    }

    const count = await JudgingCriterion.countDocuments({ roundId });
    const criterion = await JudgingCriterion.create({
      roundId,
      name: name.trim(),
      maxScore: Math.max(1, Number(maxScore) || 20),
      description: description ? description.trim() : "",
      orderIndex: count,
    });

    emitToJudgingRoom("judging:criteria_updated", { roundId });

    res.status(201).json({ ...criterion.toObject(), id: criterion._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create criterion" });
  }
};

export const updateCriterion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, maxScore, description, orderIndex } = req.body;

    const criterion = await JudgingCriterion.findById(id);
    if (!criterion) {
      res.status(404).json({ message: "Criterion not found" });
      return;
    }

    if (name !== undefined) criterion.name = name.trim();
    if (maxScore !== undefined) criterion.maxScore = Math.max(1, Number(maxScore) || 20);
    if (description !== undefined) criterion.description = description.trim();
    if (orderIndex !== undefined) criterion.orderIndex = Number(orderIndex);

    await criterion.save();

    emitToJudgingRoom("judging:criteria_updated", { roundId: criterion.roundId.toString() });

    res.json({ ...criterion.toObject(), id: criterion._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update criterion" });
  }
};

export const deleteCriterion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const criterion = await JudgingCriterion.findById(id);
    const roundId = criterion ? criterion.roundId.toString() : null;
    await JudgingCriterion.findByIdAndDelete(id);

    if (roundId) {
      emitToJudgingRoom("judging:criteria_updated", { roundId });
    }

    res.json({ message: "Criterion deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete criterion" });
  }
};

// ==========================================
// 5. ASSIGNMENTS MANAGEMENT
// ==========================================

export const getAssignments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roundId } = req.params;
    const assignments = await JudgeAssignment.find({ roundId });
    res.json(assignments.map((a) => ({ ...a.toObject(), id: a._id })));
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch assignments" });
  }
};

export const saveAssignments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roundId } = req.params;
    const { assignments } = req.body; // Array of { judgeId, teamId }

    if (!Array.isArray(assignments)) {
      res.status(400).json({ message: "Assignments array is required" });
      return;
    }

    // Replace existing assignments for this round
    await JudgeAssignment.deleteMany({ roundId });

    if (assignments.length > 0) {
      const docs = assignments.map((a: any) => ({
        roundId,
        judgeId: a.judgeId,
        teamId: a.teamId,
      }));
      await JudgeAssignment.create(docs);
    }

    emitToJudgingRoom("judging:assignments_updated", { roundId });

    const updated = await JudgeAssignment.find({ roundId });
    res.json({
      message: "Assignments updated successfully",
      assignments: updated.map((a) => ({ ...a.toObject(), id: a._id })),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to save assignments" });
  }
};

export const clearAssignments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roundId } = req.params;
    await JudgeAssignment.deleteMany({ roundId });

    emitToJudgingRoom("judging:assignments_updated", { roundId });

    res.json({ message: "Assignments cleared successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete assignments" });
  }
};

// ==========================================
// 6. LIVE OVERVIEW & PROGRESS
// ==========================================

export const getJudgingOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roundId } = req.params;
    const round = await JudgingRound.findById(roundId);
    if (!round) {
      res.status(404).json({ message: "Round not found" });
      return;
    }

    const teams = await JudgingTeam.find({ roundId });
    // Judges are global — fetch all active judges regardless of roundId
    const judges = await Judge.find({ status: "active" }).sort({ tieBreakPriority: 1 });
    const assignments = await JudgeAssignment.find({ roundId });
    const evaluations = await Evaluation.find({ roundId });

    const totalTeams = teams.length;
    const totalJudges = judges.length;

    let expectedEvaluations = 0;
    if (round.evaluationMode === "all") {
      expectedEvaluations = totalTeams * totalJudges;
    } else {
      expectedEvaluations = assignments.length;
    }

    const submittedEvaluations = evaluations.filter((e) => e.status === "SUBMITTED").length;
    const draftEvaluations = evaluations.filter((e) => e.status === "DRAFT").length;
    const pendingEvaluations = Math.max(0, expectedEvaluations - submittedEvaluations);

    const progressPercent = expectedEvaluations > 0
      ? Math.round((submittedEvaluations / expectedEvaluations) * 1000) / 10
      : 0;

    // Judge progress breakdown
    const judgeProgress = judges.map((j) => {
      const jId = j._id.toString();
      let targetTeamsCount = totalTeams;

      if (round.evaluationMode === "assigned") {
        targetTeamsCount = assignments.filter((a) => a.judgeId.toString() === jId).length;
      }

      const submittedCount = evaluations.filter(
        (e) => e.judgeId.toString() === jId && e.status === "SUBMITTED"
      ).length;

      const draftCount = evaluations.filter(
        (e) => e.judgeId.toString() === jId && e.status === "DRAFT"
      ).length;

      return {
        id: j._id,
        name: j.name,
        username: j.username,
        weight: j.weight,
        tieBreakPriority: j.tieBreakPriority,
        assignedCount: targetTeamsCount,
        submittedCount,
        draftCount,
        pendingCount: Math.max(0, targetTeamsCount - submittedCount),
        isComplete: targetTeamsCount > 0 && submittedCount >= targetTeamsCount,
      };
    });

    res.json({
      round: {
        id: round._id,
        name: round.name,
        status: round.status,
        isLocked: round.isLocked,
        evaluationMode: round.evaluationMode,
        allowJudgeEditAfterSubmit: round.allowJudgeEditAfterSubmit,
      },
      stats: {
        totalTeams,
        totalJudges,
        expectedEvaluations,
        submittedEvaluations,
        draftEvaluations,
        pendingEvaluations,
        progressPercent,
      },
      judgeProgress,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch judging overview" });
  }
};

// ==========================================
// 7. RESULTS & RANKINGS TABLE
// ==========================================

export const getJudgingResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roundId } = req.params;
    const round = await JudgingRound.findById(roundId);
    if (!round) {
      res.status(404).json({ message: "Round not found" });
      return;
    }

    const teams = await JudgingTeam.find({ roundId }).sort({ orderIndex: 1 });
    // Judges are global — fetch all judges regardless of roundId
    const judges = await Judge.find({}).sort({ tieBreakPriority: 1 });
    const evaluations = await Evaluation.find({ roundId, status: "SUBMITTED" });
    const criteria = await JudgingCriterion.find({ roundId }).sort({ orderIndex: 1 });

    const totalMaxScore = criteria.reduce((sum, c) => sum + (c.maxScore || 0), 0);

    // Calculate score per team
    const teamResults = teams.map((team) => {
      const tId = team._id.toString();
      const teamEvals = evaluations.filter((e) => e.teamId.toString() === tId);

      const judgeScores: Record<string, { totalScore: number; weight: number }> = {};
      let weightedSum = 0;
      let totalWeight = 0;

      for (const ev of teamEvals) {
        const jId = ev.judgeId.toString();
        const judge = judges.find((j) => j._id.toString() === jId);
        const weight = judge ? judge.weight : 1.0;

        judgeScores[jId] = {
          totalScore: ev.totalScore,
          weight,
        };

        weightedSum += ev.totalScore * weight;
        totalWeight += weight;
      }

      const finalWeightedScore = totalWeight > 0
        ? Math.round((weightedSum / totalWeight) * 100) / 100
        : null;

      return {
        id: team._id,
        _id: team._id,
        teamCode: team.teamCode,
        teamName: team.teamName,
        projectName: team.projectName,
        members: team.members,
        evaluationsCount: teamEvals.length,
        judgeScores,
        finalWeightedScore,
      };
    });

    // Rank sorting with Tie-Break Priority
    teamResults.sort((a, b) => {
      const scoreA = a.finalWeightedScore !== null ? a.finalWeightedScore : -1;
      const scoreB = b.finalWeightedScore !== null ? b.finalWeightedScore : -1;

      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }

      // Tie breaker: compare scores from judges in order of tieBreakPriority (1, 2, 3...)
      for (const judge of judges) {
        const jId = judge._id.toString();
        const scoreJudgeA = a.judgeScores[jId]?.totalScore ?? -1;
        const scoreJudgeB = b.judgeScores[jId]?.totalScore ?? -1;

        if (scoreJudgeB !== scoreJudgeA) {
          return scoreJudgeB - scoreJudgeA;
        }
      }

      return a.teamCode.localeCompare(b.teamCode);
    });

    const rankedTeams = teamResults.map((t, index) => ({
      ...t,
      rank: t.finalWeightedScore !== null ? index + 1 : "-",
    }));

    res.json({
      round: {
        id: round._id,
        name: round.name,
        isLocked: round.isLocked,
        totalMaxScore,
      },
      judges: judges.map((j) => ({
        id: j._id,
        name: j.name,
        username: j.username,
        weight: j.weight,
        tieBreakPriority: j.tieBreakPriority,
      })),
      criteria: criteria.map((c) => ({
        id: c._id,
        name: c.name,
        maxScore: c.maxScore,
      })),
      results: rankedTeams,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch results" });
  }
};

// ==========================================
// 8. TEAM SCORE DETAILS BREAKDOWN
// ==========================================

export const getTeamScoreDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teamId } = req.params;
    const team = await JudgingTeam.findById(teamId);
    if (!team) {
      res.status(404).json({ message: "Team not found" });
      return;
    }

    const round = await JudgingRound.findById(team.roundId);
    const criteria = await JudgingCriterion.find({ roundId: team.roundId }).sort({ orderIndex: 1 });
    // Judges are global — fetch all judges
    const judges = await Judge.find({});
    const evaluations = await Evaluation.find({ teamId, status: "SUBMITTED" });

    // Criteria × Judge matrix
    const matrix = criteria.map((criterion) => {
      const cId = criterion._id.toString();
      const scoresByJudge: Record<string, number> = {};

      for (const ev of evaluations) {
        const jId = ev.judgeId.toString();
        const found = ev.criteriaScores.find((cs) => cs.criterionId.toString() === cId);
        if (found) {
          scoresByJudge[jId] = found.score;
        }
      }

      return {
        criterionId: criterion._id,
        criterionName: criterion.name,
        maxScore: criterion.maxScore,
        scoresByJudge,
      };
    });

    const judgeFeedback = evaluations.map((ev) => {
      const j = judges.find((judge) => judge._id.toString() === ev.judgeId.toString());
      return {
        judgeId: ev.judgeId,
        judgeName: j ? j.name : "Judge",
        totalScore: ev.totalScore,
        weight: j ? j.weight : 1.0,
        comments: ev.comments || "",
        submittedAt: ev.submittedAt,
      };
    });

    res.json({
      team: { ...team.toObject(), id: team._id },
      round: round ? { ...round.toObject(), id: round._id } : null,
      criteria: criteria.map((c) => ({ ...c.toObject(), id: c._id })),
      judges: judges.map((j) => ({
        id: j._id,
        name: j.name,
        username: j.username,
        weight: j.weight,
        tieBreakPriority: j.tieBreakPriority,
      })),
      matrix,
      judgeFeedback,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch team score detail" });
  }
};

// ==========================================
// 9. JUDGE-WISE DETAIL
// ==========================================

export const getJudgeScoreDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { judgeId } = req.params;
    const { roundId } = req.query;

    const judge = await Judge.findById(judgeId).select("-passwordHash");
    if (!judge) {
      res.status(404).json({ message: "Judge not found" });
      return;
    }

    const filter: any = { judgeId };
    if (roundId) filter.roundId = roundId;

    const evaluations = await Evaluation.find(filter);
    const teams = await JudgingTeam.find(roundId ? { roundId } : {});
    const criteria = await JudgingCriterion.find(roundId ? { roundId } : {});

    const teamEvals = teams.map((team) => {
      const ev = evaluations.find((e) => e.teamId.toString() === team._id.toString());
      return {
        team: { ...team.toObject(), id: team._id },
        status: ev ? ev.status : "PENDING",
        totalScore: ev ? ev.totalScore : null,
        comments: ev ? ev.comments : "",
        criteriaScores: ev ? ev.criteriaScores : [],
        submittedAt: ev ? ev.submittedAt : null,
      };
    });

    res.json({
      judge: { ...judge.toObject(), id: judge._id },
      evaluations: teamEvals,
      criteria: criteria.map((c) => ({ ...c.toObject(), id: c._id })),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch judge evaluations" });
  }
};
