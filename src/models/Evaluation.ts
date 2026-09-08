import mongoose, { Document, Schema } from "mongoose";
import { createModelProxy, memoryEvaluations } from "../config/inMemoryStore";

export interface ICriterionScore {
  criterionId: mongoose.Types.ObjectId;
  score: number;
}

export interface IEvaluation extends Document {
  roundId: mongoose.Types.ObjectId;
  judgeId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  status: "DRAFT" | "SUBMITTED";
  criteriaScores: ICriterionScore[];
  totalScore: number;
  comments: string;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CriterionScoreSchema = new Schema(
  {
    criterionId: {
      type: Schema.Types.ObjectId,
      ref: "JudgingCriterion",
      required: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const EvaluationSchema = new Schema<IEvaluation>(
  {
    roundId: {
      type: Schema.Types.ObjectId,
      ref: "JudgingRound",
      required: true,
      index: true,
    },
    judgeId: {
      type: Schema.Types.ObjectId,
      ref: "Judge",
      required: true,
      index: true,
    },
    teamId: {
      type: Schema.Types.ObjectId,
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
  },
  {
    timestamps: true,
  }
);

EvaluationSchema.index({ roundId: 1, judgeId: 1, teamId: 1 }, { unique: true });

const MongooseEvaluation = mongoose.model<IEvaluation>("Evaluation", EvaluationSchema);
export const Evaluation = createModelProxy<mongoose.Model<IEvaluation>>(
  MongooseEvaluation,
  memoryEvaluations
);
