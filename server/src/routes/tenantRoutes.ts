import express from "express";
import { requireSelf } from "../middleware/authMiddleware";
import {
  getTenant,
  createTenant,
  updateTenant,
  getCurrentResidences,
  addFavoriteProperty,
  removeFavoriteProperty,
} from "../controllers/tenantControllers";

// Mounted behind authMiddleware(["tenant"]) in index.ts.
// Every :cognitoId route additionally requires the id to be the caller's own.
const router = express.Router();

router.post("/", createTenant);
router.get("/:cognitoId", requireSelf(), getTenant);
router.put("/:cognitoId", requireSelf(), updateTenant);
router.get("/:cognitoId/current-residences", requireSelf(), getCurrentResidences);
router.post("/:cognitoId/favorites/:propertyId", requireSelf(), addFavoriteProperty);
router.delete("/:cognitoId/favorites/:propertyId", requireSelf(), removeFavoriteProperty);

export default router;
