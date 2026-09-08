"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const judgeAuthController_1 = require("../controllers/judgeAuthController");
const judgePortalController_1 = require("../controllers/judgePortalController");
const judgeAuthMiddleware_1 = require("../middleware/judgeAuthMiddleware");
const router = (0, express_1.Router)();
// Public judge login
router.post("/login", judgeAuthController_1.judgeLogin);
// Protected judge portal endpoints
router.get("/me", judgeAuthMiddleware_1.requireJudge, judgeAuthController_1.getJudgeMe);
router.get("/assigned-teams", judgeAuthMiddleware_1.requireJudge, judgePortalController_1.getAssignedTeams);
router.get("/teams/:teamId/evaluate", judgeAuthMiddleware_1.requireJudge, judgePortalController_1.getTeamForEvaluation);
router.post("/teams/:teamId/draft", judgeAuthMiddleware_1.requireJudge, judgePortalController_1.saveDraftEvaluation);
router.put("/teams/:teamId/draft", judgeAuthMiddleware_1.requireJudge, judgePortalController_1.saveDraftEvaluation);
router.patch("/teams/:teamId/draft", judgeAuthMiddleware_1.requireJudge, judgePortalController_1.saveDraftEvaluation);
router.post("/teams/:teamId/submit", judgeAuthMiddleware_1.requireJudge, judgePortalController_1.submitEvaluation);
exports.default = router;
