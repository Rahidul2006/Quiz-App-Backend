"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getParticipantResponse = exports.getResults = exports.submitResponse = exports.checkAndEndExpiredActivities = exports.restartActivity = exports.resumeActivity = exports.pauseActivity = exports.stopActivity = exports.launchActivity = exports.deleteActivity = exports.updateActivity = exports.createActivity = exports.getActivityById = exports.getActivities = void 0;
const Activity_1 = require("../models/Activity");
const Event_1 = require("../models/Event");
const PollResponse_1 = require("../models/PollResponse");
const WordCloudResponse_1 = require("../models/WordCloudResponse");
const QuizResponse_1 = require("../models/QuizResponse");
const socketHandler_1 = require("../sockets/socketHandler");
const normalizeWord = (w) => {
    return w.trim().toLowerCase().replace(/[^\w\s]/gi, "");
};
const getActivities = async (req, res) => {
    try {
        const { eventId } = req.params;
        const activities = await Activity_1.Activity.find({ eventId }).sort({ orderIndex: 1 });
        res.json(activities.map((a) => ({ ...a.toObject(), id: a._id })));
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getActivities = getActivities;
const getActivityById = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        res.json({ ...activity.toObject(), id: activity._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getActivityById = getActivityById;
const createActivity = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { type, title, duration, settings, options, questions } = req.body;
        if (!type || !title) {
            res.status(400).json({ message: "Activity type and title are required" });
            return;
        }
        const count = await Activity_1.Activity.countDocuments({ eventId });
        const activityDuration = Math.max(5, Number(duration) || 30);
        const activity = await Activity_1.Activity.create({
            eventId,
            type,
            title: title.trim(),
            settings: settings || {},
            orderIndex: count,
            status: "WAITING",
            duration: activityDuration,
            startedAt: null,
            endsAt: null,
            stoppedAt: null,
            options: options || [],
            questions: questions || [],
        });
        res.status(201).json({ ...activity.toObject(), id: activity._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createActivity = createActivity;
const updateActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await Activity_1.Activity.findByIdAndUpdate(id, req.body, { new: true });
        if (!updated) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        res.json({ ...updated.toObject(), id: updated._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateActivity = updateActivity;
const deleteActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (activity) {
            await Event_1.Event.updateOne({ _id: activity.eventId, activeActivityId: id }, { activeActivityId: null });
            await PollResponse_1.PollResponse.deleteMany({ activityId: id });
            await WordCloudResponse_1.WordCloudResponse.deleteMany({ activityId: id });
            await QuizResponse_1.QuizResponse.deleteMany({ activityId: id });
            await Activity_1.Activity.findByIdAndDelete(id);
        }
        res.json({ message: "Activity deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteActivity = deleteActivity;
const launchActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        // Set other activities in this event to ended (preserve single-active-activity model)
        await Activity_1.Activity.updateMany({ eventId: activity.eventId, _id: { $ne: id }, status: { $in: ["active", "LIVE", "live"] } }, { status: "ENDED", stoppedAt: new Date() });
        const durationSeconds = Math.max(5, Number(activity.duration) || 30);
        const startedAt = new Date();
        const endsAt = new Date(startedAt.getTime() + durationSeconds * 1000);
        activity.status = "LIVE";
        activity.duration = durationSeconds;
        activity.startedAt = startedAt;
        activity.endsAt = endsAt;
        activity.stoppedAt = null;
        if (activity.type === "quiz") {
            activity.activeQuestionIndex = 0;
            activity.settings = { ...activity.settings, quiz_state: "answering" };
        }
        await activity.save();
        await Event_1.Event.findByIdAndUpdate(activity.eventId, { activeActivityId: activity._id });
        // Emit Socket.IO event: activity:started with authoritative timestamps
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "activity:started", {
            activity: { ...activity.toObject(), id: activity._id },
            serverTime: new Date(),
        });
        res.json({
            activity: { ...activity.toObject(), id: activity._id },
            serverTime: new Date(),
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.launchActivity = launchActivity;
const stopActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        const stoppedAt = new Date();
        activity.status = "ENDED";
        activity.stoppedAt = stoppedAt;
        await activity.save();
        await Event_1.Event.findByIdAndUpdate(activity.eventId, { activeActivityId: null });
        // Emit Socket.IO event: activity:closed
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "activity:closed", {
            activityId: activity._id,
            status: "ENDED",
            stoppedAt,
            serverTime: stoppedAt,
        });
        res.json({ message: "Activity closed successfully", activity: { ...activity.toObject(), id: activity._id } });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.stopActivity = stopActivity;
const pauseActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        const now = new Date();
        let remaining = activity.remainingSeconds;
        if (activity.endsAt) {
            remaining = Math.max(1, Math.ceil((new Date(activity.endsAt).getTime() - now.getTime()) / 1000));
        }
        else if (!remaining) {
            remaining = activity.duration || 30;
        }
        activity.status = "PAUSED";
        activity.remainingSeconds = remaining;
        activity.pausedAt = now;
        activity.endsAt = null;
        await activity.save();
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "activity:paused", {
            activityId: activity._id.toString(),
            status: "PAUSED",
            remainingSeconds: remaining,
            pausedAt: now,
            serverTime: now,
        });
        res.json({
            message: "Activity paused successfully",
            activity: { ...activity.toObject(), id: activity._id },
            remainingSeconds: remaining,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.pauseActivity = pauseActivity;
const resumeActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        // Set other activities in this event to ended
        await Activity_1.Activity.updateMany({ eventId: activity.eventId, _id: { $ne: id }, status: { $in: ["active", "LIVE", "live"] } }, { status: "ENDED", stoppedAt: new Date() });
        const remaining = Math.max(1, Number(activity.remainingSeconds) || Number(activity.duration) || 30);
        const now = new Date();
        const endsAt = new Date(now.getTime() + remaining * 1000);
        activity.status = "LIVE";
        activity.endsAt = endsAt;
        activity.pausedAt = null;
        await activity.save();
        await Event_1.Event.findByIdAndUpdate(activity.eventId, { activeActivityId: activity._id });
        const payload = {
            activity: { ...activity.toObject(), id: activity._id },
            serverTime: now,
        };
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "activity:resumed", payload);
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "activity:started", payload);
        res.json({
            message: "Activity resumed successfully",
            activity: { ...activity.toObject(), id: activity._id },
            serverTime: now,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.resumeActivity = resumeActivity;
const restartActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        // End other live activities in this event
        await Activity_1.Activity.updateMany({ eventId: activity.eventId, _id: { $ne: id }, status: { $in: ["active", "LIVE", "live", "PAUSED", "paused"] } }, { status: "ENDED", stoppedAt: new Date() });
        // Clear previous responses for this activity
        const actIdStr = (activity._id || activity.id).toString();
        await PollResponse_1.PollResponse.deleteMany({ activityId: actIdStr });
        await WordCloudResponse_1.WordCloudResponse.deleteMany({ activityId: actIdStr });
        await QuizResponse_1.QuizResponse.deleteMany({ activityId: actIdStr });
        const durationSeconds = Math.max(5, Number(activity.duration) || 30);
        const startedAt = new Date();
        const endsAt = new Date(startedAt.getTime() + durationSeconds * 1000);
        activity.status = "LIVE";
        activity.duration = durationSeconds;
        activity.startedAt = startedAt;
        activity.endsAt = endsAt;
        activity.stoppedAt = null;
        activity.pausedAt = null;
        activity.remainingSeconds = null;
        if (activity.type === "quiz") {
            activity.activeQuestionIndex = 0;
            activity.settings = { ...activity.settings, quiz_state: "answering" };
        }
        await activity.save();
        await Event_1.Event.findByIdAndUpdate(activity.eventId, { activeActivityId: activity._id });
        // Emit cleared state to event room
        if (activity.type === "poll") {
            const emptyOptions = (activity.options || []).map((o) => ({
                id: o._id ? o._id.toString() : (o.id || ""),
                text: o.text,
                votes: 0,
                percentage: 0,
                order_index: o.order_index,
            }));
            (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "poll:results_updated", {
                activityId: activity._id.toString(),
                options: emptyOptions,
                total: 0,
            });
        }
        else if (activity.type === "word_cloud") {
            (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "wordcloud:updated", {
                activityId: activity._id.toString(),
                words: [],
            });
        }
        else if (activity.type === "quiz") {
            (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:leaderboard_updated", {
                activityId: activity._id.toString(),
                leaderboard: [],
            });
        }
        const payload = {
            activity: { ...activity.toObject(), id: activity._id },
            serverTime: new Date(),
        };
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "activity:restarted", payload);
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "activity:started", payload);
        res.json({
            message: "Activity restarted successfully",
            activity: { ...activity.toObject(), id: activity._id },
            serverTime: new Date(),
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.restartActivity = restartActivity;
const checkAndEndExpiredActivities = async () => {
    try {
        const now = new Date();
        const activeActivities = await Activity_1.Activity.find({
            status: { $in: ["active", "LIVE", "live"] },
        });
        for (const activity of activeActivities) {
            if (activity.endsAt && new Date(activity.endsAt).getTime() <= now.getTime()) {
                activity.status = "ENDED";
                activity.stoppedAt = now;
                await activity.save();
                await Event_1.Event.findByIdAndUpdate(activity.eventId, { activeActivityId: null });
                (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "activity:closed", {
                    activityId: activity._id.toString(),
                    status: "ENDED",
                    stoppedAt: now,
                    reason: "timer_expired",
                    serverTime: now,
                });
                console.log(`[Lifecycle] Activity ${activity._id} ("${activity.title}") auto-ENDED by authoritative timer.`);
            }
        }
    }
    catch (e) {
        // Ignore ticker error
    }
};
exports.checkAndEndExpiredActivities = checkAndEndExpiredActivities;
const submitResponse = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        const { optionId, participantId, participantName, word, textResponse, ratingValue } = req.body;
        if (!participantId) {
            res.status(400).json({ message: "Participant identifier is required" });
            return;
        }
        if (activity.status === "PAUSED" || activity.status === "paused") {
            res.status(400).json({ message: "Activity is currently paused by organizer" });
            return;
        }
        // 1. POLL RESPONSE
        if (activity.type === "poll") {
            if (!optionId && !textResponse) {
                res.status(400).json({ message: "Option selection or response is required" });
                return;
            }
            const actId = (activity._id || activity.id).toString();
            const evId = (activity.eventId || activity.event_id || "").toString();
            const optId = optionId ? optionId.toString() : undefined;
            const partId = participantId ? participantId.toString() : "anon";
            // Check duplicate voting rule server-side: enforce one vote per participant
            const allowMultiple = activity.settings?.allow_multiple;
            if (!allowMultiple) {
                await PollResponse_1.PollResponse.deleteMany({ activityId: actId, participantId: partId });
            }
            const response = await PollResponse_1.PollResponse.create({
                activityId: actId,
                eventId: evId || undefined,
                optionId: optId,
                participantId: partId,
                participantName: participantName || "Participant",
                textResponse,
                ratingValue,
            });
            // Calculate real-time live aggregates from persistent database
            const allResponses = await PollResponse_1.PollResponse.find({ activityId: actId });
            const total = allResponses.length;
            const countMap = {};
            allResponses.forEach((r) => {
                if (r.optionId) {
                    const key = r.optionId.toString();
                    countMap[key] = (countMap[key] || 0) + 1;
                }
            });
            const updatedOptions = (activity.options || []).map((opt, index) => {
                const oId = opt._id?.toString() || opt.id || "";
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
            (0, socketHandler_1.emitToEventRoom)(evId, "poll:response", {
                response: { id: response._id, optionId: optId, participantId: partId },
            });
            (0, socketHandler_1.emitToEventRoom)(evId, "poll:results_updated", {
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
            await WordCloudResponse_1.WordCloudResponse.create({
                activityId: activity._id,
                participantId,
                word: trimmed,
                normalizedWord: normalized,
            });
            // Aggregate dynamic word frequencies
            const responses = await WordCloudResponse_1.WordCloudResponse.find({ activityId: activity._id });
            const map = new Map();
            responses.forEach((r) => {
                const key = r.normalizedWord;
                if (!map.has(key)) {
                    map.set(key, { count: 1, original: r.word });
                }
                else {
                    const item = map.get(key);
                    item.count += 1;
                }
            });
            const wordsList = [];
            map.forEach((val) => {
                wordsList.push({ text: val.original, value: val.count, original: val.original });
            });
            wordsList.sort((a, b) => b.value - a.value);
            // Socket.IO Emit: wordcloud:updated
            (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "wordcloud:updated", {
                activityId: activity._id,
                words: wordsList,
            });
            res.json({ success: true, words: wordsList });
            return;
        }
        res.status(400).json({ message: "Unsupported activity type for this endpoint" });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.submitResponse = submitResponse;
const getResults = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        if (activity.type === "poll") {
            const allResponses = await PollResponse_1.PollResponse.find({ activityId: activity._id });
            const total = allResponses.length;
            const countMap = {};
            allResponses.forEach((r) => {
                if (r.optionId) {
                    const key = r.optionId.toString();
                    countMap[key] = (countMap[key] || 0) + 1;
                }
            });
            const options = (activity.options || []).map((opt, index) => {
                const optId = opt._id?.toString() || opt.id || "";
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
            const responses = await WordCloudResponse_1.WordCloudResponse.find({ activityId: activity._id });
            const map = new Map();
            responses.forEach((r) => {
                const key = r.normalizedWord;
                if (!map.has(key)) {
                    map.set(key, { count: 1, original: r.word });
                }
                else {
                    const item = map.get(key);
                    item.count += 1;
                }
            });
            const wordsList = [];
            map.forEach((val) => {
                wordsList.push({ text: val.original, value: val.count, original: val.original });
            });
            wordsList.sort((a, b) => b.value - a.value);
            res.json({ type: "word_cloud", words: wordsList });
            return;
        }
        if (activity.type === "quiz") {
            const responses = await QuizResponse_1.QuizResponse.find({ activityId: activity._id });
            const totalQuestions = activity.questions?.length || 0;
            const map = new Map();
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
            const leaderboard = [];
            map.forEach((data, pId) => {
                leaderboard.push({
                    participant_id: pId,
                    participant_name: data.name,
                    total_score: data.score,
                    correct_answers: data.correct,
                    total_questions: totalQuestions,
                    total_time_ms: data.totalTimeMs,
                });
            });
            leaderboard.sort((a, b) => {
                if (b.total_score !== a.total_score)
                    return b.total_score - a.total_score;
                return a.total_time_ms - b.total_time_ms;
            });
            const rankedLeaderboard = leaderboard.map((item, idx) => ({
                ...item,
                rank: idx + 1,
            }));
            res.json({
                type: "quiz",
                leaderboard: rankedLeaderboard,
                totalResponses: responses.length,
                totalQuestions,
            });
            return;
        }
        res.json({ message: "Results retrieved" });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getResults = getResults;
const getParticipantResponse = async (req, res) => {
    try {
        const { id } = req.params;
        const { participantId } = req.query;
        if (!participantId) {
            res.status(400).json({ message: "participantId is required" });
            return;
        }
        const actId = id.toString();
        const partId = participantId.toString();
        const existingVote = await PollResponse_1.PollResponse.findOne({
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
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getParticipantResponse = getParticipantResponse;
