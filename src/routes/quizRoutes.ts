import { Router } from "express";
import {
  answerQuizQuestion,
  advanceQuizQuestion,
  finishQuiz,
  getLeaderboard,
} from "../controllers/quizController";
import {
  getQuizSlots,
  claimQuizSlot,
  clearQuizSlots,
  getMySlot,
} from "../controllers/quizSlotController";
import { requireAdmin } from "../middleware/authMiddleware";

const router = Router();

router.post("/:id/answer", answerQuizQuestion);
router.post("/:id/advance", requireAdmin, advanceQuizQuestion);
router.post("/:id/finish", requireAdmin, finishQuiz);
router.get("/:id/leaderboard", getLeaderboard);

// Quiz slot routes
router.get("/:id/quiz-slots", getQuizSlots);
router.get("/:id/quiz-slots/my-slot", getMySlot);
router.post("/:id/quiz-slots/claim", claimQuizSlot);
router.delete("/:id/quiz-slots", requireAdmin, clearQuizSlots);

export default router;

