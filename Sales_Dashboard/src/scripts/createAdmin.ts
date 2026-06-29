import bcrypt from "bcryptjs";
import { pool } from "../config/db";
import dotenv from "dotenv";

dotenv.config();

/**
 * Usage:
 *   npx ts-node scripts/createAdmin.ts
 *
 * Set these env vars (or hardcode temporarily and remove after):
 *   ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
 */
async function createAdmin() {
  const name = process.env.ADMIN_NAME || "Admin";
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "Change_me_1!";

  if (password === "Change_me_1!") {
    console.warn(
      "⚠️  Using default password — set ADMIN_PASSWORD in your environment.",
    );
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    if (existing.rows.length > 0) {
      console.log(`Admin with email "${email}" already exists. Nothing done.`);
      process.exit(0);
    }

    const hashed = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, name, email, role`,
      [name, email, hashed],
    );

    console.log("✅ Admin created:", result.rows[0]);
  } catch (err) {
    console.error("Failed to create admin:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createAdmin();
