import { Router } from "express";
import { requireAdmin } from "../middleware/authMiddleware";
import {
  getRounds,
  getRoundById,
  createRound,
  updateRound,
  toggleLockRound,
  deleteRound,
  getJudges,
  createJudge,
  updateJudge,
  regenerateJudgePassword,
  toggleJudgeStatus,
  deleteJudge,
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  getCriteria,
  createCriterion,
  updateCriterion,
  deleteCriterion,
  getAssignments,
  saveAssignments,
  clearAssignments,
  getJudgingOverview,
  getJudgingResults,
  getTeamScoreDetail,
  getJudgeScoreDetail,
  getCodecraftLiveTeams,
  syncCodecraftTeams,
} from "../controllers/judgingAdminController";

const router = Router();

// Apply requireAdmin to all judging admin routes
router.use(requireAdmin);

// Rounds
router.get("/rounds", getRounds);
router.post("/rounds", createRound);
router.get("/rounds/:id", getRoundById);
router.patch("/rounds/:id", updateRound);
router.put("/rounds/:id", updateRound);
router.post("/rounds/:id/toggle-lock", toggleLockRound);
router.delete("/rounds/:id", deleteRound);

// Judges
router.get("/judges", getJudges);
router.post("/judges", createJudge);
router.patch("/judges/:id", updateJudge);
router.put("/judges/:id", updateJudge);
router.post("/judges/:id/regenerate-password", regenerateJudgePassword);
router.post("/judges/:id/toggle-status", toggleJudgeStatus);
router.delete("/judges/:id", deleteJudge);

// Teams (scoped by round)
router.get("/codecraft-teams", getCodecraftLiveTeams);
router.post("/rounds/:roundId/sync-codecraft-teams", syncCodecraftTeams);
router.get("/rounds/:roundId/teams", getTeams);
router.post("/rounds/:roundId/teams", createTeam);
router.patch("/teams/:id", updateTeam);
router.put("/teams/:id", updateTeam);
router.delete("/teams/:id", deleteTeam);

// Criteria (scoped by round)
router.get("/rounds/:roundId/criteria", getCriteria);
router.post("/rounds/:roundId/criteria", createCriterion);
router.patch("/criteria/:id", updateCriterion);
router.put("/criteria/:id", updateCriterion);
router.delete("/criteria/:id", deleteCriterion);

// Assignments (scoped by round)
router.get("/rounds/:roundId/assignments", getAssignments);
router.post("/rounds/:roundId/assignments", saveAssignments);
router.delete("/rounds/:roundId/assignments", clearAssignments);

// Analytics & Results
router.get("/rounds/:roundId/overview", getJudgingOverview);
router.get("/rounds/:roundId/results", getJudgingResults);
router.get("/teams/:teamId/details", getTeamScoreDetail);
router.get("/judges/:judgeId/details", getJudgeScoreDetail);

export default router;
