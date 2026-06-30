import { Router } from "express";
import {
  getRecipients,
  addRecipient,
  deleteRecipient,
} from "../controllers/emailRecipientController";
import { verifyToken } from "../middleware/auth";

const router = Router();

router.get("/", verifyToken, getRecipients);
router.post("/", verifyToken, addRecipient);
router.delete("/:id", verifyToken, deleteRecipient);

export default router;
