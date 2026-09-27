import { Activity } from '../models/Activity';
import { QuizResponse } from '../models/QuizResponse';
import { Participant } from '../models/Participant';

/**
 * Calculates the score for a correct quiz answer.
 * Formula: basePoints + round(basePoints * 0.30 * speedRatio)
 * speedRatio = max(0, timeLimitMs - timeTakenMs) / timeLimitMs
 */
export function calculateQuizScore(
  basePoints: number,
  timeLimitSec: number,
  timeTakenMs: number
): number {
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
export async function buildLeaderboard(activityId: string, eventId: string) {
  const activity = await Activity.findById(activityId);
  const totalQuestions = activity?.questions?.length || 0;

  const responses = await QuizResponse.find({ activityId });
  const participants = await Participant.find({ eventId });

  const map = new Map<string, {
    name: string;
    score: number;
    correct: number;
    totalTimeMs: number;
    answeredQuestions: number;
    firstSubmissionTime: number;
  }>();

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
    if (r.isCorrect) existing.correct += 1;
    existing.totalTimeMs += r.timeTakenMs;
    existing.answeredQuestions += 1;
    const createdMs = new Date(r.createdAt).getTime();
    if (createdMs < existing.firstSubmissionTime) {
      existing.firstSubmissionTime = createdMs;
    }
    map.set(r.participantId, existing);
  });

  const entries: any[] = [];
  map.forEach((data, id) => {
    const avgTimeMs = data.answeredQuestions > 0 ? Math.round(data.totalTimeMs / data.answeredQuestions) : 0;
    const avgTimeSec = +(avgTimeMs / 1000).toFixed(2);

    entries.push({
      participant_id: id,
      participant_name: data.name,
      total_score: data.score,
      correct_answers: data.correct,
      total_questions: totalQuestions,
      total_time_ms: data.totalTimeMs,
      average_time_ms: avgTimeMs,
      average_time_sec: avgTimeSec,
      answered_questions: data.answeredQuestions,
      completion_percentage: totalQuestions > 0
        ? Math.round((data.answeredQuestions / totalQuestions) * 100)
        : 0,
      _firstSubmissionTime: data.firstSubmissionTime,
      rank: 0,
    });
  });

  entries.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    if (b.correct_answers !== a.correct_answers) return b.correct_answers - a.correct_answers;
    if (a.average_time_ms !== b.average_time_ms) return a.average_time_ms - b.average_time_ms;
    if (a.total_time_ms !== b.total_time_ms) return a.total_time_ms - b.total_time_ms;
    if (a._firstSubmissionTime !== b._firstSubmissionTime) return a._firstSubmissionTime - b._firstSubmissionTime;
    return a.participant_id.localeCompare(b.participant_id);
  });

  return entries.map((entry, index) => {
    const { _firstSubmissionTime, ...rest } = entry;
    return { ...rest, rank: index + 1 };
  });
}

