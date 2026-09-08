import { Request, Response } from "express";
import { Activity } from "../models/Activity";
import { Event } from "../models/Event";
import { PollResponse } from "../models/PollResponse";
import { WordCloudResponse } from "../models/WordCloudResponse";
import { QuizResponse } from "../models/QuizResponse";
import { emitToEventRoom } from "../sockets/socketHandler";

const normalizeWord = (w: string): string => {
  return w.trim().toLowerCase().replace(/[^\w\s]/gi, "");
};

export const getActivities = async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const activities = await Activity.find({ eventId }).sort({ orderIndex: 1 });
    res.json(activities.map((a) => ({ ...a.toObject(), id: a._id })));
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getActivityById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const activity = await Activity.findById(id);
    if (!activity) {
      res.status(404).json({ message: "Activity not found" });
      return;
    }
    res.json({ ...activity.toObject(), id: activity._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const { type, title, settings, options, questions } = req.body;

    if (!type || !title) {
      res.status(400).json({ message: "Activity type and title are required" });
      return;
    }

    const count = await Activity.countDocuments({ eventId });

    const activity = await Activity.create({
      eventId,
      type,
      title: title.trim(),
      settings: settings || {},
      orderIndex: count,
      status: "draft",
      options: options || [],
      questions: questions || [],
    });

    res.status(201).json({ ...activity.toObject(), id: activity._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await Activity.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      res.status(404).json({ message: "Activity not found" });
      return;
    }
    res.json({ ...updated.toObject(), id: updated._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const activity = await Activity.findById(id);
    if (activity) {
      await Event.updateOne({ _id: activity.eventId, activeActivityId: id }, { activeActivityId: null });
      await PollResponse.deleteMany({ activityId: id });
      await WordCloudResponse.deleteMany({ activityId: id });
      await QuizResponse.deleteMany({ activityId: id });
      await Activity.findByIdAndDelete(id);
    }
    res.json({ message: "Activity deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const launchActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const activity = await Activity.findById(id);
    if (!activity) {
      res.status(404).json({ message: "Activity not found" });
      return;
    }

    // Set other activities in this event to ended
    await Activity.updateMany(
      { eventId: activity.eventId, _id: { $ne: id }, status: "active" },
      { status: "ended" }
    );

    activity.status = "active";
    if (activity.type === "quiz") {
      activity.activeQuestionIndex = 0;
      activity.settings = { ...activity.settings, quiz_state: "answering" };
    }
    await activity.save();

    await Event.findByIdAndUpdate(activity.eventId, { activeActivityId: activity._id });

    // Emit Socket.IO event: activity:started
    emitToEventRoom(activity.eventId.toString(), "activity:started", {
      activity: { ...activity.toObject(), id: activity._id },
    });

    res.json({ activity: { ...activity.toObject(), id: activity._id } });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const stopActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const activity = await Activity.findById(id);
    if (!activity) {
      res.status(404).json({ message: "Activity not found" });
      return;
    }

    activity.status = "ended";
    await activity.save();

    await Event.findByIdAndUpdate(activity.eventId, { activeActivityId: null });

    // Emit Socket.IO event: activity:closed
    emitToEventRoom(activity.eventId.toString(), "activity:closed", {
      activityId: activity._id,
    });

    res.json({ message: "Activity closed successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const submitResponse = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const activity = await Activity.findById(id);
    if (!activity) {
      res.status(404).json({ message: "Activity not found" });
      return;
    }

    const { optionId, participantId, participantName, word, textResponse, ratingValue } = req.body;
    if (!participantId) {
      res.status(400).json({ message: "Participant identifier is required" });
      return;
    }

    // 1. POLL RESPONSE
    if (activity.type === "poll") {
      if (!optionId && !textResponse) {
        res.status(400).json({ message: "Option selection or response is required" });
        return;
      }

      const actId = (activity._id || activity.id).toString();
      const evId = (activity.eventId || (activity as any).event_id || "").toString();
      const optId = optionId ? optionId.toString() : undefined;
      const partId = participantId ? participantId.toString() : "anon";

      // Check duplicate voting rule server-side: enforce one vote per participant
      const allowMultiple = activity.settings?.allow_multiple;
      if (!allowMultiple) {
        await PollResponse.deleteMany({ activityId: actId, participantId: partId });
      }

      const response = await PollResponse.create({
        activityId: actId,
        eventId: evId || undefined,
        optionId: optId,
        participantId: partId,
        participantName: participantName || "Participant",
        textResponse,
        ratingValue,
      });

      // Calculate real-time live aggregates from persistent database
      const allResponses = await PollResponse.find({ activityId: actId });
      const total = allResponses.length;
      const countMap: Record<string, number> = {};
      allResponses.forEach((r) => {
        if (r.optionId) {
          const key = r.optionId.toString();
          countMap[key] = (countMap[key] || 0) + 1;
        }
      });

      const updatedOptions = (activity.options || []).map((opt, index) => {
        const oId = (opt as any)._id?.toString() || opt.id || "";
        const votes = countMap[oId] || 0;
        const percentage = total > 0 ? Math.round((votes / total) * 100) : 0;
        return {
          id: oId,
          text: opt.text,
          order_index: typeof opt.order_index === "number" ? opt.order_index : index,
          votes,
          percentage,
        };
      });

      // Server-authoritative ranking: sort by votes desc, tie-break by original order_index
      updatedOptions.sort((a, b) => {
        if (b.votes !== a.votes) {
          return b.votes - a.votes;
        }
        return (a.order_index ?? 0) - (b.order_index ?? 0);
      });

      // Socket.IO Emit: poll:response and poll:results_updated
      emitToEventRoom(evId, "poll:response", {
        response: { id: response._id, optionId: optId, participantId: partId },
      });

      emitToEventRoom(evId, "poll:results_updated", {
        activityId: actId,
        options: updatedOptions,
        total,
      });

      res.json({ success: true, options: updatedOptions, total });
      return;
    }

    // 2. WORD CLOUD RESPONSE
    if (activity.type === "word_cloud") {
      if (!word || !word.trim()) {
        res.status(400).json({ message: "Word is required" });
        return;
      }

      const trimmed = word.trim();
      const normalized = normalizeWord(trimmed);

      await WordCloudResponse.create({
        activityId: activity._id,
        participantId,
        word: trimmed,
        normalizedWord: normalized,
      });

      // Aggregate dynamic word frequencies
      const responses = await WordCloudResponse.find({ activityId: activity._id });
      const map = new Map<string, { count: number; original: string }>();

      responses.forEach((r) => {
        const key = r.normalizedWord;
        if (!map.has(key)) {
          map.set(key, { count: 1, original: r.word });
        } else {
          const item = map.get(key)!;
          item.count += 1;
        }
      });

      const wordsList: Array<{ text: string; value: number; original: string }> = [];
      map.forEach((val) => {
        wordsList.push({ text: val.original, value: val.count, original: val.original });
      });
      wordsList.sort((a, b) => b.value - a.value);

      // Socket.IO Emit: wordcloud:updated
      emitToEventRoom(activity.eventId.toString(), "wordcloud:updated", {
        activityId: activity._id,
        words: wordsList,
      });

      res.json({ success: true, words: wordsList });
      return;
    }

    res.status(400).json({ message: "Unsupported activity type for this endpoint" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const activity = await Activity.findById(id);
    if (!activity) {
      res.status(404).json({ message: "Activity not found" });
      return;
    }

    if (activity.type === "poll") {
      const allResponses = await PollResponse.find({ activityId: activity._id });
      const total = allResponses.length;
      const countMap: Record<string, number> = {};
      allResponses.forEach((r) => {
        if (r.optionId) {
          const key = r.optionId.toString();
          countMap[key] = (countMap[key] || 0) + 1;
        }
      });

      const options = (activity.options || []).map((opt, index) => {
        const optId = (opt as any)._id?.toString() || opt.id || "";
        const votes = countMap[optId] || 0;
        const percentage = total > 0 ? Math.round((votes / total) * 100) : 0;
        return {
          id: optId,
          text: opt.text,
          order_index: typeof opt.order_index === "number" ? opt.order_index : index,
          votes,
          percentage,
        };
      });

      // Server-authoritative ranking: sort by votes desc, tie-break by original order_index
      options.sort((a, b) => {
        if (b.votes !== a.votes) {
          return b.votes - a.votes;
        }
        return (a.order_index ?? 0) - (b.order_index ?? 0);
      });

      res.json({ type: "poll", options, total });
      return;
    }

    if (activity.type === "word_cloud") {
      const responses = await WordCloudResponse.find({ activityId: activity._id });
      const map = new Map<string, { count: number; original: string }>();

      responses.forEach((r) => {
        const key = r.normalizedWord;
        if (!map.has(key)) {
          map.set(key, { count: 1, original: r.word });
        } else {
          const item = map.get(key)!;
          item.count += 1;
        }
      });

      const wordsList: Array<{ text: string; value: number; original: string }> = [];
      map.forEach((val) => {
        wordsList.push({ text: val.original, value: val.count, original: val.original });
      });
      wordsList.sort((a, b) => b.value - a.value);

      res.json({ type: "word_cloud", words: wordsList });
      return;
    }

    res.json({ message: "Results retrieved" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getParticipantResponse = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { participantId } = req.query;
    if (!participantId) {
      res.status(400).json({ message: "participantId is required" });
      return;
    }

    const actId = id.toString();
    const partId = participantId.toString();

    const existingVote = await PollResponse.findOne({
      activityId: actId,
      participantId: partId,
    });

    if (existingVote) {
      res.json({
        hasVoted: true,
        optionId: existingVote.optionId ? existingVote.optionId.toString() : null,
        textResponse: existingVote.textResponse,
        ratingValue: existingVote.ratingValue,
      });
      return;
    }

    res.json({ hasVoted: false, optionId: null });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

