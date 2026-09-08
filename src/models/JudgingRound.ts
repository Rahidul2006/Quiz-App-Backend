import mongoose, { Document, Schema } from "mongoose";
import { createModelProxy, memoryJudgingRounds } from "../config/inMemoryStore";

export interface IJudgingRound extends Document {
  name: string;
  description: string;
  eventId?: mongoose.Types.ObjectId;
  status: "draft" | "active" | "locked" | "completed";
  evaluationMode: "all" | "assigned";
  allowJudgeEditAfterSubmit: boolean;
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JudgingRoundSchema = new Schema<IJudgingRound>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
    status: {
      type: String,
      enum: ["draft", "active", "locked", "completed"],
      default: "active",
    },
    evaluationMode: {
      type: String,
      enum: ["all", "assigned"],
      default: "all",
    },
    allowJudgeEditAfterSubmit: {
      type: Boolean,
      default: false,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const MongooseJudgingRound = mongoose.model<IJudgingRound>("JudgingRound", JudgingRoundSchema);
export const JudgingRound = createModelProxy<mongoose.Model<IJudgingRound>>(
  MongooseJudgingRound,
  memoryJudgingRounds
);
