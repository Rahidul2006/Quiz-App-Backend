"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const eventController_1 = require("../controllers/eventController");
const activityController_1 = require("../controllers/activityController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.get("/", authMiddleware_1.requireAdmin, eventController_1.getEvents);
router.post("/", authMiddleware_1.requireAdmin, eventController_1.createEvent);
router.get("/code/:code", eventController_1.getEventByCode);
router.get("/:id", eventController_1.getEventById);
router.get("/:id/status", eventController_1.getEventStatus);
router.post("/:id/start", authMiddleware_1.requireAdmin, eventController_1.startEvent);
router.post("/:id/stop", authMiddleware_1.requireAdmin, eventController_1.stopEvent);
router.patch("/:id", authMiddleware_1.requireAdmin, eventController_1.updateEvent);
router.delete("/:id", authMiddleware_1.requireAdmin, eventController_1.deleteEvent);
// Participant routes (public)
router.post("/:id/join", eventController_1.joinEvent);
router.get("/:id/participants", eventController_1.getParticipants);
// Activity nested routes
router.get("/:eventId/activities", activityController_1.getActivities);
router.post("/:eventId/activities", authMiddleware_1.requireAdmin, activityController_1.createActivity);
exports.default = router;
