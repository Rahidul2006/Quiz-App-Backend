"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMySlot = exports.clearQuizSlots = exports.claimQuizSlot = exports.getQuizSlots = void 0;
const Activity_1 = require("../models/Activity");
const QuizSlot_1 = require("../models/QuizSlot");
const socketHandler_1 = require("../sockets/socketHandler");
// ─── GET /activities/:id/quiz-slots ──────────────────────────────────────────
// Returns the list of admin-defined slots with occupancy info
const getQuizSlots = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        if (activity.type !== "quiz") {
            res.status(400).json({ message: "Activity is not a quiz" });
            return;
        }
        const definedSlots = activity.settings?.quiz_slots || [];
        const slotsEnabled = activity.settings?.require_slot_selection === true;
        if (!slotsEnabled || definedSlots.length === 0) {
            res.json({ slotsEnabled: false, slots: [] });
            return;
        }
        // Load claimed slots
        const claims = await QuizSlot_1.QuizSlot.find({ activityId: id });
        const slots = definedSlots.map((label) => {
            const claim = claims.find((c) => c.slotLabel === label);
            return {
                slotLabel: label,
                isClaimed: Boolean(claim),
                participantId: claim ? claim.participantId : null,
                participantName: claim ? claim.participantName : null,
            };
        });
        res.json({ slotsEnabled: true, slots });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getQuizSlots = getQuizSlots;
// ─── POST /activities/:id/quiz-slots/claim ────────────────────────────────────
// Participant claims a slot. One slot per participant, one participant per slot.
const claimQuizSlot = async (req, res) => {
    try {
        const { id } = req.params;
        const { slotLabel, participantId, participantName } = req.body;
        if (!slotLabel || !participantId) {
            res.status(400).json({ message: "slotLabel and participantId are required" });
            return;
        }
        const activity = await Activity_1.Activity.findById(id);
        if (!activity) {
            res.status(404).json({ message: "Activity not found" });
            return;
        }
        if (activity.type !== "quiz") {
            res.status(400).json({ message: "Activity is not a quiz" });
            return;
        }
        const definedSlots = activity.settings?.quiz_slots || [];
        const slotsEnabled = activity.settings?.require_slot_selection === true;
        if (!slotsEnabled) {
            res.status(400).json({ message: "Slot selection is not enabled for this quiz" });
            return;
        }
        if (!definedSlots.includes(slotLabel)) {
            res.status(400).json({ message: "Invalid slot label" });
            return;
        }
        // Check if this participant already has a slot
        const existingClaim = await QuizSlot_1.QuizSlot.findOne({
            activityId: id,
            participantId: participantId.toString(),
        });
        if (existingClaim) {
            res.json({
                success: true,
                alreadyClaimed: true,
                slot: {
                    slotLabel: existingClaim.slotLabel,
                    participantId: existingClaim.participantId,
                    participantName: existingClaim.participantName,
                },
            });
            return;
        }
        // Check if the requested slot is already taken
        const slotTaken = await QuizSlot_1.QuizSlot.findOne({
            activityId: id,
            slotLabel,
        });
        if (slotTaken) {
            res.status(409).json({ message: "This slot has already been taken by another participant." });
            return;
        }
        // Claim the slot
        const newClaim = await QuizSlot_1.QuizSlot.create({
            activityId: activity._id,
            eventId: activity.eventId,
            slotLabel,
            participantId: participantId.toString(),
            participantName: participantName || "Participant",
        });
        // Rebuild full slot list and emit update
        const claims = await QuizSlot_1.QuizSlot.find({ activityId: id });
        const slots = definedSlots.map((label) => {
            const claim = claims.find((c) => c.slotLabel === label);
            return {
                slotLabel: label,
                isClaimed: Boolean(claim),
                participantId: claim ? claim.participantId : null,
                participantName: claim ? claim.participantName : null,
            };
        });
        (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:slots_updated", {
            activityId: activity._id.toString(),
            slots,
        });
        res.json({
            success: true,
            alreadyClaimed: false,
            slot: {
                slotLabel,
                participantId: participantId.toString(),
                participantName: participantName || "Participant",
            },
            slots,
        });
    }
    catch (error) {
        // Unique index violation: slot already taken
        if (error.code === 11000) {
            const field = error.keyValue;
            if (field?.participantId) {
                res.status(409).json({ message: "You have already claimed a slot." });
            }
            else {
                res.status(409).json({ message: "This slot has already been taken by another participant." });
            }
            return;
        }
        res.status(500).json({ message: error.message });
    }
};
exports.claimQuizSlot = claimQuizSlot;
// ─── DELETE /activities/:id/quiz-slots ────────────────────────────────────────
// Admin-only: clear all slot claims for this activity (used on restart)
const clearQuizSlots = async (req, res) => {
    try {
        const { id } = req.params;
        await QuizSlot_1.QuizSlot.deleteMany({ activityId: id });
        const activity = await Activity_1.Activity.findById(id);
        if (activity) {
            const definedSlots = activity.settings?.quiz_slots || [];
            const emptySlots = definedSlots.map((label) => ({
                slotLabel: label,
                isClaimed: false,
                participantId: null,
                participantName: null,
            }));
            (0, socketHandler_1.emitToEventRoom)(activity.eventId.toString(), "quiz:slots_updated", {
                activityId: id,
                slots: emptySlots,
            });
        }
        res.json({ success: true, message: "All slot claims cleared" });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.clearQuizSlots = clearQuizSlots;
// ─── GET /activities/:id/quiz-slots/my-slot ───────────────────────────────────
// Participant: check if they already have a slot claimed
const getMySlot = async (req, res) => {
    try {
        const { id } = req.params;
        const { participantId } = req.query;
        if (!participantId) {
            res.status(400).json({ message: "participantId is required" });
            return;
        }
        const claim = await QuizSlot_1.QuizSlot.findOne({
            activityId: id,
            participantId: participantId.toString(),
        });
        if (claim) {
            res.json({ hasClaimed: true, slotLabel: claim.slotLabel });
        }
        else {
            res.json({ hasClaimed: false, slotLabel: null });
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getMySlot = getMySlot;
