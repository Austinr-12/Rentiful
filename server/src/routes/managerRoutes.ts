import express from "express";
import { requireSelf } from "../middleware/authMiddleware";
import {
  getManager,
  createManager,
  updateManager,
  getManagerProperties,
} from "../controllers/managerControllers";

// Mounted behind authMiddleware(["manager"]) in index.ts.
// Every :cognitoId route additionally requires the id to be the caller's own.
const router = express.Router();

router.post("/", createManager);
router.get("/:cognitoId", requireSelf(), getManager);
router.put("/:cognitoId", requireSelf(), updateManager);
router.get("/:cognitoId/properties", requireSelf(), getManagerProperties);

export default router;
