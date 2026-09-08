import mongoose, { Document, Schema } from "mongoose";

export interface IQuizResponse extends Document {
  activityId: mongoose.Types.ObjectId;
  questionId: string;
  optionId: string;
  participantId: string;
  participantName: string;
  isCorrect: boolean;
  timeTakenMs: number;
  scoreAwarded: number;
  createdAt: Date;
}

const QuizResponseSchema = new Schema<IQuizResponse>(
  {
    activityId: {
      type: Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
      index: true,
    },
    questionId: {
      type: String,
      required: true,
      index: true,
    },
    optionId: {
      type: String,
      required: true,
    },
    participantId: {
      type: String,
      required: true,
      index: true,
    },
    participantName: {
      type: String,
      required: true,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
    timeTakenMs: {
      type: Number,
      default: 0,
    },
    scoreAwarded: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// One answer per question per participant
QuizResponseSchema.index({ questionId: 1, participantId: 1 }, { unique: true });

import { createModelProxy, memoryQuizResponses } from "../config/inMemoryStore";

const MongooseQuizResponse = mongoose.model<IQuizResponse>("QuizResponse", QuizResponseSchema);
export const QuizResponse = createModelProxy<mongoose.Model<IQuizResponse>>(
  MongooseQuizResponse,
  memoryQuizResponses
);

