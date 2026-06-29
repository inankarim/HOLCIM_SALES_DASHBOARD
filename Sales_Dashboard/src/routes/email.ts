import { Router } from "express";
import { sendDashboardEmail } from "../controllers/emailController";
import { verifyToken } from "../middleware/auth";

const router = Router();

// Only authenticated users (admin) can send emails
router.post("/send", verifyToken, sendDashboardEmail);

export default router;
