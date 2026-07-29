import { Router, Request } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import {
  handleTargetUpload,
  handleCheckTargetMonth,
} from "../controllers/targetUploadControllers";
import { verifyToken, requireAdmin } from "../middleware/auth";

const uploadDir = path.resolve("uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = [".xlsx", ".xls", ".csv"];
  if (!allowed.includes(ext)) {
    return cb(new Error("Only .xlsx, .xls, or .csv files are allowed"));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

// GET /api/targets/check?target_month=YYYY-MM-01
// Lets the frontend warn "you already uploaded this month, overwrite?"
// before actually submitting the file.
router.get("/check", verifyToken, requireAdmin, handleCheckTargetMonth);

// verifyToken -> requireAdmin -> multer (single field) -> handler
router.post(
  "/",
  verifyToken,
  requireAdmin,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  handleTargetUpload,
);

export default router;
