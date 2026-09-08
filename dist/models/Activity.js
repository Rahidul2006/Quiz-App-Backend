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
exports.Activity = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const PollOptionSchema = new mongoose_1.Schema({
    text: { type: String, required: true },
    order_index: { type: Number, default: 0 },
}, { _id: true });
const QuizOptionSchema = new mongoose_1.Schema({
    option_text: { type: String, required: true },
    is_correct: { type: Boolean, default: false },
    order_index: { type: Number, default: 0 },
}, { _id: true });
const QuizQuestionSchema = new mongoose_1.Schema({
    question_text: { type: String, required: true },
    time_limit_sec: { type: Number, default: 15 },
    points: { type: Number, default: 1000 },
    explanation: { type: String, default: "" },
    order_index: { type: Number, default: 0 },
    options: [QuizOptionSchema],
}, { _id: true });
const ActivitySchema = new mongoose_1.Schema({
    eventId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Event",
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: ["poll", "word_cloud", "quiz"],
        required: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    status: {
        type: String,
        enum: ["WAITING", "LIVE", "ENDED", "PAUSED", "draft", "active", "ended", "waiting", "live", "paused"],
        default: "WAITING",
    },
    duration: {
        type: Number,
        default: 30, // in seconds
    },
    startedAt: {
        type: Date,
        default: null,
    },
    endsAt: {
        type: Date,
        default: null,
    },
    stoppedAt: {
        type: Date,
        default: null,
    },
    pausedAt: {
        type: Date,
        default: null,
    },
    remainingSeconds: {
        type: Number,
        default: null,
    },
    orderIndex: {
        type: Number,
        default: 0,
    },
    settings: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
    activeQuestionIndex: {
        type: Number,
        default: 0,
    },
    options: [PollOptionSchema],
    questions: [QuizQuestionSchema],
}, {
    timestamps: true,
});
const inMemoryStore_1 = require("../config/inMemoryStore");
const MongooseActivity = mongoose_1.default.model("Activity", ActivitySchema);
exports.Activity = (0, inMemoryStore_1.createModelProxy)(MongooseActivity, inMemoryStore_1.memoryActivities);
