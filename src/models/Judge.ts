import mongoose, { Document, Schema } from "mongoose";
import { createModelProxy, memoryJudges } from "../config/inMemoryStore";

export interface IJudge extends Document {
  name: string;
  username: string;
  passwordHash: string;
  roundId?: mongoose.Types.ObjectId;
  weight: number;
  tieBreakPriority: number;
  status: "active" | "disabled";
  role: "judge";
  createdAt: Date;
  updatedAt: Date;
}

const JudgeSchema = new Schema<IJudge>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    roundId: {
      type: Schema.Types.ObjectId,
      ref: "JudgingRound",
      default: null,
      index: true,
    },
    weight: {
      type: Number,
      default: 1.0,
    },
    tieBreakPriority: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true,
    },
    role: {
      type: String,
      default: "judge",
    },
  },
  {
    timestamps: true,
  }
);

const MongooseJudge = mongoose.model<IJudge>("Judge", JudgeSchema);
export const Judge = createModelProxy<mongoose.Model<IJudge>>(MongooseJudge, memoryJudges);
