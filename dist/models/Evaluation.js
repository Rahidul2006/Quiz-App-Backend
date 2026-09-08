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
exports.Evaluation = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const inMemoryStore_1 = require("../config/inMemoryStore");
const CriterionScoreSchema = new mongoose_1.Schema({
    criterionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "JudgingCriterion",
        required: true,
    },
    score: {
        type: Number,
        required: true,
        min: 0,
    },
}, { _id: false });
const EvaluationSchema = new mongoose_1.Schema({
    roundId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "JudgingRound",
        required: true,
        index: true,
    },
    judgeId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Judge",
        required: true,
        index: true,
    },
    teamId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "JudgingTeam",
        required: true,
        index: true,
    },
    status: {
        type: String,
        enum: ["DRAFT", "SUBMITTED"],
        default: "DRAFT",
        index: true,
    },
    criteriaScores: [CriterionScoreSchema],
    totalScore: {
        type: Number,
        default: 0,
    },
    comments: {
        type: String,
        default: "",
    },
    submittedAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
});
EvaluationSchema.index({ roundId: 1, judgeId: 1, teamId: 1 }, { unique: true });
const MongooseEvaluation = mongoose_1.default.model("Evaluation", EvaluationSchema);
exports.Evaluation = (0, inMemoryStore_1.createModelProxy)(MongooseEvaluation, inMemoryStore_1.memoryEvaluations);
