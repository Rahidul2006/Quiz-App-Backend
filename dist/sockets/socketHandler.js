"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitToJudgingRoom = exports.emitToEventRoom = exports.getIO = exports.initSocket = void 0;
let ioInstance = null;
const initSocket = (io) => {
    ioInstance = io;
    io.on("connection", (socket) => {
        // Join event room
        socket.on("join:event", (eventId) => {
            if (eventId) {
                const room = `event:${eventId}`;
                socket.join(room);
            }
        });
        // Leave event room
        socket.on("leave:event", (eventId) => {
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
exports.initSocket = initSocket;
const getIO = () => {
    if (!ioInstance) {
        throw new Error("Socket.io has not been initialized!");
    }
    return ioInstance;
};
exports.getIO = getIO;
// Real-Time Event Dispatchers
const emitToEventRoom = (eventId, eventName, data) => {
    if (ioInstance) {
        ioInstance.to(`event:${eventId}`).emit(eventName, data);
    }
};
exports.emitToEventRoom = emitToEventRoom;
// Global Judging Room Dispatcher
const emitToJudgingRoom = (eventName, data) => {
    if (ioInstance) {
        ioInstance.to("judging:global").emit(eventName, data);
    }
};
exports.emitToJudgingRoom = emitToJudgingRoom;
