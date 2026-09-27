"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateQuizScore = calculateQuizScore;
exports.buildLeaderboard = buildLeaderboard;
const Activity_1 = require("../models/Activity");
const QuizResponse_1 = require("../models/QuizResponse");
const Participant_1 = require("../models/Participant");
/**
 * Calculates the score for a correct quiz answer.
 * Formula: basePoints + round(basePoints * 0.30 * speedRatio)
 * speedRatio = max(0, timeLimitMs - timeTakenMs) / timeLimitMs
 */
function calculateQuizScore(basePoints, timeLimitSec, timeTakenMs) {
    const timeLimitMs = timeLimitSec * 1000;
    const remainingMs = Math.max(0, timeLimitMs - timeTakenMs);
    const speedRatio = timeLimitMs > 0 ? remainingMs / timeLimitMs : 0;
    const speedBonus = Math.round(basePoints * 0.30 * speedRatio);
    return basePoints + speedBonus;
}
/**
 * Builds the authoritative leaderboard for a quiz activity.
 * Sort: total_score DESC, correct_answers DESC, total_time_ms ASC, first_submission ASC, participant_id ASC
 */
async function buildLeaderboard(activityId, eventId) {
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
            answeredQuestions: 0,
            firstSubmissionTime: Number.MAX_SAFE_INTEGER,
        });
    });
    responses.forEach((r) => {
        const existing = map.get(r.participantId) || {
            name: r.participantName,
            score: 0,
            correct: 0,
            totalTimeMs: 0,
            answeredQuestions: 0,
            firstSubmissionTime: Number.MAX_SAFE_INTEGER,
        };
        existing.score += r.scoreAwarded;
        if (r.isCorrect)
            existing.correct += 1;
        existing.totalTimeMs += r.timeTakenMs;
        existing.answeredQuestions += 1;
        const createdMs = new Date(r.createdAt).getTime();
        if (createdMs < existing.firstSubmissionTime) {
            existing.firstSubmissionTime = createdMs;
        }
        map.set(r.participantId, existing);
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
            answered_questions: data.answeredQuestions,
            completion_percentage: totalQuestions > 0
                ? Math.round((data.answeredQuestions / totalQuestions) * 100)
                : 0,
            _firstSubmissionTime: data.firstSubmissionTime,
            rank: 0,
        });
    });
    entries.sort((a, b) => {
        if (b.total_score !== a.total_score)
            return b.total_score - a.total_score;
        if (b.correct_answers !== a.correct_answers)
            return b.correct_answers - a.correct_answers;
        if (a.total_time_ms !== b.total_time_ms)
            return a.total_time_ms - b.total_time_ms;
        if (a._firstSubmissionTime !== b._firstSubmissionTime)
            return a._firstSubmissionTime - b._firstSubmissionTime;
        return a.participant_id.localeCompare(b.participant_id);
    });
    return entries.map((entry, index) => {
        const { _firstSubmissionTime, ...rest } = entry;
        return { ...rest, rank: index + 1 };
    });
}
