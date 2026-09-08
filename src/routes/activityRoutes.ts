import { Router } from "express";
import {
  getActivityById,
  updateActivity,
  deleteActivity,
  launchActivity,
  stopActivity,
  submitResponse,
  getResults,
  getParticipantResponse,
} from "../controllers/activityController";

const router = Router();

router.get("/:id", getActivityById);
router.patch("/:id", updateActivity);
router.delete("/:id", deleteActivity);
router.post("/:id/launch", launchActivity);
router.post("/:id/stop", stopActivity);
router.post("/:id/respond", submitResponse);
router.get("/:id/results", getResults);
router.get("/:id/participant-response", getParticipantResponse);

export default router;

