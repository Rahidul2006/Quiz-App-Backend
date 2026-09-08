import mongoose, { Document, Schema } from "mongoose";
import { createModelProxy, memoryJudgeAssignments } from "../config/inMemoryStore";

export interface IJudgeAssignment extends Document {
  roundId: mongoose.Types.ObjectId;
  judgeId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const JudgeAssignmentSchema = new Schema<IJudgeAssignment>(
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
  },
  {
    timestamps: true,
  }
);

JudgeAssignmentSchema.index({ roundId: 1, judgeId: 1, teamId: 1 }, { unique: true });

const MongooseJudgeAssignment = mongoose.model<IJudgeAssignment>(
  "JudgeAssignment",
  JudgeAssignmentSchema
);
export const JudgeAssignment = createModelProxy<mongoose.Model<IJudgeAssignment>>(
  MongooseJudgeAssignment,
  memoryJudgeAssignments
);
