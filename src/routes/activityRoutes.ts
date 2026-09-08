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
import { requireAdmin } from "../middleware/authMiddleware";

const router = Router();

router.get("/:id", getActivityById);
router.patch("/:id", requireAdmin, updateActivity);
router.delete("/:id", requireAdmin, deleteActivity);
router.post("/:id/launch", requireAdmin, launchActivity);
router.post("/:id/stop", requireAdmin, stopActivity);
router.post("/:id/respond", submitResponse);
router.get("/:id/results", getResults);
router.get("/:id/participant-response", getParticipantResponse);

export default router;


