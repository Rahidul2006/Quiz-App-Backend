import mongoose, { Document, Schema } from "mongoose";

export interface IWordCloudResponse extends Document {
  activityId: mongoose.Types.ObjectId;
  participantId: string;
  word: string;
  normalizedWord: string;
  createdAt: Date;
}

const WordCloudResponseSchema = new Schema<IWordCloudResponse>(
  {
    activityId: {
      type: Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
      index: true,
    },
    participantId: {
      type: String,
      required: true,
    },
    word: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedWord: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

import { createModelProxy, memoryWordCloudResponses } from "../config/inMemoryStore";

const MongooseWordCloudResponse = mongoose.model<IWordCloudResponse>(
  "WordCloudResponse",
  WordCloudResponseSchema
);
export const WordCloudResponse = createModelProxy<mongoose.Model<IWordCloudResponse>>(
  MongooseWordCloudResponse,
  memoryWordCloudResponses
);

