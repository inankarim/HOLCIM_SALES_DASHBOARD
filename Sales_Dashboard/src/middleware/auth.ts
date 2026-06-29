import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
  };
}

export const verifyToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: number;
      email: string;
      role: string;
    };

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

/**
 * Must be used AFTER verifyToken in the middleware chain.
 * Rejects any authenticated user whose role is not 'admin'.
 */
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
};
