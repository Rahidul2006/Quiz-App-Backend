import mongoose, { Document, Schema } from "mongoose";
import { createModelProxy, memoryJudgingTeams } from "../config/inMemoryStore";

export interface IJudgingTeam extends Document {
  roundId: mongoose.Types.ObjectId;
  teamCode: string;
  teamName: string;
  projectName: string;
  members: string;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

const JudgingTeamSchema = new Schema<IJudgingTeam>(
  {
    roundId: {
      type: Schema.Types.ObjectId,
      ref: "JudgingRound",
      required: true,
      index: true,
    },
    teamCode: {
      type: String,
      required: true,
      trim: true,
    },
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    projectName: {
      type: String,
      required: true,
      trim: true,
    },
    members: {
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

JudgingTeamSchema.index({ roundId: 1, teamCode: 1 }, { unique: true });

const MongooseJudgingTeam = mongoose.model<IJudgingTeam>("JudgingTeam", JudgingTeamSchema);
export const JudgingTeam = createModelProxy<mongoose.Model<IJudgingTeam>>(
  MongooseJudgingTeam,
  memoryJudgingTeams
);
