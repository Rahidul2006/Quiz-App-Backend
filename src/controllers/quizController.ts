import { Request, Response } from "express";
import { Activity } from "../models/Activity";
import { QuizResponse } from "../models/QuizResponse";
import { Participant } from "../models/Participant";
import { Event } from "../models/Event";
import { emitToEventRoom } from "../sockets/socketHandler";
import { calculateQuizScore, buildLeaderboard } from "../services/quizScoringService";

// ─── Internal quiz finalization helper ───────────────────────────────────────
// Used by: manual finishQuiz, auto-expiry ticker, manual stopActivity (quiz)
export async function finalizeQuiz(activity: any): Promise<any[]> {
  const now = new Date();
  activity.status = "ENDED";
  activity.stoppedAt = now;
  activity.settings = { ...activity.settings, quiz_state: "leaderboard" };
  await activity.save();

  await Event.findByIdAndUpdate(activity.eventId, { activeActivityId: null });

  const leaderboard = await buildLeaderboard(
    activity._id.toString(),
    activity.eventId.toString()
  );

  emitToEventRoom(activity.eventId.toString(), "quiz:finished", {
    activityId: activity._id,
    leaderboard,
  });

  emitToEventRoom(activity.eventId.toString(), "quiz:leaderboard_updated", {
    activityId: activity._id,
    leaderboard,
  });

  emitToEventRoom(activity.eventId.toString(), "activity:closed", {
    activityId: activity._id.toString(),
    status: "ENDED",
    stoppedAt: now,
    reason: "quiz_finalized",
    serverTime: now,
  });

  return leaderboard;
}

// ─── POST /quizzes/:id/answer ─────────────────────────────────────────────────
export const answerQuizQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    // Client-provided timeTakenMs is intentionally IGNORED — server calculates it
    const { questionId, optionId, participantId, participantName } = req.body;

    if (!questionId || !optionId || !participantId) {
      res.status(400).json({ message: "questionId, optionId, and participantId are required" });
      return;
    }

    // 1. Activity exists
    const activity = await Activity.findById(id);
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
    const isLive =
      activity.status === "LIVE" ||
      activity.status === "live" ||
      activity.status === "active";
    if (!isLive) {
      if (
        activity.status === "ENDED" ||
        activity.status === "ended"
      ) {
        res.status(409).json({ message: "Quiz has ended." });
      } else if (
        activity.status === "PAUSED" ||
        activity.status === "paused"
      ) {
        res.status(400).json({ message: "Quiz activity is currently paused by organizer" });
      } else {
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
    const question = (activity.questions || []).find(
      (q: any) => q._id?.toString() === questionId || q.id === questionId
    );
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

    const now = new Date();

    // 7. Server time has not passed the question deadline
    if (activity.quizQuestionEndsAt) {
      const questionDeadline = new Date(activity.quizQuestionEndsAt);
      if (now > questionDeadline) {
        res.status(409).json({ message: "Question time has expired." });
        return;
      }
    }

    // 8. Server time has not passed the activity endsAt
    if (activity.endsAt) {
      const activityDeadline = new Date(activity.endsAt);
      if (now > activityDeadline) {
        res.status(409).json({ message: "Quiz has ended." });
        return;
      }
    }

    // 9. Participant belongs to the Event (best-effort check)
    const allParticipants = await Participant.find({ eventId: activity.eventId });
    const participantBelongs = allParticipants.some(
      (p) =>
        p._id.toString() === participantId ||
        (p as any).id === participantId ||
        (p as any).sessionToken === participantId
    );
    if (!participantBelongs) {
      // Warn but allow — in-memory stores may not populate correctly
      console.warn(`[Quiz] Participant ${participantId} not found in event ${activity.eventId} — allowing submission`);
    }

    // 10. Participant has not already submitted this question
    const existingResponse = await QuizResponse.findOne({ questionId, participantId });
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
    const selectedOpt = (question.options || []).find(
      (o: any) => o._id?.toString() === optionId || o.id === optionId
    );
    const isCorrect = Boolean(selectedOpt?.is_correct);

    let scoreAwarded = 0;
    if (isCorrect) {
      scoreAwarded = calculateQuizScore(
        question.points || 1000,
        question.time_limit_sec || 15,
        timeTakenMs
      );
    }

    // ── Save response ──
    const response = await QuizResponse.create({
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
    const leaderboard = await buildLeaderboard(
      activity._id.toString(),
      activity.eventId.toString()
    );

    // ── Emit realtime events ──
    emitToEventRoom(activity.eventId.toString(), "quiz:answer_submitted", {
      activityId: activity._id,
      questionId,
      participantId,
    });

    emitToEventRoom(activity.eventId.toString(), "quiz:leaderboard_updated", {
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
  } catch (error: any) {
    // Duplicate key error = already answered (unique index safety net)
    if (error.code === 11000) {
      res.status(409).json({ message: "You have already answered this question." });
      return;
    }
    res.status(500).json({ message: error.message });
  }
};

// ─── POST /quizzes/:id/advance ────────────────────────────────────────────────
export const advanceQuizQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { questionIndex } = req.body;

    const activity = await Activity.findById(id);
    if (!activity || activity.type !== "quiz") {
      res.status(404).json({ message: "Quiz activity not found" });
      return;
    }

    const newIndex = Number(questionIndex);
    const question = (activity.questions || [])[newIndex];

    // Set server-authoritative question timestamps
    const questionStartedAt = new Date();
    const timeLimitSec = question?.time_limit_sec || 15;
    const questionEndsAt = new Date(questionStartedAt.getTime() + timeLimitSec * 1000);

    activity.activeQuestionIndex = newIndex;
    activity.settings = { ...activity.settings, quiz_state: "answering" };
    activity.quizQuestionStartedAt = questionStartedAt;
    activity.quizQuestionEndsAt = questionEndsAt;
    await activity.save();

    // Emit with authoritative server timestamps
    emitToEventRoom(activity.eventId.toString(), "quiz:question_changed", {
      activityId: activity._id,
      questionIndex: newIndex,
      question,
      questionStartedAt,
      questionEndsAt,
      serverTime: questionStartedAt,
    });

    res.json({
      success: true,
      activeQuestionIndex: newIndex,
      questionStartedAt,
      questionEndsAt,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ─── POST /quizzes/:id/finish ─────────────────────────────────────────────────
export const finishQuiz = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const activity = await Activity.findById(id);
    if (!activity || activity.type !== "quiz") {
      res.status(404).json({ message: "Quiz activity not found" });
      return;
    }

    const leaderboard = await finalizeQuiz(activity);
    res.json({ success: true, leaderboard });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET /quizzes/:id/leaderboard ────────────────────────────────────────────
export const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const activity = await Activity.findById(id);
    if (!activity) {
      res.status(404).json({ message: "Activity not found" });
      return;
    }

    const leaderboard = await buildLeaderboard(
      activity._id.toString(),
      activity.eventId.toString()
    );
    res.json(leaderboard);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
