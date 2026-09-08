"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndEndExpiredEvents = exports.getParticipants = exports.joinEvent = exports.deleteEvent = exports.getEventStatus = exports.stopEvent = exports.startEvent = exports.updateEvent = exports.createEvent = exports.getEventByCode = exports.getEventById = exports.getEvents = void 0;
const Event_1 = require("../models/Event");
const Participant_1 = require("../models/Participant");
const Activity_1 = require("../models/Activity");
const PollResponse_1 = require("../models/PollResponse");
const WordCloudResponse_1 = require("../models/WordCloudResponse");
const QuizResponse_1 = require("../models/QuizResponse");
const socketHandler_1 = require("../sockets/socketHandler");
const generateJoinCode = async () => {
    let code = "";
    let exists = true;
    while (exists) {
        code = Math.floor(1000000 + Math.random() * 9000000).toString();
        const found = await Event_1.Event.findOne({ joinCode: code });
        if (!found)
            exists = false;
    }
    return code;
};
const getEvents = async (req, res) => {
    try {
        const events = await Event_1.Event.find().sort({ createdAt: -1 });
        const enriched = await Promise.all(events.map(async (event) => {
            const participant_count = await Participant_1.Participant.countDocuments({ eventId: event._id });
            const activity_count = await Activity_1.Activity.countDocuments({ eventId: event._id });
            return {
                ...event.toObject(),
                id: event._id,
                participant_count,
                activity_count,
            };
        }));
        res.json(enriched);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getEvents = getEvents;
const getEventById = async (req, res) => {
    try {
        const { id } = req.params;
        const event = await Event_1.Event.findById(id);
        if (!event) {
            res.status(404).json({ message: "Event not found" });
            return;
        }
        const participant_count = await Participant_1.Participant.countDocuments({ eventId: event._id });
        const activity_count = await Activity_1.Activity.countDocuments({ eventId: event._id });
        res.json({
            ...event.toObject(),
            id: event._id,
            participant_count,
            activity_count,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getEventById = getEventById;
const getEventByCode = async (req, res) => {
    try {
        const { code } = req.params;
        const cleanCode = code.trim().replace("#", "");
        const event = await Event_1.Event.findOne({ joinCode: cleanCode });
        if (!event) {
            res.status(404).json({ message: "Event with this join code not found" });
            return;
        }
        const participant_count = await Participant_1.Participant.countDocuments({ eventId: event._id });
        const activity_count = await Activity_1.Activity.countDocuments({ eventId: event._id });
        res.json({
            ...event.toObject(),
            id: event._id,
            participant_count,
            activity_count,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getEventByCode = getEventByCode;
const createEvent = async (req, res) => {
    try {
        const { title, description, settings, theme, duration } = req.body;
        if (!title || !title.trim()) {
            res.status(400).json({ message: "Event title is required" });
            return;
        }
        const joinCode = await generateJoinCode();
        const eventDuration = Number(duration) || 30;
        const event = await Event_1.Event.create({
            title: title.trim(),
            description: description || "",
            joinCode,
            status: "WAITING",
            duration: eventDuration,
            startedAt: null,
            endsAt: null,
            stoppedAt: null,
            theme: theme || "dark",
            settings: {
                require_name: true,
                allow_anonymous: false,
                show_live_results: true,
                ...settings,
            },
            createdBy: req.user?.id || undefined,
        });
        res.status(201).json({
            ...event.toObject(),
            id: event._id,
            participant_count: 0,
            activity_count: 0,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createEvent = createEvent;
const updateEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await Event_1.Event.findByIdAndUpdate(id, req.body, { new: true });
        if (!updated) {
            res.status(404).json({ message: "Event not found" });
            return;
        }
        res.json({ ...updated.toObject(), id: updated._id });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateEvent = updateEvent;
const startEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const event = await Event_1.Event.findById(id);
        if (!event) {
            res.status(404).json({ message: "Event not found" });
            return;
        }
        const startedAt = new Date();
        // The Event remains LIVE indefinitely without a countdown or auto-expiry
        event.status = "LIVE";
        event.startedAt = startedAt;
        event.endsAt = null;
        event.stoppedAt = null;
        await event.save();
        const payload = {
            eventId: event._id.toString(),
            status: "LIVE",
            startedAt,
            serverTime: new Date(),
        };
        (0, socketHandler_1.emitToEventRoom)(event._id.toString(), "event:started", payload);
        res.json({
            ...event.toObject(),
            id: event._id,
            serverTime: new Date(),
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.startEvent = startEvent;
const stopEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const event = await Event_1.Event.findById(id);
        if (!event) {
            res.status(404).json({ message: "Event not found" });
            return;
        }
        const stoppedAt = new Date();
        event.status = "ENDED";
        event.stoppedAt = stoppedAt;
        event.activeActivityId = null;
        await event.save();
        // Rule 7: Event STOP should end/disable any currently running activity appropriately
        const activeActivities = await Activity_1.Activity.find({
            eventId: event._id,
            status: { $in: ["active", "LIVE", "live"] },
        });
        for (const act of activeActivities) {
            act.status = "ENDED";
            act.stoppedAt = stoppedAt;
            await act.save();
            (0, socketHandler_1.emitToEventRoom)(event._id.toString(), "activity:closed", {
                activityId: act._id.toString(),
                status: "ENDED",
                stoppedAt,
                serverTime: stoppedAt,
            });
        }
        const payload = {
            eventId: event._id.toString(),
            status: "ENDED",
            stoppedAt,
            reason: "admin_stopped",
            serverTime: new Date(),
        };
        (0, socketHandler_1.emitToEventRoom)(event._id.toString(), "event:ended", payload);
        res.json({
            ...event.toObject(),
            id: event._id,
            serverTime: new Date(),
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.stopEvent = stopEvent;
const getEventStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const event = await Event_1.Event.findById(id);
        if (!event) {
            res.status(404).json({ message: "Event not found" });
            return;
        }
        const serverTime = new Date();
        res.json({
            id: event._id,
            status: event.status,
            startedAt: event.startedAt,
            endsAt: event.endsAt,
            stoppedAt: event.stoppedAt,
            serverTime,
            activeActivityId: event.activeActivityId,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getEventStatus = getEventStatus;
const deleteEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const activities = await Activity_1.Activity.find({ eventId: id });
        const activityIds = activities.map((a) => a._id);
        // Clean up all nested response records
        if (activityIds.length > 0) {
            await PollResponse_1.PollResponse.deleteMany({ activityId: { $in: activityIds } });
            await WordCloudResponse_1.WordCloudResponse.deleteMany({ activityId: { $in: activityIds } });
            await QuizResponse_1.QuizResponse.deleteMany({ activityId: { $in: activityIds } });
        }
        await Event_1.Event.findByIdAndDelete(id);
        await Activity_1.Activity.deleteMany({ eventId: id });
        await Participant_1.Participant.deleteMany({ eventId: id });
        (0, socketHandler_1.emitToEventRoom)(id, "event:deleted", { eventId: id });
        res.json({ message: "Event and all associated records deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteEvent = deleteEvent;
const joinEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, sessionToken } = req.body;
        const event = await Event_1.Event.findById(id);
        if (!event) {
            res.status(404).json({ message: "Event not found" });
            return;
        }
        const token = sessionToken || "sess_" + Math.random().toString(36).substring(2, 12);
        let participant = await Participant_1.Participant.findOne({ eventId: event._id, sessionToken: token });
        if (participant) {
            if (name && name.trim()) {
                participant.name = name.trim();
                await participant.save();
            }
        }
        else {
            participant = await Participant_1.Participant.create({
                eventId: event._id,
                name: name?.trim() || "Participant",
                email: email?.trim(),
                sessionToken: token,
            });
        }
        const totalCount = await Participant_1.Participant.countDocuments({ eventId: event._id });
        // Socket.IO Emit: participant:joined and participants:updated
        (0, socketHandler_1.emitToEventRoom)(event._id.toString(), "participant:joined", {
            participant: {
                id: participant._id,
                name: participant.name,
                joinedAt: participant.joinedAt,
            },
            count: totalCount,
        });
        (0, socketHandler_1.emitToEventRoom)(event._id.toString(), "participants:updated", {
            count: totalCount,
        });
        res.json({
            participant: {
                id: participant._id,
                name: participant.name,
                email: participant.email,
                session_token: participant.sessionToken,
                joined_at: participant.joinedAt,
            },
            event: {
                ...event.toObject(),
                id: event._id,
            },
            count: totalCount,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.joinEvent = joinEvent;
const getParticipants = async (req, res) => {
    try {
        const { id } = req.params;
        const participants = await Participant_1.Participant.find({ eventId: id }).sort({ joinedAt: -1 });
        res.json(participants.map((p) => ({
            id: p._id,
            name: p.name,
            email: p.email,
            session_token: p.sessionToken,
            joined_at: p.joinedAt,
        })));
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getParticipants = getParticipants;
const checkAndEndExpiredEvents = async () => {
    // Event duration does not auto-end events anymore.
    // Events stay LIVE indefinitely until manually stopped by Admin.
};
exports.checkAndEndExpiredEvents = checkAndEndExpiredEvents;
