"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitToEventRoom = exports.getIO = exports.initSocket = void 0;
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
