import { Router, Request } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { handleUpload } from "../controllers/uploadController";
import { verifyToken, requireAdmin } from "../middleware/auth";

// Security: create uploads dir at startup so multer never writes to a missing path
const uploadDir = path.resolve("uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    // Security: never trust originalname — it can contain path traversal (../../etc/passwd)
    // or null bytes. Use only the extension (validated below) + a random UUID.
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${randomUUID()}${ext}`;
    cb(null, safeName);
  },
});

// Only .xlsx now — the merge service (header auto-detection, SAP ID + Customer
// Name join) is built for the raw distributor exports, which are always .xlsx.
// CSV/XLS support from the old single-file flow is intentionally dropped.
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Some browsers/Excel-on-Mac send this generic type for .xlsx — allow it
    // since we still double-check the extension below.
    "application/octet-stream",
  ];
  const ext = path.extname(file.originalname).toLowerCase();

  // Security: check both MIME type AND extension.
  // MIME alone can be spoofed by a client sending a malicious file with a fake Content-Type.
  if (!allowedMimes.includes(file.mimetype) || ext !== ".xlsx") {
    return cb(new Error("Only .xlsx files are allowed"));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 70 * 1024 * 1024 },
});

const router = Router();

// verifyToken  →  requireAdmin  →  multer  →  handler
// A non-admin JWT is rejected before either file is even read.
// Admin uploads BOTH source files in one request: file_a (either the
// Supercrete or Holcim export, in either order) and file_b (the other one).
// The merge service figures out which is which by column fingerprint.
router.post(
  "/",
  verifyToken,
  requireAdmin,
  (req, res, next) => {
    upload.fields([
      { name: "file_a", maxCount: 1 },
      { name: "file_b", maxCount: 1 },
    ])(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  handleUpload,
);

export default router;
