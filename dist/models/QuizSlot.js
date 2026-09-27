"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuizSlot = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const inMemoryStore_1 = require("../config/inMemoryStore");
const QuizSlotSchema = new mongoose_1.Schema({
    activityId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Activity",
        required: true,
        index: true,
    },
    eventId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Event",
        required: true,
        index: true,
    },
    slotLabel: {
        type: String,
        required: true,
        trim: true,
    },
    participantId: {
        type: String,
        required: true,
    },
    participantName: {
        type: String,
        required: true,
        default: "Participant",
    },
    claimedAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
});
// Enforce: one participant per slot per activity
QuizSlotSchema.index({ activityId: 1, slotLabel: 1 }, { unique: true });
// Enforce: one slot per participant per activity
QuizSlotSchema.index({ activityId: 1, participantId: 1 }, { unique: true });
const MongooseQuizSlot = mongoose_1.default.model("QuizSlot", QuizSlotSchema);
exports.QuizSlot = (0, inMemoryStore_1.createModelProxy)(MongooseQuizSlot, inMemoryStore_1.memoryQuizSlots);
