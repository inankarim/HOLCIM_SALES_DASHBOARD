import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { pool } from "../config/db";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const getRecipients = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const result = await pool.query(
      `SELECT id, email, label, created_at
       FROM email_recipients
       WHERE admin_user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId],
    );

    res.json({ recipients: result.rows });
  } catch (err) {
    console.error("Get recipients error:", err);
    res.status(500).json({ error: "Failed to fetch recipients." });
  }
};

export const addRecipient = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { email, label } = req.body;

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required." });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!emailPattern.test(cleanEmail) || cleanEmail.length > 254) {
      res.status(400).json({ error: "Invalid email address." });
      return;
    }

    const cleanLabel =
      typeof label === "string" ? label.trim().slice(0, 100) : null;

    const result = await pool.query(
      `INSERT INTO email_recipients (admin_user_id, email, label)
       VALUES ($1, $2, $3)
       ON CONFLICT (admin_user_id, email)
       DO UPDATE SET label = EXCLUDED.label
       RETURNING id, email, label, created_at`,
      [userId, cleanEmail, cleanLabel],
    );

    res.json({ recipient: result.rows[0] });
  } catch (err) {
    console.error("Add recipient error:", err);
    res.status(500).json({ error: "Failed to save recipient." });
  }
};

export const deleteRecipient = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const recipientId = Number(id);

    if (!Number.isInteger(recipientId) || recipientId <= 0) {
      res.status(400).json({ error: "Invalid recipient ID." });
      return;
    }

    const result = await pool.query(
      `DELETE FROM email_recipients
       WHERE id = $1 AND admin_user_id = $2
       RETURNING id`,
      [recipientId, userId],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Recipient not found." });
      return;
    }

    res.json({ message: "Recipient deleted." });
  } catch (err) {
    console.error("Delete recipient error:", err);
    res.status(500).json({ error: "Failed to delete recipient." });
  }
};
