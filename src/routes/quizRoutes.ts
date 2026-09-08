import { Router } from "express";
import {
  answerQuizQuestion,
  advanceQuizQuestion,
  finishQuiz,
  getLeaderboard,
} from "../controllers/quizController";
import { requireAdmin } from "../middleware/authMiddleware";

const router = Router();

router.post("/:id/answer", answerQuizQuestion);
router.post("/:id/advance", requireAdmin, advanceQuizQuestion);
router.post("/:id/finish", requireAdmin, finishQuiz);
router.get("/:id/leaderboard", getLeaderboard);

export default router;

