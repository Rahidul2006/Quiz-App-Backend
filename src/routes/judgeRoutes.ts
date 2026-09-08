import { Router } from "express";
import { judgeLogin, getJudgeMe } from "../controllers/judgeAuthController";
import {
  getAssignedTeams,
  getTeamForEvaluation,
  saveDraftEvaluation,
  submitEvaluation,
} from "../controllers/judgePortalController";
import { requireJudge } from "../middleware/judgeAuthMiddleware";

const router = Router();

// Public judge login
router.post("/login", judgeLogin);

// Protected judge portal endpoints
router.get("/me", requireJudge, getJudgeMe);
router.get("/assigned-teams", requireJudge, getAssignedTeams);
router.get("/teams/:teamId/evaluate", requireJudge, getTeamForEvaluation);
router.post("/teams/:teamId/draft", requireJudge, saveDraftEvaluation);
router.post("/teams/:teamId/submit", requireJudge, submitEvaluation);

export default router;
