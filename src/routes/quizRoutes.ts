import { Router } from "express";
import {
  answerQuizQuestion,
  advanceQuizQuestion,
  switchQuizQuestion,
  startQuizTimer,
  pauseQuizTimer,
  resumeQuizTimer,
  resetQuizTimer,
  addQuizTime,
  showQuizLeaderboard,
  revealQuizAnswer,
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
router.post("/:id/reveal", requireAdmin, revealQuizAnswer);
router.post("/:id/advance", requireAdmin, advanceQuizQuestion);
router.post("/:id/switch-question", requireAdmin, switchQuizQuestion);
router.post("/:id/start-timer", requireAdmin, startQuizTimer);
router.post("/:id/pause-timer", requireAdmin, pauseQuizTimer);
router.post("/:id/resume-timer", requireAdmin, resumeQuizTimer);
router.post("/:id/reset-timer", requireAdmin, resetQuizTimer);
router.post("/:id/add-time", requireAdmin, addQuizTime);
router.post("/:id/show-leaderboard", requireAdmin, showQuizLeaderboard);
router.post("/:id/finish", requireAdmin, finishQuiz);
router.get("/:id/leaderboard", getLeaderboard);

// Quiz slot routes
router.get("/:id/quiz-slots", getQuizSlots);
router.get("/:id/quiz-slots/my-slot", getMySlot);
router.post("/:id/quiz-slots/claim", claimQuizSlot);
router.delete("/:id/quiz-slots", requireAdmin, clearQuizSlots);

export default router;

