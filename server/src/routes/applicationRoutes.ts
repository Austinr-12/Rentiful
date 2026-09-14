import express from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  createApplication,
  listApplications,
  updateApplicationStatus,
} from "../controllers/applicationControllers";

const router = express.Router();

// Results are scoped to the caller inside the controller.
router.get("/", authMiddleware(["manager", "tenant"]), listApplications);
router.post("/", authMiddleware(["tenant"]), createApplication);
router.put("/:id/status", authMiddleware(["manager"]), updateApplicationStatus);

export default router;
