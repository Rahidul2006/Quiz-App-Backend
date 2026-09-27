import mongoose, { Document, Schema } from "mongoose";
import { createModelProxy, memoryQuizSlots } from "../config/inMemoryStore";

/**
 * QuizSlot — tracks which participant has claimed a slot for a quiz activity.
 * Each slot label can only be claimed by ONE participant (enforced by unique index).
 */
export interface IQuizSlot extends Document {
  activityId: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  slotLabel: string;    // e.g. "Team A", "Seat 1", "Group Alpha"
  participantId: string;
  participantName: string;
  claimedAt: Date;
}

const QuizSlotSchema = new Schema<IQuizSlot>(
  {
    activityId: {
      type: Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
      index: true,
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    slotLabel: {
      type: String,
      required: true,
      trim: true,
    },
    participantId: {
      type: String,
      required: true,
    },
    participantName: {
      type: String,
      required: true,
      default: "Participant",
    },
    claimedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce: one participant per slot per activity
QuizSlotSchema.index({ activityId: 1, slotLabel: 1 }, { unique: true });
// Enforce: one slot per participant per activity
QuizSlotSchema.index({ activityId: 1, participantId: 1 }, { unique: true });

const MongooseQuizSlot = mongoose.model<IQuizSlot>("QuizSlot", QuizSlotSchema);
export const QuizSlot = createModelProxy<mongoose.Model<IQuizSlot>>(MongooseQuizSlot, memoryQuizSlots);
