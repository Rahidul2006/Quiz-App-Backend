import mongoose, { Document, Schema } from "mongoose";

export interface IPollResponse extends Document {
  activityId: mongoose.Types.ObjectId;
  optionId?: mongoose.Types.ObjectId | string;
  participantId: string;
  participantName: string;
  textResponse?: string;
  ratingValue?: number;
  createdAt: Date;
}

const PollResponseSchema = new Schema<IPollResponse>(
  {
    activityId: {
      type: Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
      index: true,
    },
    optionId: {
      type: Schema.Types.Mixed,
    },
    participantId: {
      type: String,
      required: true,
      index: true,
    },
    participantName: {
      type: String,
      default: "Participant",
    },
    textResponse: {
      type: String,
    },
    ratingValue: {
      type: Number,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

import { createModelProxy, memoryPollResponses } from "../config/inMemoryStore";

const MongoosePollResponse = mongoose.model<IPollResponse>("PollResponse", PollResponseSchema);
export const PollResponse = createModelProxy<mongoose.Model<IPollResponse>>(MongoosePollResponse, memoryPollResponses);

