import { Router } from "express";
import {
  getEvents,
  getEventById,
  getEventByCode,
  createEvent,
  updateEvent,
  deleteEvent,
  joinEvent,
  getParticipants,
} from "../controllers/eventController";
import { getActivities, createActivity } from "../controllers/activityController";

const router = Router();

router.get("/", getEvents);
router.post("/", createEvent);
router.get("/code/:code", getEventByCode);
router.get("/:id", getEventById);
router.patch("/:id", updateEvent);
router.delete("/:id", deleteEvent);

// Participant routes
router.post("/:id/join", joinEvent);
router.get("/:id/participants", getParticipants);

// Activity nested routes
router.get("/:eventId/activities", getActivities);
router.post("/:eventId/activities", createActivity);

export default router;
