import mongoose, { Document, Schema } from "mongoose";

export interface IParticipant extends Document {
  eventId: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  sessionToken: string;
  joinedAt: Date;
}

const ParticipantSchema = new Schema<IParticipant>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    sessionToken: {
      type: String,
      required: true,
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

ParticipantSchema.index({ eventId: 1, sessionToken: 1 }, { unique: true });

import { createModelProxy, memoryParticipants } from "../config/inMemoryStore";

const MongooseParticipant = mongoose.model<IParticipant>("Participant", ParticipantSchema);
export const Participant = createModelProxy<mongoose.Model<IParticipant>>(MongooseParticipant, memoryParticipants);

