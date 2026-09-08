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
  startEvent,
  stopEvent,
  getEventStatus,
} from "../controllers/eventController";
import { getActivities, createActivity } from "../controllers/activityController";
import { requireAdmin } from "../middleware/authMiddleware";

const router = Router();

router.get("/", requireAdmin, getEvents);
router.post("/", requireAdmin, createEvent);
router.get("/code/:code", getEventByCode);
router.get("/:id", getEventById);
router.get("/:id/status", getEventStatus);
router.post("/:id/start", requireAdmin, startEvent);
router.post("/:id/stop", requireAdmin, stopEvent);
router.patch("/:id", requireAdmin, updateEvent);
router.delete("/:id", requireAdmin, deleteEvent);

// Participant routes (public)
router.post("/:id/join", joinEvent);
router.get("/:id/participants", getParticipants);

// Activity nested routes
router.get("/:eventId/activities", getActivities);
router.post("/:eventId/activities", requireAdmin, createActivity);

export default router;

