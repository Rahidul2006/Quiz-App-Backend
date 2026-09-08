"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const eventController_1 = require("../controllers/eventController");
const activityController_1 = require("../controllers/activityController");
const router = (0, express_1.Router)();
router.get("/", eventController_1.getEvents);
router.post("/", eventController_1.createEvent);
router.get("/code/:code", eventController_1.getEventByCode);
router.get("/:id", eventController_1.getEventById);
router.patch("/:id", eventController_1.updateEvent);
router.delete("/:id", eventController_1.deleteEvent);
// Participant routes
router.post("/:id/join", eventController_1.joinEvent);
router.get("/:id/participants", eventController_1.getParticipants);
// Activity nested routes
router.get("/:eventId/activities", activityController_1.getActivities);
router.post("/:eventId/activities", activityController_1.createActivity);
exports.default = router;
