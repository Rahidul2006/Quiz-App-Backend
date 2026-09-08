import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  fullName: string;
  role: "admin" | "user";
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "admin",
    },
  },
  {
    timestamps: true,
  }
);

import { createModelProxy, memoryUsers } from "../config/inMemoryStore";

const MongooseUser = mongoose.model<IUser>("User", UserSchema);
export const User = createModelProxy<mongoose.Model<IUser>>(MongooseUser, memoryUsers);

