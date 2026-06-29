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

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimes = [
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];
  const allowedExts = [".csv", ".xls", ".xlsx"];

  const ext = path.extname(file.originalname).toLowerCase();

  // Security: check both MIME type AND extension.
  // MIME alone can be spoofed by a client sending a malicious file with a fake Content-Type.
  if (!allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) {
    return cb(new Error("Only .csv, .xls, and .xlsx files are allowed"));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

// verifyToken  →  requireAdmin  →  multer  →  handler
// A non-admin JWT is rejected before the file is even parsed
router.post(
  "/",
  verifyToken,
  requireAdmin,
  upload.single("file"),
  handleUpload,
);

export default router;
