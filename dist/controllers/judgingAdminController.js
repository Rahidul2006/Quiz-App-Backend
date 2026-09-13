"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJudgeScoreDetail = exports.getTeamScoreDetail = exports.getJudgingResults = exports.getJudgingOverview = exports.clearAssignments = exports.saveAssignments = exports.getAssignments = exports.deleteCriterion = exports.updateCriterion = exports.createCriterion = exports.getCriteria = exports.deleteTeam = exports.updateTeam = exports.createTeam = exports.importSingleTeam = exports.previewExternalDbTeams = exports.connectExternalDb = exports.setActiveRound = exports.getTeams = exports.deleteJudge = exports.toggleJudgeStatus = exports.regenerateJudgePassword = exports.updateJudge = exports.createJudge = exports.getJudges = exports.deleteRound = exports.toggleLockRound = exports.updateRound = exports.createRound = exports.getRoundById = exports.getRounds = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const JudgingRound_1 = require("../models/JudgingRound");
const Judge_1 = require("../models/Judge");
const JudgingTeam_1 = require("../models/JudgingTeam");
const JudgingCriterion_1 = require("../models/JudgingCriterion");
const JudgeAssignment_1 = require("../models/JudgeAssignment");
const Evaluation_1 = require("../models/Evaluation");
const socketHandler_1 = require("../sockets/socketHandler");
const externalDbService_1 = require("../services/externalDbService");
// ==========================================
// 1. ROUND MANAGEMENT
// ==========================================
const getRounds = async (req, res) => {
    try {
        const rounds = await JudgingRound_1.JudgingRound.find().sort({ createdAt: -1 });
        res.json(rounds.map((r) => ({ ...r.toObject(), id: r._id })));
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch rounds" });
    }
};
exports.getRounds = getRounds;
const getRoundById = async (req, res) => {
    try {
        const { id } = req.params;
        const round = await JudgingRound_1.JudgingRound.findById(id);
        if (!round) {
            res.status(404).json({ message: "Round not found" });
            return;
        }
        res.json({ ...round.toObject(), id: round._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch round" });
    }
};
exports.getRoundById = getRoundById;
const createRound = async (req, res) => {
    try {
        const { name, description, evaluationMode, allowJudgeEditAfterSubmit } = req.body;
        if (!name || !name.trim()) {
            res.status(400).json({ message: "Round name is required" });
            return;
        }
        const round = await JudgingRound_1.JudgingRound.create({
            name: name.trim(),
            description: description ? description.trim() : "",
            evaluationMode: evaluationMode === "assigned" ? "assigned" : "all",
            allowJudgeEditAfterSubmit: Boolean(allowJudgeEditAfterSubmit),
            status: "active",
            isLocked: false,
        });
        res.status(201).json({ ...round.toObject(), id: round._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to create round" });
    }
};
exports.createRound = createRound;
const updateRound = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, evaluationMode, allowJudgeEditAfterSubmit, isLocked, status } = req.body;
        const round = await JudgingRound_1.JudgingRound.findById(id);
        if (!round) {
            res.status(404).json({ message: "Round not found" });
            return;
        }
        if (name !== undefined)
            round.name = name.trim();
        if (description !== undefined)
            round.description = description.trim();
        if (evaluationMode !== undefined)
            round.evaluationMode = evaluationMode;
        if (allowJudgeEditAfterSubmit !== undefined)
            round.allowJudgeEditAfterSubmit = Boolean(allowJudgeEditAfterSubmit);
        if (isLocked !== undefined) {
            round.isLocked = Boolean(isLocked);
            if (round.isLocked)
                round.status = "locked";
            else if (round.status === "locked")
                round.status = "active";
        }
        if (status !== undefined)
            round.status = status;
        await round.save();
        (0, socketHandler_1.emitToJudgingRoom)("judging:round_updated", {
            roundId: round._id.toString(),
            roundName: round.name,
            isLocked: round.isLocked,
            status: round.status,
            evaluationMode: round.evaluationMode,
            allowJudgeEditAfterSubmit: round.allowJudgeEditAfterSubmit,
        });
        if (isLocked !== undefined) {
            (0, socketHandler_1.emitToJudgingRoom)("judging:lock_changed", {
                roundId: round._id.toString(),
                roundName: round.name,
                isLocked: round.isLocked,
                status: round.status,
            });
        }
        res.json({ ...round.toObject(), id: round._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to update round" });
    }
};
exports.updateRound = updateRound;
const toggleLockRound = async (req, res) => {
    try {
        const { id } = req.params;
        const round = await JudgingRound_1.JudgingRound.findById(id);
        if (!round) {
            res.status(404).json({ message: "Round not found" });
            return;
        }
        round.isLocked = !round.isLocked;
        round.status = round.isLocked ? "locked" : "active";
        await round.save();
        (0, socketHandler_1.emitToJudgingRoom)("judging:lock_changed", {
            roundId: round._id.toString(),
            roundName: round.name,
            isLocked: round.isLocked,
            status: round.status,
        });
        (0, socketHandler_1.emitToJudgingRoom)("judging:round_updated", {
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
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to toggle round lock" });
    }
};
exports.toggleLockRound = toggleLockRound;
const deleteRound = async (req, res) => {
    try {
        const { id } = req.params;
        await JudgingRound_1.JudgingRound.findByIdAndDelete(id);
        await JudgingTeam_1.JudgingTeam.deleteMany({ roundId: id });
        await JudgingCriterion_1.JudgingCriterion.deleteMany({ roundId: id });
        await JudgeAssignment_1.JudgeAssignment.deleteMany({ roundId: id });
        await Evaluation_1.Evaluation.deleteMany({ roundId: id });
        res.json({ message: "Judging round and associated entities deleted" });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to delete round" });
    }
};
exports.deleteRound = deleteRound;
// ==========================================
// 2. JUDGE MANAGEMENT
// ==========================================
const getJudges = async (req, res) => {
    try {
        // Judges are global — no round filtering. All judges evaluate the active round.
        const judges = await Judge_1.Judge.find({}).select("-passwordHash").sort({ createdAt: 1 });
        res.json(judges.map((j) => ({ ...j.toObject(), id: j._id })));
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch judges" });
    }
};
exports.getJudges = getJudges;
const createJudge = async (req, res) => {
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
        const existing = await Judge_1.Judge.findOne({ username: cleanUsername });
        if (existing) {
            res.status(409).json({ message: `Username '${cleanUsername}' is already taken.` });
            return;
        }
        const plainPassword = password && password.trim() ? password.trim() : crypto_1.default.randomBytes(4).toString("hex");
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(plainPassword, salt);
        const judge = await Judge_1.Judge.create({
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
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to create judge" });
    }
};
exports.createJudge = createJudge;
const updateJudge = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, weight, tieBreakPriority, status, roundId } = req.body;
        const judge = await Judge_1.Judge.findById(id);
        if (!judge) {
            res.status(404).json({ message: "Judge not found" });
            return;
        }
        if (name !== undefined)
            judge.name = name.trim();
        if (weight !== undefined)
            judge.weight = Math.max(0.1, Number(weight) || 1.0);
        if (tieBreakPriority !== undefined)
            judge.tieBreakPriority = Number(tieBreakPriority) || 1;
        if (status !== undefined)
            judge.status = status === "disabled" ? "disabled" : "active";
        if (roundId !== undefined)
            judge.roundId = roundId;
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
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to update judge" });
    }
};
exports.updateJudge = updateJudge;
const regenerateJudgePassword = async (req, res) => {
    try {
        const { id } = req.params;
        const judge = await Judge_1.Judge.findById(id);
        if (!judge) {
            res.status(404).json({ message: "Judge not found" });
            return;
        }
        const newPlainPassword = crypto_1.default.randomBytes(4).toString("hex") + "!";
        const salt = await bcryptjs_1.default.genSalt(10);
        judge.passwordHash = await bcryptjs_1.default.hash(newPlainPassword, salt);
        await judge.save();
        res.json({
            message: "Password regenerated successfully",
            username: judge.username,
            newPassword: newPlainPassword,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to regenerate password" });
    }
};
exports.regenerateJudgePassword = regenerateJudgePassword;
const toggleJudgeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const judge = await Judge_1.Judge.findById(id);
        if (!judge) {
            res.status(404).json({ message: "Judge not found" });
            return;
        }
        judge.status = judge.status === "active" ? "disabled" : "active";
        await judge.save();
        (0, socketHandler_1.emitToJudgingRoom)("judging:judge_status_changed", {
            judgeId: judge._id.toString(),
            status: judge.status,
        });
        res.json({
            message: `Judge status changed to ${judge.status}`,
            status: judge.status,
            id: judge._id,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to toggle judge status" });
    }
};
exports.toggleJudgeStatus = toggleJudgeStatus;
const deleteJudge = async (req, res) => {
    try {
        const { id } = req.params;
        await Judge_1.Judge.findByIdAndDelete(id);
        await JudgeAssignment_1.JudgeAssignment.deleteMany({ judgeId: id });
        await Evaluation_1.Evaluation.deleteMany({ judgeId: id });
        res.json({ message: "Judge deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to delete judge" });
    }
};
exports.deleteJudge = deleteJudge;
// ==========================================
// 3. TEAM MANAGEMENT
// ==========================================
const getTeams = async (req, res) => {
    try {
        const { roundId } = req.params;
        const teams = await JudgingTeam_1.JudgingTeam.find({ roundId }).sort({ orderIndex: 1, teamCode: 1 });
        res.json(teams.map((t) => ({ ...t.toObject(), id: t._id })));
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch teams" });
    }
};
exports.getTeams = getTeams;
/**
 * Set a round as the active (primary) round.
 * Marks all other rounds as draft status and broadcasts to all judges via Socket.IO.
 */
const setActiveRound = async (req, res) => {
    try {
        const { id } = req.params;
        const round = await JudgingRound_1.JudgingRound.findById(id);
        if (!round) {
            res.status(404).json({ message: "Round not found" });
            return;
        }
        // Before activating requested round, make every other round inactive/draft
        // Ensures database ends with exactly ONE status: "active" round
        await JudgingRound_1.JudgingRound.updateMany({ _id: { $ne: id } }, { status: "draft" });
        // Save requested round as status: "active"
        round.status = "active";
        await round.save();
        // Broadcast exactly one judging:round_switched event
        (0, socketHandler_1.emitToJudgingRoom)("judging:round_switched", {
            roundId: round._id.toString(),
            roundName: round.name,
            isLocked: round.isLocked,
            switchedAt: new Date(),
        });
        res.json({
            message: `Round '${round.name}' is now the active judging round. All judges will be notified.`,
            round: { ...round.toObject(), id: round._id },
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to set active round" });
    }
};
exports.setActiveRound = setActiveRound;
// ==========================================
// 3b. EXTERNAL DB IMPORT (Dynamic — Any MongoDB)
// ==========================================
/**
 * Connect to any external MongoDB URI and list its collections.
 * Body: { uri: string, dbName?: string }
 */
const connectExternalDb = async (req, res) => {
    try {
        const { uri, dbName } = req.body;
        if (!uri || !uri.trim()) {
            res.status(400).json({ message: "MongoDB URI is required" });
            return;
        }
        const { resolvedDbName, collections } = await (0, externalDbService_1.listExternalCollections)(uri.trim(), dbName?.trim() || undefined);
        res.json({
            success: true,
            dbName: resolvedDbName,
            collections,
        });
    }
    catch (error) {
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
exports.connectExternalDb = connectExternalDb;
/**
 * Preview teams from a specific collection in an external MongoDB.
 * Body: { uri, dbName?, collection, teamNameField?, projectField?, membersField? }
 */
const previewExternalDbTeams = async (req, res) => {
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
        const teams = await (0, externalDbService_1.fetchTeamsFromCollection)(uri.trim(), dbName?.trim() || undefined, collection.trim(), {
            teamNameField: teamNameField?.trim() || undefined,
            projectField: projectField?.trim() || undefined,
            membersField: membersField?.trim() || undefined,
            limit: 200,
        });
        res.json({
            success: true,
            count: teams.length,
            teams,
        });
    }
    catch (error) {
        const msg = error.message || "Failed to preview teams from external database";
        if (msg.includes("Database name is required")) {
            res.status(400).json({ message: msg });
            return;
        }
        res.status(500).json({ message: msg });
    }
};
exports.previewExternalDbTeams = previewExternalDbTeams;
/**
 * Import a single team from external data into a round.
 * Body: { teamName, projectName, members, memberDetails?, teamCodePrefix? }
 */
const importSingleTeam = async (req, res) => {
    try {
        const { roundId } = req.params;
        const { teamName, projectName, members, memberDetails, teamCodePrefix } = req.body;
        if (!teamName || !teamName.trim()) {
            res.status(400).json({ message: "teamName is required" });
            return;
        }
        const round = await JudgingRound_1.JudgingRound.findById(roundId);
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
        const team = await (0, externalDbService_1.importSingleTeamToRound)(roundId, teamData, teamCodePrefix?.trim() || "EXT");
        res.status(201).json({ ...team.toObject(), id: team._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to import team" });
    }
};
exports.importSingleTeam = importSingleTeam;
const createTeam = async (req, res) => {
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
        const count = await JudgingTeam_1.JudgingTeam.countDocuments({ roundId });
        const code = teamCode && teamCode.trim() ? teamCode.trim() : `TEAM-${String(count + 1).padStart(3, "0")}`;
        const existing = await JudgingTeam_1.JudgingTeam.findOne({ roundId, teamCode: code });
        if (existing) {
            res.status(409).json({ message: `Team code '${code}' already exists in this round` });
            return;
        }
        const team = await JudgingTeam_1.JudgingTeam.create({
            roundId,
            teamCode: code,
            teamName: teamName.trim(),
            projectName: projectName.trim(),
            members: members ? members.trim() : "",
            orderIndex: count,
        });
        res.status(201).json({ ...team.toObject(), id: team._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to create team" });
    }
};
exports.createTeam = createTeam;
const updateTeam = async (req, res) => {
    try {
        const { id } = req.params;
        const { teamCode, teamName, projectName, members, orderIndex } = req.body;
        const team = await JudgingTeam_1.JudgingTeam.findById(id);
        if (!team) {
            res.status(404).json({ message: "Team not found" });
            return;
        }
        if (teamCode !== undefined)
            team.teamCode = teamCode.trim();
        if (teamName !== undefined)
            team.teamName = teamName.trim();
        if (projectName !== undefined)
            team.projectName = projectName.trim();
        if (members !== undefined)
            team.members = members.trim();
        if (orderIndex !== undefined)
            team.orderIndex = Number(orderIndex);
        await team.save();
        res.json({ ...team.toObject(), id: team._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to update team" });
    }
};
exports.updateTeam = updateTeam;
const deleteTeam = async (req, res) => {
    try {
        const { id } = req.params;
        await JudgingTeam_1.JudgingTeam.findByIdAndDelete(id);
        await JudgeAssignment_1.JudgeAssignment.deleteMany({ teamId: id });
        await Evaluation_1.Evaluation.deleteMany({ teamId: id });
        res.json({ message: "Team and related assignments deleted" });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to delete team" });
    }
};
exports.deleteTeam = deleteTeam;
// ==========================================
// 4. CRITERIA MANAGEMENT
// ==========================================
const getCriteria = async (req, res) => {
    try {
        const { roundId } = req.params;
        const criteria = await JudgingCriterion_1.JudgingCriterion.find({ roundId }).sort({ orderIndex: 1 });
        res.json(criteria.map((c) => ({ ...c.toObject(), id: c._id })));
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch criteria" });
    }
};
exports.getCriteria = getCriteria;
const createCriterion = async (req, res) => {
    try {
        const { roundId } = req.params;
        const { name, maxScore, description } = req.body;
        if (!name || !name.trim()) {
            res.status(400).json({ message: "Criterion name is required" });
            return;
        }
        const count = await JudgingCriterion_1.JudgingCriterion.countDocuments({ roundId });
        const criterion = await JudgingCriterion_1.JudgingCriterion.create({
            roundId,
            name: name.trim(),
            maxScore: Math.max(1, Number(maxScore) || 20),
            description: description ? description.trim() : "",
            orderIndex: count,
        });
        (0, socketHandler_1.emitToJudgingRoom)("judging:criteria_updated", { roundId });
        res.status(201).json({ ...criterion.toObject(), id: criterion._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to create criterion" });
    }
};
exports.createCriterion = createCriterion;
const updateCriterion = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, maxScore, description, orderIndex } = req.body;
        const criterion = await JudgingCriterion_1.JudgingCriterion.findById(id);
        if (!criterion) {
            res.status(404).json({ message: "Criterion not found" });
            return;
        }
        if (name !== undefined)
            criterion.name = name.trim();
        if (maxScore !== undefined)
            criterion.maxScore = Math.max(1, Number(maxScore) || 20);
        if (description !== undefined)
            criterion.description = description.trim();
        if (orderIndex !== undefined)
            criterion.orderIndex = Number(orderIndex);
        await criterion.save();
        (0, socketHandler_1.emitToJudgingRoom)("judging:criteria_updated", { roundId: criterion.roundId.toString() });
        res.json({ ...criterion.toObject(), id: criterion._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to update criterion" });
    }
};
exports.updateCriterion = updateCriterion;
const deleteCriterion = async (req, res) => {
    try {
        const { id } = req.params;
        const criterion = await JudgingCriterion_1.JudgingCriterion.findById(id);
        const roundId = criterion ? criterion.roundId.toString() : null;
        await JudgingCriterion_1.JudgingCriterion.findByIdAndDelete(id);
        if (roundId) {
            (0, socketHandler_1.emitToJudgingRoom)("judging:criteria_updated", { roundId });
        }
        res.json({ message: "Criterion deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to delete criterion" });
    }
};
exports.deleteCriterion = deleteCriterion;
// ==========================================
// 5. ASSIGNMENTS MANAGEMENT
// ==========================================
const getAssignments = async (req, res) => {
    try {
        const { roundId } = req.params;
        const assignments = await JudgeAssignment_1.JudgeAssignment.find({ roundId });
        res.json(assignments.map((a) => ({ ...a.toObject(), id: a._id })));
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch assignments" });
    }
};
exports.getAssignments = getAssignments;
const saveAssignments = async (req, res) => {
    try {
        const { roundId } = req.params;
        const { assignments } = req.body; // Array of { judgeId, teamId }
        if (!Array.isArray(assignments)) {
            res.status(400).json({ message: "Assignments array is required" });
            return;
        }
        // Replace existing assignments for this round
        await JudgeAssignment_1.JudgeAssignment.deleteMany({ roundId });
        if (assignments.length > 0) {
            const docs = assignments.map((a) => ({
                roundId,
                judgeId: a.judgeId,
                teamId: a.teamId,
            }));
            await JudgeAssignment_1.JudgeAssignment.create(docs);
        }
        (0, socketHandler_1.emitToJudgingRoom)("judging:assignments_updated", { roundId });
        const updated = await JudgeAssignment_1.JudgeAssignment.find({ roundId });
        res.json({
            message: "Assignments updated successfully",
            assignments: updated.map((a) => ({ ...a.toObject(), id: a._id })),
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to save assignments" });
    }
};
exports.saveAssignments = saveAssignments;
const clearAssignments = async (req, res) => {
    try {
        const { roundId } = req.params;
        await JudgeAssignment_1.JudgeAssignment.deleteMany({ roundId });
        (0, socketHandler_1.emitToJudgingRoom)("judging:assignments_updated", { roundId });
        res.json({ message: "Assignments cleared successfully" });
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to delete assignments" });
    }
};
exports.clearAssignments = clearAssignments;
// ==========================================
// 6. LIVE OVERVIEW & PROGRESS
// ==========================================
const getJudgingOverview = async (req, res) => {
    try {
        const { roundId } = req.params;
        const round = await JudgingRound_1.JudgingRound.findById(roundId);
        if (!round) {
            res.status(404).json({ message: "Round not found" });
            return;
        }
        const teams = await JudgingTeam_1.JudgingTeam.find({ roundId });
        // Judges are global — fetch all active judges regardless of roundId
        const judges = await Judge_1.Judge.find({ status: "active" }).sort({ tieBreakPriority: 1 });
        const assignments = await JudgeAssignment_1.JudgeAssignment.find({ roundId });
        const evaluations = await Evaluation_1.Evaluation.find({ roundId });
        const totalTeams = teams.length;
        const totalJudges = judges.length;
        let expectedEvaluations = 0;
        if (round.evaluationMode === "all") {
            expectedEvaluations = totalTeams * totalJudges;
        }
        else {
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
            const submittedCount = evaluations.filter((e) => e.judgeId.toString() === jId && e.status === "SUBMITTED").length;
            const draftCount = evaluations.filter((e) => e.judgeId.toString() === jId && e.status === "DRAFT").length;
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
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch judging overview" });
    }
};
exports.getJudgingOverview = getJudgingOverview;
// ==========================================
// 7. RESULTS & RANKINGS TABLE
// ==========================================
const getJudgingResults = async (req, res) => {
    try {
        const { roundId } = req.params;
        const round = await JudgingRound_1.JudgingRound.findById(roundId);
        if (!round) {
            res.status(404).json({ message: "Round not found" });
            return;
        }
        const teams = await JudgingTeam_1.JudgingTeam.find({ roundId }).sort({ orderIndex: 1 });
        // Judges are global — fetch all judges regardless of roundId
        const judges = await Judge_1.Judge.find({}).sort({ tieBreakPriority: 1 });
        const evaluations = await Evaluation_1.Evaluation.find({ roundId, status: "SUBMITTED" });
        const criteria = await JudgingCriterion_1.JudgingCriterion.find({ roundId }).sort({ orderIndex: 1 });
        const totalMaxScore = criteria.reduce((sum, c) => sum + (c.maxScore || 0), 0);
        // Calculate score per team
        const teamResults = teams.map((team) => {
            const tId = team._id.toString();
            const teamEvals = evaluations.filter((e) => e.teamId.toString() === tId);
            const judgeScores = {};
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
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch results" });
    }
};
exports.getJudgingResults = getJudgingResults;
// ==========================================
// 8. TEAM SCORE DETAILS BREAKDOWN
// ==========================================
const getTeamScoreDetail = async (req, res) => {
    try {
        const { teamId } = req.params;
        const team = await JudgingTeam_1.JudgingTeam.findById(teamId);
        if (!team) {
            res.status(404).json({ message: "Team not found" });
            return;
        }
        const round = await JudgingRound_1.JudgingRound.findById(team.roundId);
        const criteria = await JudgingCriterion_1.JudgingCriterion.find({ roundId: team.roundId }).sort({ orderIndex: 1 });
        // Judges are global — fetch all judges
        const judges = await Judge_1.Judge.find({});
        const evaluations = await Evaluation_1.Evaluation.find({ teamId, status: "SUBMITTED" });
        // Criteria × Judge matrix
        const matrix = criteria.map((criterion) => {
            const cId = criterion._id.toString();
            const scoresByJudge = {};
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
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch team score detail" });
    }
};
exports.getTeamScoreDetail = getTeamScoreDetail;
// ==========================================
// 9. JUDGE-WISE DETAIL
// ==========================================
const getJudgeScoreDetail = async (req, res) => {
    try {
        const { judgeId } = req.params;
        const { roundId } = req.query;
        const judge = await Judge_1.Judge.findById(judgeId).select("-passwordHash");
        if (!judge) {
            res.status(404).json({ message: "Judge not found" });
            return;
        }
        const filter = { judgeId };
        if (roundId)
            filter.roundId = roundId;
        const evaluations = await Evaluation_1.Evaluation.find(filter);
        const teams = await JudgingTeam_1.JudgingTeam.find(roundId ? { roundId } : {});
        const criteria = await JudgingCriterion_1.JudgingCriterion.find(roundId ? { roundId } : {});
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
    }
    catch (error) {
        res.status(500).json({ message: error.message || "Failed to fetch judge evaluations" });
    }
};
exports.getJudgeScoreDetail = getJudgeScoreDetail;
