"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeaderboard = exports.finishQuiz = exports.revealQuizAnswer = exports.showQuizLeaderboard = exports.addQuizTime = exports.resetQuizTimer = exports.resumeQuizTimer = exports.pauseQuizTimer = exports.startQuizTimer = exports.advanceQuizQuestion = exports.switchQuizQuestion = exports.answerQuizQuestion = void 0;
exports.finalizeQuiz = finalizeQuiz;
const Activity_1 = require("../models/Activity");
const QuizResponse_1 = require("../models/QuizResponse");
const Participant_1 = require("../models/Participant");
const Event_1 = require("../models/Event");
const socketHandler_1 = require("../sockets/socketHandler");
const quizScoringService_1 = require("../services/quizScoringService");
// ─── Internal quiz finalization helper ───────────────────────────────────────
// Used by: manual finishQuiz, auto-expiry ticker, manual stopActivity (quiz)
async function finalizeQuiz(activity) {
    const now = new Date();
    activity.status = "ENDED";
    activity.stoppedAt = now;
    activity.settings = { ...activity.settings, quiz_state: "leaderboard" };
    await activity.save();
    await Event_1.Event.findByIdAndUpdate(activity.eventId, { activeActivityId: null });
    const leaderboard = await (0, quizScoringService_1.buildLeaderboard)(activity._id.toString(), activity.eventId.toString());
    (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:finished", {
        activityId: activity._id,
        leaderboard,
    });
    (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:leaderboard_updated", {
        activityId: activity._id,
        leaderboard,
    });
    (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "activity:closed", {
        activityId: activity._id.toString(),
        status: "ENDED",
        stoppedAt: now,
        reason: "quiz_finalized",
        serverTime: now,
    });
    return leaderboard;
}
// ─── POST /quizzes/:id/answer ─────────────────────────────────────────────────
const answerQuizQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        // Client-provided timeTakenMs is intentionally IGNORED — server calculates it
        const { questionId, optionId, participantId, participantName } = req.body;
        if (!questionId || !optionId || !participantId) {
            res.status(400).json({ message: "questionId, optionId, and participantId are required" });
            return;
        }
        // 1. Activity exists
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        // 2. Activity type = quiz
        if (activity.type !== "quiz") {
            res.status(404).json({ message: "Activity is not a quiz" });
            return;
        }
        // 3. Activity status = LIVE
        const isLive = activity.status === "LIVE" ||
            activity.status === "live" ||
            activity.status === "active";
        if (!isLive) {
            if (activity.status === "ENDED" ||
                activity.status === "ended") {
                res.status(409).json({ message: "Quiz has ended." });
            }
            else if (activity.status === "PAUSED" ||
                activity.status === "paused") {
                res.status(400).json({ message: "Quiz activity is currently paused by organizer" });
            }
            else {
                res.status(400).json({ message: "Quiz activity is not currently active" });
            }
            return;
        }
        // 4. Quiz state = answering (not leaderboard)
        const quizState = activity.settings?.quiz_state;
        if (quizState === "leaderboard") {
            res.status(409).json({ message: "Quiz has ended." });
            return;
        }
        // 5. Question exists
        const question = (activity.questions || []).find((q) => q._id?.toString() === questionId || q.id === questionId);
        if (!question) {
            res.status(404).json({ message: "Quiz question not found" });
            return;
        }
        // 6. Submitted questionId matches currently active question
        const activeIdx = activity.activeQuestionIndex ?? 0;
        const activeQuestion = (activity.questions || [])[activeIdx];
        const activeQId = activeQuestion?._id?.toString() || activeQuestion?.id;
        if (!activeQuestion || activeQId !== questionId) {
            res.status(409).json({ message: "This question is no longer active." });
            return;
        }
        // 6.5. Question timer must be actively running (not in ready, paused, or revealed state)
        const currentQuizState = activity.settings?.quiz_state;
        if (currentQuizState === "ready" || !activity.quizQuestionStartedAt || !activity.quizQuestionEndsAt) {
            res.status(400).json({ message: "The host has not started the timer for this question yet." });
            return;
        }
        if (currentQuizState === "paused") {
            res.status(400).json({ message: "Question timer is currently paused by the organizer." });
            return;
        }
        if (currentQuizState === "revealed") {
            res.status(409).json({ message: "The answer has already been revealed for this question." });
            return;
        }
        const now = new Date();
        // 7. Server time has not passed the question deadline
        if (activity.quizQuestionEndsAt) {
            const questionDeadline = new Date(activity.quizQuestionEndsAt);
            if (now > questionDeadline) {
                res.status(409).json({ message: "Question time has expired." });
                return;
            }
        }
        // 8. Server time has not passed the activity endsAt (if explicitly set)
        if (activity.endsAt) {
            const activityDeadline = new Date(activity.endsAt);
            if (now > activityDeadline) {
                res.status(409).json({ message: "Quiz has ended." });
                return;
            }
        }
        // 9. Participant belongs to the Event (best-effort check)
        const allParticipants = await Participant_1.Participant.find({ eventId: activity.eventId });
        const participantBelongs = allParticipants.some((p) => p._id.toString() === participantId ||
            p.id === participantId ||
            p.sessionToken === participantId);
        if (!participantBelongs) {
            // Warn but allow — in-memory stores may not populate correctly
            console.warn(`[Quiz] Participant ${participantId} not found in event ${activity.eventId} — allowing submission`);
        }
        // 10. Participant has not already submitted this question
        const existingResponse = await QuizResponse_1.QuizResponse.findOne({ questionId, participantId });
        if (existingResponse) {
            res.status(409).json({ message: "You have already answered this question." });
            return;
        }
        // ── Server-side timing (authoritative) ──
        const submissionTime = now;
        const questionStartedAt = activity.quizQuestionStartedAt
            ? new Date(activity.quizQuestionStartedAt)
            : submissionTime;
        const timeTakenMs = Math.max(0, submissionTime.getTime() - questionStartedAt.getTime());
        // ── Server-side scoring (never trust client isCorrect or timeTakenMs) ──
        const selectedOpt = (question.options || []).find((o) => o._id?.toString() === optionId || o.id === optionId);
        const isCorrect = Boolean(selectedOpt?.is_correct);
        let scoreAwarded = 0;
        if (isCorrect) {
            scoreAwarded = (0, quizScoringService_1.calculateQuizScore)(question.points || 1000, question.time_limit_sec || 15, timeTakenMs);
        }
        // ── Save response ──
        const response = await QuizResponse_1.QuizResponse.create({
            activityId: activity._id,
            questionId,
            optionId,
            participantId,
            participantName: participantName || "Participant",
            isCorrect,
            timeTakenMs,
            scoreAwarded,
        });
        // ── Build updated live leaderboard ──
        const leaderboard = await (0, quizScoringService_1.buildLeaderboard)(activity._id.toString(), activity.eventId.toString());
        // ── Emit realtime events ──
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:answer_submitted", {
            activityId: activity._id,
            questionId,
            participantId,
        });
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:leaderboard_updated", {
            activityId: activity._id,
            leaderboard,
        });
        res.json({
            success: true,
            isCorrect,
            timeTakenMs,
            scoreAwarded,
            responseId: response._id,
        });
    }
    catch (error) {
        // Duplicate key error = already answered (unique index safety net)
        if (error.code === 11000) {
            res.status(409).json({ message: "You have already answered this question." });
            return;
        }
        res.status(500).json({ message: error.message });
    }
};
exports.answerQuizQuestion = answerQuizQuestion;
// ─── POST /quizzes/:id/switch-question & /quizzes/:id/advance ─────────────────
const switchQuizQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const { questionIndex, autoStartTimer } = req.body;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        const totalQuestions = (activity.questions || []).length;
        const requestedIndex = Number(questionIndex);
        const newIndex = Math.max(0, Math.min(isNaN(requestedIndex) ? 0 : requestedIndex, Math.max(0, totalQuestions - 1)));
        const question = (activity.questions || [])[newIndex];
        let questionStartedAt = null;
        let questionEndsAt = null;
        let quizState = "ready";
        if (autoStartTimer) {
            questionStartedAt = new Date();
            const timeLimitSec = question?.time_limit_sec || 15;
            questionEndsAt = new Date(questionStartedAt.getTime() + timeLimitSec * 1000);
            quizState = "answering";
        }
        activity.activeQuestionIndex = newIndex;
        activity.settings = { ...activity.settings, quiz_state: quizState, quizQuestionRemainingSeconds: null };
        activity.quizQuestionStartedAt = questionStartedAt;
        activity.quizQuestionEndsAt = questionEndsAt;
        await activity.save();
        const payload = {
            activityId: activity._id,
            questionIndex: newIndex,
            question,
            quizState,
            questionStartedAt,
            questionEndsAt,
            serverTime: new Date(),
        };
        // Emit with authoritative server timestamps
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:question_changed", payload);
        res.json({
            success: true,
            activeQuestionIndex: newIndex,
            quizState,
            questionStartedAt,
            questionEndsAt,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.switchQuizQuestion = switchQuizQuestion;
exports.advanceQuizQuestion = exports.switchQuizQuestion;
// ─── POST /quizzes/:id/start-timer ───────────────────────────────────────────
const startQuizTimer = async (req, res) => {
    try {
        const { id } = req.params;
        const { durationSeconds } = req.body;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        const activeIdx = activity.activeQuestionIndex ?? 0;
        const question = (activity.questions || [])[activeIdx];
        if (!question) {
            res.status(404).json({ message: "Active quiz question not found" });
            return;
        }
        const timeLimitSec = Math.max(5, Number(durationSeconds) || question?.time_limit_sec || 15);
        const questionStartedAt = new Date();
        const questionEndsAt = new Date(questionStartedAt.getTime() + timeLimitSec * 1000);
        activity.settings = { ...activity.settings, quiz_state: "answering", quizQuestionRemainingSeconds: null };
        activity.quizQuestionStartedAt = questionStartedAt;
        activity.quizQuestionEndsAt = questionEndsAt;
        await activity.save();
        const payload = {
            activityId: activity._id,
            questionIndex: activeIdx,
            question,
            quizState: "answering",
            questionStartedAt,
            questionEndsAt,
            durationSeconds: timeLimitSec,
            serverTime: questionStartedAt,
        };
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:timer_started", payload);
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:question_changed", payload);
        res.json({
            success: true,
            ...payload,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.startQuizTimer = startQuizTimer;
// ─── POST /quizzes/:id/pause-timer ───────────────────────────────────────────
const pauseQuizTimer = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        const now = new Date();
        let remaining = 15;
        if (activity.quizQuestionEndsAt) {
            remaining = Math.max(1, Math.ceil((new Date(activity.quizQuestionEndsAt).getTime() - now.getTime()) / 1000));
        }
        else {
            const q = (activity.questions || [])[activity.activeQuestionIndex || 0];
            remaining = q?.time_limit_sec || 15;
        }
        activity.settings = { ...activity.settings, quiz_state: "paused", quizQuestionRemainingSeconds: remaining };
        activity.quizQuestionEndsAt = null;
        await activity.save();
        const payload = {
            activityId: activity._id,
            questionIndex: activity.activeQuestionIndex ?? 0,
            quizState: "paused",
            remainingSeconds: remaining,
            serverTime: now,
        };
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:timer_paused", payload);
        res.json({ success: true, ...payload });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.pauseQuizTimer = pauseQuizTimer;
// ─── POST /quizzes/:id/resume-timer ──────────────────────────────────────────
const resumeQuizTimer = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        const now = new Date();
        const remaining = Number(activity.settings?.quizQuestionRemainingSeconds) || 10;
        const questionStartedAt = new Date(now.getTime() - ((activity.questions?.[activity.activeQuestionIndex || 0]?.time_limit_sec || 15) - remaining) * 1000);
        const questionEndsAt = new Date(now.getTime() + remaining * 1000);
        activity.settings = { ...activity.settings, quiz_state: "answering", quizQuestionRemainingSeconds: null };
        activity.quizQuestionStartedAt = questionStartedAt;
        activity.quizQuestionEndsAt = questionEndsAt;
        await activity.save();
        const payload = {
            activityId: activity._id,
            questionIndex: activity.activeQuestionIndex ?? 0,
            quizState: "answering",
            questionStartedAt,
            questionEndsAt,
            remainingSeconds: remaining,
            serverTime: now,
        };
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:timer_resumed", payload);
        res.json({ success: true, ...payload });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.resumeQuizTimer = resumeQuizTimer;
// ─── POST /quizzes/:id/reset-timer ───────────────────────────────────────────
const resetQuizTimer = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        activity.settings = { ...activity.settings, quiz_state: "ready", quizQuestionRemainingSeconds: null };
        activity.quizQuestionStartedAt = null;
        activity.quizQuestionEndsAt = null;
        await activity.save();
        const payload = {
            activityId: activity._id,
            questionIndex: activity.activeQuestionIndex ?? 0,
            quizState: "ready",
            questionStartedAt: null,
            questionEndsAt: null,
            serverTime: new Date(),
        };
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:timer_reset", payload);
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:question_changed", payload);
        res.json({ success: true, ...payload });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.resetQuizTimer = resetQuizTimer;
// ─── POST /quizzes/:id/add-time ──────────────────────────────────────────────
const addQuizTime = async (req, res) => {
    try {
        const { id } = req.params;
        const { extraSeconds = 10 } = req.body;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        const now = new Date();
        let baseTime = activity.quizQuestionEndsAt ? new Date(activity.quizQuestionEndsAt) : now;
        if (baseTime < now)
            baseTime = now;
        const newEndsAt = new Date(baseTime.getTime() + Math.max(1, Number(extraSeconds) || 10) * 1000);
        activity.quizQuestionEndsAt = newEndsAt;
        activity.settings = { ...activity.settings, quiz_state: "answering", quizQuestionRemainingSeconds: null };
        if (!activity.quizQuestionStartedAt) {
            activity.quizQuestionStartedAt = now;
        }
        await activity.save();
        const payload = {
            activityId: activity._id,
            questionIndex: activity.activeQuestionIndex ?? 0,
            quizState: "answering",
            questionStartedAt: activity.quizQuestionStartedAt,
            questionEndsAt: newEndsAt,
            serverTime: now,
        };
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:timer_updated", payload);
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:question_changed", payload);
        res.json({ success: true, ...payload });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addQuizTime = addQuizTime;
// ─── POST /quizzes/:id/show-leaderboard ──────────────────────────────────────
const showQuizLeaderboard = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        activity.settings = { ...activity.settings, quiz_state: "leaderboard" };
        await activity.save();
        const leaderboard = await (0, quizScoringService_1.buildLeaderboard)(activity._id.toString(), activity.eventId.toString());
        const payload = {
            activityId: activity._id,
            leaderboard,
            serverTime: new Date(),
        };
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:leaderboard_shown", payload);
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:leaderboard_updated", payload);
        res.json({ success: true, ...payload });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.showQuizLeaderboard = showQuizLeaderboard;
// ─── POST /quizzes/:id/reveal ─────────────────────────────────────────────────
const revealQuizAnswer = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        const activeIdx = activity.activeQuestionIndex ?? 0;
        const question = (activity.questions || [])[activeIdx];
        if (!question) {
            res.status(404).json({ message: "Active quiz question not found" });
            return;
        }
        const correctOption = (question.options || []).find((o) => o.is_correct);
        const correctOptionId = correctOption?._id?.toString() || correctOption?.id || "";
        activity.settings = { ...activity.settings, quiz_state: "revealed" };
        await activity.save();
        const leaderboard = await (0, quizScoringService_1.buildLeaderboard)(activity._id.toString(), activity.eventId.toString());
        const questionId = question._id?.toString() || question.id;
        const responses = await QuizResponse_1.QuizResponse.find({
            activityId: activity._id,
            questionId,
        });
        const optionCounts = {};
        responses.forEach((r) => {
            optionCounts[r.optionId] = (optionCounts[r.optionId] || 0) + 1;
        });
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:answer_revealed", {
            activityId: activity._id,
            questionIndex: activeIdx,
            questionId,
            correctOptionId,
            explanation: question.explanation || "",
            leaderboard,
            optionCounts,
            totalResponses: responses.length,
        });
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:leaderboard_updated", {
            activityId: activity._id,
            leaderboard,
        });
        res.json({
            success: true,
            quiz_state: "revealed",
            questionIndex: activeIdx,
            questionId,
            correctOptionId,
            explanation: question.explanation || "",
            leaderboard,
            optionCounts,
            totalResponses: responses.length,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.revealQuizAnswer = revealQuizAnswer;
// ─── POST /quizzes/:id/finish ─────────────────────────────────────────────────
const finishQuiz = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        const leaderboard = await finalizeQuiz(activity);
        res.json({ success: true, leaderboard });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.finishQuiz = finishQuiz;
// ─── GET /quizzes/:id/leaderboard ────────────────────────────────────────────
const getLeaderboard = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        const leaderboard = await (0, quizScoringService_1.buildLeaderboard)(activity._id.toString(), activity.eventId.toString());
        res.json(leaderboard);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getLeaderboard = getLeaderboard;
