import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/db";
import { body, validationResult } from "express-validator";

export const registerValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be 2-50 characters")
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage("Name can only contain letters"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail()
    .isLength({ max: 100 })
    .withMessage("Email too long"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8, max: 64 })
    .withMessage("Password must be 8-64 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain lowercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain a number")
    .matches(/[!@#$%^&*]/)
    .withMessage("Password must contain special character"),
];

export const loginValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail()
    .isLength({ max: 100 })
    .withMessage("Email too long"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8, max: 64 })
    .withMessage("Invalid password"),
];

export const register = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { name, email, password } = req.body;

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    if (existing.rows.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const hashed = await bcrypt.hash(password, 12);

    // Public registration always creates a 'user' — never an admin
    const result = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'user') RETURNING id, name, email, role",
      [name, email, hashed],
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    const user = result.rows[0];

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not defined");

    // Role is embedded in the token so middleware can check it without a DB call
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: "1d" },
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role, // frontend can use this to show/hide upload UI
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
};
