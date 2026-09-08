import { Router } from "express";
import {
  getActivityById,
  updateActivity,
  deleteActivity,
  launchActivity,
  stopActivity,
  pauseActivity,
  resumeActivity,
  restartActivity,
  submitResponse,
  getResults,
  getParticipantResponse,
} from "../controllers/activityController";
import { requireAdmin } from "../middleware/authMiddleware";

const router = Router();

router.get("/:id", getActivityById);
router.patch("/:id", requireAdmin, updateActivity);
router.delete("/:id", requireAdmin, deleteActivity);
router.post("/:id/launch", requireAdmin, launchActivity);
router.post("/:id/stop", requireAdmin, stopActivity);
router.post("/:id/pause", requireAdmin, pauseActivity);
router.post("/:id/resume", requireAdmin, resumeActivity);
router.post("/:id/restart", requireAdmin, restartActivity);
router.post("/:id/respond", submitResponse);
router.get("/:id/results", getResults);
router.get("/:id/participant-response", getParticipantResponse);

export default router;


