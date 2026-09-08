import mongoose, { Document, Schema } from "mongoose";
import { EventSettings, EventStatus } from "../types";

export interface IEvent extends Document {
  title: string;
  description?: string;
  joinCode: string;
  status: EventStatus;
  theme?: string;
  duration?: number; // In minutes, default 30
  startedAt?: Date | null;
  endsAt?: Date | null;
  stoppedAt?: Date | null;
  settings: EventSettings;
  activeActivityId?: mongoose.Types.ObjectId | null;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<IEvent>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    joinCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["WAITING", "LIVE", "ENDED", "PAUSED", "waiting", "live", "ended", "draft", "active", "paused"],
      default: "WAITING",
    },
    duration: {
      type: Number,
      default: 30, // 30 minutes default
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
    theme: {
      type: String,
      default: "dark",
    },
    settings: {
      require_name: { type: Boolean, default: true },
      allow_anonymous: { type: Boolean, default: false },
      show_live_results: { type: Boolean, default: true },
    },
    activeActivityId: {
      type: Schema.Types.ObjectId,
      ref: "Activity",
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

import { createModelProxy, memoryEvents } from "../config/inMemoryStore";

const MongooseEvent = mongoose.model<IEvent>("Event", EventSchema);
export const Event = createModelProxy<mongoose.Model<IEvent>>(MongooseEvent, memoryEvents);

