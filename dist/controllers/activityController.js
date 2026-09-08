"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getParticipantResponse = exports.getResults = exports.submitResponse = exports.stopActivity = exports.launchActivity = exports.deleteActivity = exports.updateActivity = exports.createActivity = exports.getActivityById = exports.getActivities = void 0;
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
        const { type, title, settings, options, questions } = req.body;
        if (!type || !title) {
            res.status(400).json({ message: "Activity type and title are required" });
            return;
        }
        const count = await Activity_1.Activity.countDocuments({ eventId });
        const activity = await Activity_1.Activity.create({
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
        // Set other activities in this event to ended
        await Activity_1.Activity.updateMany({ eventId: activity.eventId, _id: { $ne: id }, status: "active" }, { status: "ended" });
        activity.status = "active";
        if (activity.type === "quiz") {
            activity.activeQuestionIndex = 0;
            activity.settings = { ...activity.settings, quiz_state: "answering" };
        }
        await activity.save();
        await Event_1.Event.findByIdAndUpdate(activity.eventId, { activeActivityId: activity._id });
        // Emit Socket.IO event: activity:started
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "activity:started", {
            activity: { ...activity.toObject(), id: activity._id },
        });
        res.json({ activity: { ...activity.toObject(), id: activity._id } });
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
        activity.status = "ended";
        await activity.save();
        await Event_1.Event.findByIdAndUpdate(activity.eventId, { activeActivityId: null });
        // Emit Socket.IO event: activity:closed
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "activity:closed", {
            activityId: activity._id,
        });
        res.json({ message: "Activity closed successfully" });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.stopActivity = stopActivity;
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
