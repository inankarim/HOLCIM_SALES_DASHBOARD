import { Router } from "express";
import { sendDashboardEmail } from "../controllers/emailController";
import {
  getRecipients,
  addRecipient,
  deleteRecipient,
} from "../controllers/emailRecipientController";
import { verifyToken } from "../middleware/auth";

const router = Router();

// Only authenticated users (admin) can send emails
router.post("/send", verifyToken, sendDashboardEmail);

// Saved recipients management
router.get("/recipients", verifyToken, getRecipients);
router.post("/recipients", verifyToken, addRecipient);
router.delete("/recipients/:id", verifyToken, deleteRecipient);

export default router;
