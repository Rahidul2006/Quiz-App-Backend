import { Router } from "express";
import { requireAdmin } from "../middleware/authMiddleware";
import {
  getRounds,
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
  getJudgingOverview,
  getJudgingResults,
  getTeamScoreDetail,
  getJudgeScoreDetail,
} from "../controllers/judgingAdminController";

const router = Router();

// Apply requireAdmin to all judging admin routes
router.use(requireAdmin);

// Rounds
router.get("/rounds", getRounds);
router.post("/rounds", createRound);
router.patch("/rounds/:id", updateRound);
router.post("/rounds/:id/toggle-lock", toggleLockRound);
router.delete("/rounds/:id", deleteRound);

// Judges
router.get("/judges", getJudges);
router.post("/judges", createJudge);
router.patch("/judges/:id", updateJudge);
router.post("/judges/:id/regenerate-password", regenerateJudgePassword);
router.post("/judges/:id/toggle-status", toggleJudgeStatus);
router.delete("/judges/:id", deleteJudge);

// Teams (scoped by round)
router.get("/rounds/:roundId/teams", getTeams);
router.post("/rounds/:roundId/teams", createTeam);
router.patch("/teams/:id", updateTeam);
router.delete("/teams/:id", deleteTeam);

// Criteria (scoped by round)
router.get("/rounds/:roundId/criteria", getCriteria);
router.post("/rounds/:roundId/criteria", createCriterion);
router.patch("/criteria/:id", updateCriterion);
router.delete("/criteria/:id", deleteCriterion);

// Assignments (scoped by round)
router.get("/rounds/:roundId/assignments", getAssignments);
router.post("/rounds/:roundId/assignments", saveAssignments);

// Analytics & Results
router.get("/rounds/:roundId/overview", getJudgingOverview);
router.get("/rounds/:roundId/results", getJudgingResults);
router.get("/teams/:teamId/details", getTeamScoreDetail);
router.get("/judges/:judgeId/details", getJudgeScoreDetail);

export default router;
