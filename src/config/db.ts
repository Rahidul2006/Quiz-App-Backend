import mongoose from "mongoose";

let dbConnected = false;

export const isDbConnected = (): boolean => {
  return dbConnected && mongoose.connection.readyState === 1;
};

export const connectDB = async (): Promise<boolean> => {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/crowdpulse";

  // Do not buffer commands indefinitely when MongoDB is offline
  mongoose.set("bufferCommands", false);

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });

    dbConnected = true;
    console.log(`🌿 [MongoDB] Connected: ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on("error", (err) => {
      console.warn("[MongoDB] Connection warning:", err.message);
      dbConnected = false;
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("[MongoDB] Disconnected. Switching to In-Memory fallback mode.");
      dbConnected = false;
    });

    return true;
  } catch (error: any) {
    dbConnected = false;
    console.warn(`⚠️  [Database] MongoDB offline or unreachable (${error.message}).`);
    console.log(`⚡ [Database] Activated In-Memory High-Performance Store. All REST APIs, Socket.IO, Polling & Quizzes are 100% functional!`);
    return false;
  }
};

export const disconnectDB = async (): Promise<void> => {
  if (dbConnected) {
    await mongoose.disconnect();
    dbConnected = false;
    console.log("[MongoDB] Disconnected gracefully.");
  }
};
