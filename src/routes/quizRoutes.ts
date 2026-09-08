import { Router } from "express";
import {
  answerQuizQuestion,
  advanceQuizQuestion,
  finishQuiz,
  getLeaderboard,
} from "../controllers/quizController";

const router = Router();

router.post("/:id/answer", answerQuizQuestion);
router.post("/:id/advance", advanceQuizQuestion);
router.post("/:id/finish", finishQuiz);
router.get("/:id/leaderboard", getLeaderboard);

export default router;
