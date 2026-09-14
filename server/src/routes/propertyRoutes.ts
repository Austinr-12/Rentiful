import express from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/authMiddleware";
import { HttpError } from "../lib/errors";
import {
  getProperties,
  getProperty,
  createProperty,
  getPropertyLeases,
} from "../controllers/propertyControllers";

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_PHOTOS, fileSize: MAX_PHOTO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new HttpError(400, "Only image uploads are allowed"));
  },
});

const router = express.Router();

router.get("/", getProperties);
router.get("/:id", getProperty);
router.get("/:id/leases", authMiddleware(["manager"]), getPropertyLeases);
router.post(
  "/",
  authMiddleware(["manager"]),
  upload.array("photos", MAX_PHOTOS),
  createProperty
);

export default router;
