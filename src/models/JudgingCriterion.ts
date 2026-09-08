import mongoose, { Document, Schema } from "mongoose";
import { createModelProxy, memoryJudgingCriteria } from "../config/inMemoryStore";

export interface IJudgingCriterion extends Document {
  roundId: mongoose.Types.ObjectId;
  name: string;
  maxScore: number;
  description: string;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

const JudgingCriterionSchema = new Schema<IJudgingCriterion>(
  {
    roundId: {
      type: Schema.Types.ObjectId,
      ref: "JudgingRound",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    maxScore: {
      type: Number,
      required: true,
      min: 1,
      default: 20,
    },
    description: {
      type: String,
      default: "",
    },
    orderIndex: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const MongooseJudgingCriterion = mongoose.model<IJudgingCriterion>(
  "JudgingCriterion",
  JudgingCriterionSchema
);
export const JudgingCriterion = createModelProxy<mongoose.Model<IJudgingCriterion>>(
  MongooseJudgingCriterion,
  memoryJudgingCriteria
);
