import { Server as SocketIOServer, Socket } from "socket.io";

let ioInstance: SocketIOServer | null = null;

export const initSocket = (io: SocketIOServer): void => {
  ioInstance = io;

  io.on("connection", (socket: Socket) => {
    // Join event room
    socket.on("join:event", (eventId: string) => {
      if (eventId) {
        const room = `event:${eventId}`;
        socket.join(room);
      }
    });

    // Leave event room
    socket.on("leave:event", (eventId: string) => {
      if (eventId) {
        const room = `event:${eventId}`;
        socket.leave(room);
      }
    });

    // Join global judging room (for judges & admin)
    socket.on("join:judging", () => {
      socket.join("judging:global");
    });

    // Leave global judging room
    socket.on("leave:judging", () => {
      socket.leave("judging:global");
    });

    socket.on("disconnect", () => {
      // Disconnected cleanly
    });
  });
};

export const getIO = (): SocketIOServer => {
  if (!ioInstance) {
    throw new Error("Socket.io has not been initialized!");
  }
  return ioInstance;
};

// Real-Time Event Dispatchers
export const emitToEventRoom = (eventId: string, eventName: string, data: any): void => {
  if (ioInstance) {
    ioInstance.to(`event:${eventId}`).emit(eventName, data);
  }
};

// Global Judging Room Dispatcher
export const emitToJudgingRoom = (eventName: string, data: any): void => {
  if (ioInstance) {
    ioInstance.to("judging:global").emit(eventName, data);
  }
};
