"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const quizController_1 = require("../controllers/quizController");
const quizSlotController_1 = require("../controllers/quizSlotController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.post("/:id/answer", quizController_1.answerQuizQuestion);
router.post("/:id/reveal", authMiddleware_1.requireAdmin, quizController_1.revealQuizAnswer);
router.post("/:id/advance", authMiddleware_1.requireAdmin, quizController_1.advanceQuizQuestion);
router.post("/:id/finish", authMiddleware_1.requireAdmin, quizController_1.finishQuiz);
router.get("/:id/leaderboard", quizController_1.getLeaderboard);
// Quiz slot routes
router.get("/:id/quiz-slots", quizSlotController_1.getQuizSlots);
router.get("/:id/quiz-slots/my-slot", quizSlotController_1.getMySlot);
router.post("/:id/quiz-slots/claim", quizSlotController_1.claimQuizSlot);
router.delete("/:id/quiz-slots", authMiddleware_1.requireAdmin, quizSlotController_1.clearQuizSlots);
exports.default = router;
