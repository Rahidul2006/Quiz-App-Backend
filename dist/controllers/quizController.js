"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeaderboard = exports.finishQuiz = exports.advanceQuizQuestion = exports.answerQuizQuestion = void 0;
const Activity_1 = require("../models/Activity");
const QuizResponse_1 = require("../models/QuizResponse");
const Participant_1 = require("../models/Participant");
const socketHandler_1 = require("../sockets/socketHandler");
const answerQuizQuestion = async (req, res) => {
    try {
        const { id } = req.params; // activity id
        const { questionId, optionId, participantId, participantName, timeTakenMs } = req.body;
        if (!questionId || !optionId || !participantId) {
            res.status(400).json({ message: "questionId, optionId, and participantId are required" });
            return;
        }
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        const question = (activity.questions || []).find((q) => q._id?.toString() === questionId || q.id === questionId);
        if (!question) {
            res.status(404).json({ message: "Quiz question not found" });
            return;
        }
        // SERVER-SIDE SCORING: Verify correct answer securely
        const selectedOpt = (question.options || []).find((o) => o._id?.toString() === optionId || o.id === optionId);
        const isCorrect = Boolean(selectedOpt?.is_correct);
        let scoreAwarded = 0;
        const timeMs = Number(timeTakenMs) || 0;
        if (isCorrect) {
            const basePoints = question.points || 1000;
            const totalTimeMs = (question.time_limit_sec || 15) * 1000;
            const remainingTime = Math.max(0, totalTimeMs - timeMs);
            const speedBonus = Math.round((remainingTime / totalTimeMs) * 300);
            scoreAwarded = basePoints + speedBonus;
        }
        // Duplicate answer protection
        await QuizResponse_1.QuizResponse.deleteMany({ questionId, participantId });
        const response = await QuizResponse_1.QuizResponse.create({
            activityId: activity._id,
            questionId,
            optionId,
            participantId,
            participantName: participantName || "Participant",
            isCorrect,
            timeTakenMs: timeMs,
            scoreAwarded,
        });
        // Calculate updated live leaderboard
        const leaderboard = await calculateLeaderboard(activity._id.toString(), activity.eventId.toString());
        // Socket.IO Emit: quiz:answer_submitted and quiz:leaderboard_updated
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
            scoreAwarded,
            responseId: response._id,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.answerQuizQuestion = answerQuizQuestion;
const advanceQuizQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const { questionIndex } = req.body;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        activity.activeQuestionIndex = Number(questionIndex);
        activity.settings = { ...activity.settings, quiz_state: "answering" };
        await activity.save();
        // Socket.IO Emit: quiz:question_changed
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:question_changed", {
            activityId: activity._id,
            questionIndex: activity.activeQuestionIndex,
            question: activity.questions?.[activity.activeQuestionIndex],
        });
        res.json({
            success: true,
            activeQuestionIndex: activity.activeQuestionIndex,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.advanceQuizQuestion = advanceQuizQuestion;
const finishQuiz = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity || activity.type !== "quiz") {
            res.status(404).json({ message: "Quiz activity not found" });
            return;
        }
        activity.settings = { ...activity.settings, quiz_state: "leaderboard" };
        await activity.save();
        const leaderboard = await calculateLeaderboard(activity._id.toString(), activity.eventId.toString());
        // Socket.IO Emit: quiz:finished
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:finished", {
            activityId: activity._id,
            leaderboard,
        });
        res.json({ success: true, leaderboard });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.finishQuiz = finishQuiz;
const getLeaderboard = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        const leaderboard = await calculateLeaderboard(activity._id.toString(), activity.eventId.toString());
        res.json(leaderboard);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getLeaderboard = getLeaderboard;
async function calculateLeaderboard(activityId, eventId) {
    const activity = await Activity_1.Activity.findById(activityId);
    const totalQuestions = activity?.questions?.length || 0;
    const responses = await QuizResponse_1.QuizResponse.find({ activityId });
    const participants = await Participant_1.Participant.find({ eventId });
    const map = new Map();
    participants.forEach((p) => {
        map.set(p._id.toString(), {
            name: p.name,
            score: 0,
            correct: 0,
            totalTimeMs: 0,
        });
    });
    responses.forEach((r) => {
        const current = map.get(r.participantId) || {
            name: r.participantName,
            score: 0,
            correct: 0,
            totalTimeMs: 0,
        };
        current.score += r.scoreAwarded;
        if (r.isCorrect)
            current.correct += 1;
        current.totalTimeMs += r.timeTakenMs;
        map.set(r.participantId, current);
    });
    const entries = [];
    map.forEach((data, id) => {
        entries.push({
            participant_id: id,
            participant_name: data.name,
            total_score: data.score,
            correct_answers: data.correct,
            total_questions: totalQuestions,
            total_time_ms: data.totalTimeMs,
            rank: 0,
        });
    });
    // Sort by highest score, then fastest total time
    entries.sort((a, b) => {
        if (b.total_score !== a.total_score)
            return b.total_score - a.total_score;
        return a.total_time_ms - b.total_time_ms;
    });
    return entries.map((entry, index) => ({
        ...entry,
        rank: index + 1,
    }));
}
