import mongoose, { Document, Schema } from "mongoose";
import { ActivitySettings, ActivityStatus, ActivityType, IPollOption, IQuizQuestion } from "../types";

export interface IActivity extends Document {
  eventId: mongoose.Types.ObjectId;
  type: ActivityType;
  title: string;
  status: ActivityStatus;
  duration: number; // in seconds, default 30
  startedAt?: Date | null;
  endsAt?: Date | null;
  stoppedAt?: Date | null;
  pausedAt?: Date | null;
  remainingSeconds?: number | null;
  orderIndex: number;
  settings: ActivitySettings;
  activeQuestionIndex: number;
  options?: IPollOption[];
  questions?: IQuizQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

const PollOptionSchema = new Schema(
  {
    text: { type: String, required: true },
    order_index: { type: Number, default: 0 },
  },
  { _id: true }
);

const QuizOptionSchema = new Schema(
  {
    option_text: { type: String, required: true },
    is_correct: { type: Boolean, default: false },
    order_index: { type: Number, default: 0 },
  },
  { _id: true }
);

const QuizQuestionSchema = new Schema(
  {
    question_text: { type: String, required: true },
    time_limit_sec: { type: Number, default: 15 },
    points: { type: Number, default: 1000 },
    explanation: { type: String, default: "" },
    order_index: { type: Number, default: 0 },
    options: [QuizOptionSchema],
  },
  { _id: true }
);

const ActivitySchema = new Schema<IActivity>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["poll", "word_cloud", "quiz"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["WAITING", "LIVE", "ENDED", "PAUSED", "draft", "active", "ended", "waiting", "live", "paused"],
      default: "WAITING",
    },
    duration: {
      type: Number,
      default: 30, // in seconds
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endsAt: {
      type: Date,
      default: null,
    },
    stoppedAt: {
      type: Date,
      default: null,
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    remainingSeconds: {
      type: Number,
      default: null,
    },
    orderIndex: {
      type: Number,
      default: 0,
    },
    settings: {
      type: Schema.Types.Mixed,
      default: {},
    },
    activeQuestionIndex: {
      type: Number,
      default: 0,
    },
    options: [PollOptionSchema],
    questions: [QuizQuestionSchema],
  },
  {
    timestamps: true,
  }
);

import { createModelProxy, memoryActivities } from "../config/inMemoryStore";

const MongooseActivity = mongoose.model<IActivity>("Activity", ActivitySchema);
export const Activity = createModelProxy<mongoose.Model<IActivity>>(MongooseActivity, memoryActivities);

