"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const judgingAdminController_1 = require("../controllers/judgingAdminController");
const router = (0, express_1.Router)();
// Apply requireAdmin to all judging admin routes
router.use(authMiddleware_1.requireAdmin);
// Rounds
router.get("/rounds", judgingAdminController_1.getRounds);
router.post("/rounds", judgingAdminController_1.createRound);
router.get("/rounds/:id", judgingAdminController_1.getRoundById);
router.patch("/rounds/:id", judgingAdminController_1.updateRound);
router.put("/rounds/:id", judgingAdminController_1.updateRound);
router.post("/rounds/:id/toggle-lock", judgingAdminController_1.toggleLockRound);
router.post("/rounds/:id/set-active", judgingAdminController_1.setActiveRound);
router.delete("/rounds/:id", judgingAdminController_1.deleteRound);
// Judges (global — not per-round)
router.get("/judges", judgingAdminController_1.getJudges);
router.post("/judges", judgingAdminController_1.createJudge);
router.patch("/judges/:id", judgingAdminController_1.updateJudge);
router.put("/judges/:id", judgingAdminController_1.updateJudge);
router.post("/judges/:id/regenerate-password", judgingAdminController_1.regenerateJudgePassword);
router.post("/judges/:id/toggle-status", judgingAdminController_1.toggleJudgeStatus);
router.delete("/judges/:id", judgingAdminController_1.deleteJudge);
// Teams (scoped by round)
router.get("/rounds/:roundId/teams", judgingAdminController_1.getTeams);
router.post("/rounds/:roundId/teams", judgingAdminController_1.createTeam);
router.post("/rounds/:roundId/teams/import-one", judgingAdminController_1.importSingleTeam);
router.patch("/teams/:id", judgingAdminController_1.updateTeam);
router.put("/teams/:id", judgingAdminController_1.updateTeam);
router.delete("/teams/:id", judgingAdminController_1.deleteTeam);
// External DB Import (admin-provided any MongoDB URI)
router.post("/external-db/connect", judgingAdminController_1.connectExternalDb);
router.post("/external-db/preview", judgingAdminController_1.previewExternalDbTeams);
// Criteria (scoped by round)
router.get("/rounds/:roundId/criteria", judgingAdminController_1.getCriteria);
router.post("/rounds/:roundId/criteria", judgingAdminController_1.createCriterion);
router.patch("/criteria/:id", judgingAdminController_1.updateCriterion);
router.put("/criteria/:id", judgingAdminController_1.updateCriterion);
router.delete("/criteria/:id", judgingAdminController_1.deleteCriterion);
// Assignments (scoped by round)
router.get("/rounds/:roundId/assignments", judgingAdminController_1.getAssignments);
router.post("/rounds/:roundId/assignments", judgingAdminController_1.saveAssignments);
router.delete("/rounds/:roundId/assignments", judgingAdminController_1.clearAssignments);
// Analytics & Results
router.get("/rounds/:roundId/overview", judgingAdminController_1.getJudgingOverview);
router.get("/rounds/:roundId/results", judgingAdminController_1.getJudgingResults);
router.get("/teams/:teamId/details", judgingAdminController_1.getTeamScoreDetail);
router.get("/judges/:judgeId/details", judgingAdminController_1.getJudgeScoreDetail);
exports.default = router;
